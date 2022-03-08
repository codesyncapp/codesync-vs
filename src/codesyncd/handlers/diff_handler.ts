import fs from "fs";
import os from "os";
import path from "path";

import {IDiff, IDiffToSend} from "../../interface";
import {cleanUpDeleteDiff, getDIffForDeletedFile, handleNewFileUpload} from "../utils";
import {generateSettings} from "../../settings";
import {readYML} from "../../utils/common";
import {putLogEvent} from "../../logger";
import {pathUtils} from "../../utils/path_utils";
import {initUtils} from "../../init/utils";
import {DIFF_SOURCE} from "../../constants";

export class DiffHandler {
    fileRelPath: string;
    diffData: IDiff;
    diffFilePath: string;
    accessToken: string;

    repoPath: string;
    branch: string;
    createdAt: string;

    configJSON: any;
    configRepo: any;

    constructor(fileRelPath: string, diffData: IDiff, diffFilePath: string, accessToken: string) {
        this.fileRelPath = fileRelPath;
        this.diffData = diffData;
        this.repoPath = diffData.repo_path;
        this.branch = diffData.branch;
        this.createdAt = diffData.created_at;
        this.diffFilePath = diffFilePath;
        this.accessToken = accessToken;

        const settings = generateSettings();
        this.configJSON = readYML(settings.CONFIG_PATH);
        this.configRepo = this.configJSON.repos[this.repoPath];
    }

    async handleNewFile() {
        /*
            Uploads new file to server and adds it in config
            Ignores if file is not present in .originals repo
        */
        const json = await handleNewFileUpload(this.accessToken, this.repoPath, this.branch, this.createdAt,
            this.fileRelPath, this.configRepo.id, this.configJSON);
        if (!json.uploaded) {
            return this.configJSON;
        }
        this.configJSON = json.config;
        this.cleanDiffFile();
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
        return await this.handleNewFile();
    }

    handleDeletedFile() {
        this.diffData.diff = getDIffForDeletedFile(this.repoPath, this.branch, this.fileRelPath, this.configJSON);
    }

    handleNonSyncedDeletedFile() {
        // It can be a directory delete
        putLogEvent(`is_deleted non-synced file found: ${path.join(this.repoPath, this.fileRelPath)}`,
            this.configRepo.email);
        cleanUpDeleteDiff(this.repoPath, this.branch, this.fileRelPath,
            this.configJSON);
        this.cleanDiffFile();
    }

    handleEmptyDiff() {
        putLogEvent(`Empty diff found in file: ${this.diffFilePath}`, this.configRepo.email);
        this.cleanDiffFile();
    }

    createDiffToSend(fileId: number) {
        return {
            'file_id': fileId,
            'path': this.fileRelPath,
            'diff': this.diffData.diff,
            'is_deleted': this.diffData.is_deleted,
            'is_rename': this.diffData.is_rename,
            'is_binary': this.diffData.is_binary,
            'created_at': this.createdAt,
            'diff_file_path': this.diffFilePath,
            'source': DIFF_SOURCE,
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
        const isRelative = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        if (isRelative && fs.existsSync(diffFilePath)) {
            try {
                fs.unlinkSync(diffFilePath);
            } catch (e) {
                // pass
            }
        }
    }
}
