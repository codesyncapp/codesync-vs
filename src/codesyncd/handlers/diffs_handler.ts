import fs from "fs";

import {IFileToDiff, IRepoDiffs} from "../../interface";
import {putLogEvent} from "../../logger";
import {DAY} from "../../constants";
import {readYML} from "../../utils/common";
import {generateSettings} from "../../settings";
import {DiffHandler} from "./diff_handler";
import path from "path";

const WAITING_FILES = <any>{};

export class DiffsHandler {

    newFiles: string[] = [];

    diffsList: IFileToDiff[];
    accessToken: string;
    webSocketConnection: any;

    configJSON: any;
    configRepo: any;

    constructor(repoDiff: IRepoDiffs, accessToken: string, connection: any) {
        this.diffsList = repoDiff.file_to_diff;
        const settings = generateSettings();
        this.accessToken = accessToken;
        this.configJSON = readYML(settings.CONFIG_PATH);
        this.configRepo = this.configJSON.repos[repoDiff.repoPath];
        this.webSocketConnection = connection;
    }

    async run() {
        const validDiffs = [];
        // Iterate diffs
        for (const fileToDiff of this.diffsList) {
            const diffData = fileToDiff.diff;
            const diffFilePath = fileToDiff.file_path;
            const configFiles = this.configRepo.branches[diffData.branch];
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

            const fileId = configFiles[relPath];

            if (!fileId) {
                if (isDeleted) {
                    diffHandler.handleNonSyncedDeletedFile();
                    continue;
                }
                if (diffData.is_rename) continue;
                if (relPath in WAITING_FILES) {
                    const now = (new Date()).getTime() / 1000;
                    if ((now - WAITING_FILES[relPath]) > DAY) {
                        putLogEvent(`File ID not found for: ${relPath}`, this.configRepo.email);
                        delete WAITING_FILES[relPath];
                        fs.unlinkSync(diffFilePath);
                    }
                } else {
                    const filePath = path.join(diffData.repo_path, relPath);
                    if (!fs.existsSync(filePath)) {
                        fs.unlinkSync(diffFilePath);
                    } else {
                        WAITING_FILES[relPath] = (new Date()).getTime() / 1000;
                        if (this.newFiles.indexOf(relPath) > -1) {
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
            validDiffs.push(diffToSend);
        }

        if (!validDiffs.length) return;

        // console.log("Sending diffs @: ", Date.now());
        // Send all diffs to server
        this.webSocketConnection.send(JSON.stringify({'diffs': validDiffs}));
    }
}
