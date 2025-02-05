import fs from "fs";
import os from "os";
import path from "path";

import {IDiff, IDiffToSend} from "../../interface";
import {cleanUpDeleteDiff, getDIffForDeletedFile, getDiffsBeingProcessed, handleNewFileUpload, isRelativePath, setDiffsBeingProcessed} from "../utils";
import {generateSettings} from "../../settings";
import {readYML} from "../../utils/common";
import {CodeSyncLogger} from "../../logger";
import {pathUtils} from "../../utils/path_utils";
import {initUtils} from "../../connect_repo/utils";
import {VSCODE} from "../../constants";
import { removeFile } from "../../utils/file_utils";

export class DiffHandler {
    fileRelPath: string;
    diffData: IDiff;
    diffFilePath: string;
    accessToken: string;

    repoPath: string;
    branch: string;
    commitHash: string|null;
    createdAt: string;
    addedAt: string;

    configJSON: any;
    configRepo: any;

    constructor(fileRelPath: string, diffData: IDiff, diffFilePath: string, accessToken: string) {
        this.fileRelPath = fileRelPath;
        this.diffData = diffData;
        this.repoPath = diffData.repo_path;
        this.branch = diffData.branch;
        this.commitHash = diffData.commit_hash;
        this.createdAt = diffData.created_at;
        this.addedAt = diffData.added_at;
        this.diffFilePath = diffFilePath;
        this.accessToken = accessToken;

        const settings = generateSettings();
        this.configJSON = readYML(settings.CONFIG_PATH);
        this.configRepo = this.configJSON.repos[this.repoPath];
    }

    async handleNewFile(deleteDiff=true) {
        /*
            Uploads new file to server and adds it in config
            Ignores if file is not present in .originals repo
        */
        const json = await handleNewFileUpload(
            this.accessToken, this.repoPath, this.branch, this.addedAt,
            this.fileRelPath, this.configRepo.id, this.configJSON, this.commitHash, 
            deleteDiff
        );

        // Clean up diff file
        if (json.deleteDiff) {
            this.cleanDiffFile();
            // Remove diff from diffsBeingProcessed
            const diffsBeingProcessed = getDiffsBeingProcessed();
            if (!diffsBeingProcessed.size) return;
            diffsBeingProcessed.delete(this.diffFilePath);
            setDiffsBeingProcessed(diffsBeingProcessed);
        }
        
        if (!json.uploaded) return this.configJSON;
        
        this.configJSON = json.config;
        return this.configJSON;
    }

    async forceUploadFile() {
        const pathUtilsObj = new pathUtils(this.repoPath, this.branch);
        const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
        const originalsFilePath = path.join(originalsRepoBranchPath, this.fileRelPath);
        if (!fs.existsSync(originalsFilePath)) {
            const initUtilsObj = new initUtils(this.repoPath, true);
            const filePath = path.join(this.repoPath, this.fileRelPath);
            initUtilsObj.copyFilesTo([filePath], originalsRepoBranchPath);
        }
        return await this.handleNewFile(false);
    }

    handleDeletedFile() {
        this.diffData.diff = getDIffForDeletedFile(this.repoPath, this.branch, this.fileRelPath, this.configJSON);
    }

    handleNonSyncedDeletedFile() {
        // It can be a directory delete
        CodeSyncLogger.error("is_deleted non-synced file found", path.join(this.repoPath, this.fileRelPath), this.configRepo.email);
        cleanUpDeleteDiff(this.repoPath, this.branch, this.fileRelPath,
            this.configJSON);
        this.cleanDiffFile();
    }

    handleEmptyDiff() {
        CodeSyncLogger.info(`Empty diff found in file: ${this.diffFilePath}`, this.configRepo.email);
        this.cleanDiffFile();
    }

    createDiffToSend(fileId: number) {
        return {
            'file_id': fileId,
            'commit_hash': this.diffData.commit_hash,
            'path': this.fileRelPath,
            'diff': this.diffData.diff,
            'is_deleted': this.diffData.is_deleted,
            'is_rename': this.diffData.is_rename,
            'is_binary': this.diffData.is_binary,
            'created_at': this.createdAt,
            'diff_file_path': this.diffFilePath,
            'source': VSCODE,
            'platform': os.platform()
        };
    }

    sendDiffToServer(webSocketConnection: any, diffToSend: IDiffToSend) {
        // Send diff to server
        webSocketConnection.send(JSON.stringify({'diffs': [diffToSend]}));
    }

    cleanDiffFile() {
        DiffHandler.removeDiffFile(this.diffFilePath);
    }

    static removeDiffFile(diffFilePath: string) {
        const settings = generateSettings();
        const relative = path.relative(settings.DIFFS_REPO, diffFilePath);
        const isRelative = isRelativePath(relative);
        if (!(isRelative && fs.existsSync(diffFilePath))) return;
        removeFile(diffFilePath, "removeDiffFile");
    }
}
