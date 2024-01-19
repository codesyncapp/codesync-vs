import fs from "fs";
import path from "path";

import {IDiffToSend, IFileToDiff, IRepoDiffs} from "../../interface";
import {CodeSyncLogger} from "../../logger";
import {DIFF_SIZE_LIMIT, FILE_UPLOAD_WAIT_TIMEOUT} from "../../constants";
import {readYML} from "../../utils/common";
import {generateSettings} from "../../settings";
import {DiffHandler} from "./diff_handler";
import { removeFile } from "../../utils/file_utils";

const WAITING_FILES = <any>{};

export class DiffsHandler {

    newFiles: string[] = [];

    diffsList: IFileToDiff[];
    accessToken: string;

    configJSON: any;
    configRepo: any;

    constructor(repoDiff: IRepoDiffs, accessToken: string) {
        this.diffsList = repoDiff.file_to_diff;
        const settings = generateSettings();
        this.accessToken = accessToken;
        this.configJSON = readYML(settings.CONFIG_PATH);
        this.configRepo = this.configJSON.repos[repoDiff.repoPath];
    }

    async run() {
        const validDiffs: IDiffToSend[] = [];
        // order by is_new_file, will upload new files first and then will go for diffs upload
        const newFilesDiffs = this.diffsList.filter(diffFile => diffFile.diff.is_new_file);
        const otherDiffs = this.diffsList.filter(x => !newFilesDiffs.includes(x));
        const orderedDiffFiles = [...newFilesDiffs, ...otherDiffs];
		let diffsSize = 0;
        // Iterate diffs
        for (const fileToDiff of orderedDiffFiles) {
            try {
                const diffData = fileToDiff.diff;
                const diffFilePath = fileToDiff.file_path;
                const configFiles = this.configRepo.branches[diffData.branch];
                if (!configFiles) continue;
                // If all files IDs are None in config.yml, we need to sync the branch first
                const shouldSyncBranch = Object.values(configFiles).every(element => element === null);
                if (shouldSyncBranch) continue;
                const relPath = diffData.file_relative_path;
                const isDeleted = diffData.is_deleted;

                const diffHandler = new DiffHandler(relPath, diffData, diffFilePath, this.accessToken);

                if (diffData.is_new_file) {
                    if (!this.newFiles.includes(relPath)) {
                        this.newFiles.push(relPath);
                    }
                    this.configJSON = await diffHandler.handleNewFile();
                    continue;   
                }

                // Skip the changes diffs if relevant file was uploaded in the same iteration, wait for next iteration
                if (this.newFiles.includes(relPath)) continue;

                if (diffData.is_rename) {
                    const oldRelPath = JSON.parse(diffData.diff).old_rel_path;
                    // If old_rel_path uploaded in the same iteration, wait for next iteration
                    if (this.newFiles.includes(oldRelPath)) {
                        continue;
                    }
                }

                const fileId = configFiles[relPath];

                if (!fileId) {
                    if (isDeleted) {
                        diffHandler.handleNonSyncedDeletedFile();
                        continue;
                    }
                    if (diffData.is_rename) {
                        this.configJSON = await diffHandler.forceUploadFile();
                        continue;
                    }
                    if (relPath in WAITING_FILES) {
                        const now = (new Date()).getTime() / 1000;
                        if ((now - WAITING_FILES[relPath]) > FILE_UPLOAD_WAIT_TIMEOUT) {
                            CodeSyncLogger.error("diffsHandler: File ID not found", relPath, this.configRepo.email);
                            delete WAITING_FILES[relPath];
                            removeFile(diffFilePath, "DiffHandler.run");
                        }
                    } else {
                        const filePath = path.join(diffData.repo_path, relPath);
                        if (!fs.existsSync(filePath)) {
                            removeFile(diffFilePath, "DiffHandler.run");
                        } else {
                            WAITING_FILES[relPath] = (new Date()).getTime() / 1000;
                            if (!this.newFiles.includes(relPath)) {
                                this.newFiles.push(relPath);
                            }
                            this.configJSON = await diffHandler.forceUploadFile();
                        }
                    }
                    continue;
                }

                if (isDeleted) {
                    diffHandler.handleDeletedFile();
                }
                // Diff data to be sent to server
                const diffToSend = diffHandler.createDiffToSend(fileId);
                diffsSize += JSON.stringify(diffToSend).length;
                // Websocket can only accept data upto 16MB, for above than that, we are reducing number of diffs per iteration to remain under limit.
                if (diffsSize > DIFF_SIZE_LIMIT) continue;
                validDiffs.push(diffToSend);
            } catch (e) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                CodeSyncLogger.critical("Error handling diff", e.stack);
            }
        }
        if (diffsSize > DIFF_SIZE_LIMIT) {
            CodeSyncLogger.error(`Diffs size increasing limit, size=${diffsSize} bytes`);
        }
        return validDiffs;
    }
}
