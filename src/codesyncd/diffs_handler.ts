import fs from "fs";

import {IFileToDiff} from "../interface";
import {putLogEvent} from "../logger";
import {DAY} from "../constants";
import {readYML} from "../utils/common";
import {generateSettings} from "../settings";
import {diffHandler} from "./diffHandler";

const WAITING_FILES = <any>{};

export class diffsHandler {

    diffsList: IFileToDiff[];
    newFiles: string[] = [];
    accessToken: string;
    connection: any;

    configJSON: any;
    configRepo: any;

    constructor(diffsList: IFileToDiff[], accessToken: string, repoPath: string, connection: any) {
        this.diffsList = diffsList;
        this.connection = connection;
        const settings = generateSettings();
        this.accessToken = accessToken;
        this.configJSON = readYML(settings.CONFIG_PATH);
        this.configRepo = this.configJSON.repos[repoPath];
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

            const diffHandlerObj = new diffHandler(relPath, diffData, diffFilePath, this.accessToken);

            if (diffData.is_new_file) {
                if (!this.newFiles.includes(relPath)) {
                    this.newFiles.push(relPath);
                }
                this.configJSON = await diffHandlerObj.handleNewFile();
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
                diffHandlerObj.handleEmptyDiff();
                continue;
            }

            const fileId = configFiles[relPath];

            if (isDeleted && !fileId) {
                diffHandlerObj.handleNonSyncedDeletedFile();
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
                    this.configJSON = diffHandlerObj.forceUploadFile();
                }
                continue;
            }

            if (isDeleted && fileId) {
                diffHandlerObj.handleDeletedFile();
            }

            // Diff data to be sent to server
            const diffToSend = diffHandlerObj.createDiffToSend(fileId);
            // Send diff to server
            this.connection.send(JSON.stringify({'diffs': [diffToSend]}));
        }
    }
}
