import fs from "fs";

import {IFileToDiff} from "../../interface";
import {putLogEvent} from "../../logger";
import {DAY} from "../../constants";
import {readYML} from "../../utils/common";
import {generateSettings} from "../../settings";
import {DiffHandler} from "./diff_handler";

const WAITING_FILES = <any>{};

export class DiffsHandler {

    newFiles: string[] = [];

    diffsList: IFileToDiff[];
    accessToken: string;
    webSocketconnection: any;

    configJSON: any;
    configRepo: any;

    constructor(diffsList: IFileToDiff[], accessToken: string, repoPath: string, connection: any) {
        this.diffsList = diffsList;
        const settings = generateSettings();
        this.accessToken = accessToken;
        this.configJSON = readYML(settings.CONFIG_PATH);
        this.configRepo = this.configJSON.repos[repoPath];
        this.webSocketconnection = connection;
    }

    async run() {
        // Iterate diffs
        for (const fileToDiff of this.diffsList) {
            const diffData = fileToDiff.diff;
            const diffFilePath = fileToDiff.file_path;
            const configFiles = this.configRepo.branches[diffData.branch];
            const relPath = diffData.file_relative_path;
            const isBinary = diffData.is_binary;
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
            if (this.newFiles.includes(relPath)) {
                continue;
            }

            if (diffData.is_rename) {
                const oldRelPath = JSON.parse(diffData.diff).old_rel_path;
                // If old_rel_path uploaded in the same iteration, wait for next iteration
                if (this.newFiles.includes(oldRelPath)) {
                    continue;
                }
            }

            if (!isBinary && !isDeleted && !diffData.diff) {
                diffHandler.handleEmptyDiff();
                continue;
            }

            const fileId = configFiles[relPath];

            if (isDeleted && !fileId) {
                diffHandler.handleNonSyncedDeletedFile();
                continue;
            }

            if (!fileId && !isDeleted && !diffData.is_rename) {
                if (relPath in WAITING_FILES) {
                    const now = (new Date()).getTime() / 1000;
                    if ((now - WAITING_FILES[relPath]) > DAY) {
                        putLogEvent(`File ID not found for: ${relPath}`, this.configRepo.email);
                        delete WAITING_FILES[relPath];
                        fs.unlinkSync(diffFilePath);
                    }
                } else {
                    WAITING_FILES[relPath] = (new Date()).getTime() / 1000;
                    if (this.newFiles.indexOf(relPath) > -1) {
                        this.newFiles.push(relPath);
                    }
                    this.configJSON = diffHandler.forceUploadFile();
                }
                continue;
            }

            if (isDeleted && fileId) {
                diffHandler.handleDeletedFile();
            }

            // Diff data to be sent to server
            const diffToSend = diffHandler.createDiffToSend(fileId);
            // Send Diff to server
            diffHandler.sendDiffToServer(this.webSocketconnection, diffToSend);
        }
    }
}
