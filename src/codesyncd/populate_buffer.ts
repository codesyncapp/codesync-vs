import fs from "fs";
import path from "path";
import walk from "walk";
import ignore from "ignore";
import {isBinaryFileSync} from "isbinaryfile";

import {putLogEvent} from "../logger";
import {initUtils} from "../init/utils";
import {IFileToUpload, IUserPlan} from "../interface";
import {initHandler} from "../init/init_handler";
import {similarity} from "./utils";
import {generateSettings} from "../settings";
import {pathUtils} from "../utils/path_utils";
import {
    formatDatetime,
    getBranch,
    getSkipRepos,
    getSyncIgnoreItems,
    isEmpty,
    readYML
} from "../utils/common";
import { SEQUENCE_MATCHER_RATIO } from "../constants";
import {eventHandler} from "../events/event_handler";


export const populateBuffer = async (viaDaemon=false) => {
    const readyRepos = await detectBranchChange();
    await populateBufferForMissedEvents(readyRepos, viaDaemon);
};

export const populateBufferForMissedEvents = async (readyRepos: any, viaDaemon=false) => {
    for (const repoPath of Object.keys(readyRepos)) {
        const branch = readyRepos[repoPath];
        const obj = new PopulateBuffer(repoPath, branch, viaDaemon);
        if (!obj.modifiedInPast) {
            // Go for content diffs if repo was modified after lastSyncedAt
            await obj.populateBufferForRepo();
        }
        obj.generateDiffForDeletedFiles();
        // Update lastSyncedAt in global
        (global as any).lastSyncedAt[repoPath] = obj.repoModifiedAt;
    }
};


class PopulateBuffer {
    /*
        This class will handle non-IDE events, it will look through the files in
            1. config.yml file
            2. shadow repo
            3. project files
        To see if changes were made that were not captured by the IDE, if yes then a new diff file for those changes will
        be created and placed in the .diff directory.
        Changes that will be detected are
        1. new file creation events.
            If we find a file that is present in the project directory and is not present in shadow repo or
            the config file and is not a rename (We will detect this in step 2) then file must be newly created.
        2. file rename events
            If we find a new file whose content match with some file in the shadow repo,
            then file is probably a rename of that shadow file.
        3. file change events
            This is the simplest to handle, if the project file and shadow file do not have the same
            content then it means file was updated.
        4. file delete events
            If a file is not in the project repo but is present in the shadow repo and the config file then it was deleted.
    */

    repoPath: string;
    branch: string;
    viaDaemon: boolean;
    repoBranchPath: string;
    repoModifiedAt: number;
    modifiedInPast: boolean;
    itemPaths: IFileToUpload[];
    config: any;
    configFiles: any;
    renamedFiles: string[];
    settings: any;
    initUtilsObj: any;
    pathUtils: any;
    shadowRepoBranchPath: string;
    deletedRepoBranchPath: string;
    originalsRepoBranchPath: string;

    constructor(repoPath: string, branch: string, viaDaemon=false) {
        this.repoPath = repoPath;
        this.branch = branch;
        this.viaDaemon = viaDaemon;
        this.repoModifiedAt = -1;
        this.settings = generateSettings();
        this.repoBranchPath = path.join(this.repoPath, this.branch);
        this.initUtilsObj = new initUtils(this.repoPath, true);
        this.itemPaths = this.initUtilsObj.getSyncablePaths(<IUserPlan>{}, true);
        this.modifiedInPast = this.getModifiedInPast();
        this.config = readYML(this.settings.CONFIG_PATH);
        const configRepo = this.config.repos[this.repoPath];
        this.configFiles = configRepo.branches[this.branch];
        this.renamedFiles = [];
        this.pathUtils = new pathUtils(this.repoPath, this.branch);
        this.shadowRepoBranchPath = this.pathUtils.getShadowRepoBranchPath();
        this.deletedRepoBranchPath = this.pathUtils.getDeletedRepoBranchPath();
        this.originalsRepoBranchPath = this.pathUtils.getOriginalsRepoBranchPath();
    }

    getModifiedInPast() {
        const maxModifiedAt = Math.max(...this.itemPaths.map(itemPath => itemPath.modified_at));
        const maxCreatedAt = Math.max(...this.itemPaths.map(itemPath => itemPath.created_at));
        this.repoModifiedAt = Math.max(maxModifiedAt, maxCreatedAt);
        let lastSyncedAt;
        if (!(global as any).lastSyncedAt) {
            (global as any).lastSyncedAt = <any>{};
        } else {
            lastSyncedAt = (global as any).lastSyncedAt[this.repoPath];
        }
        return lastSyncedAt && lastSyncedAt >= this.repoModifiedAt;
    }

    async populateBufferForRepo() {
        console.log(`Watching Repo: ${this.repoPath}`);
        for (const itemPath of this.itemPaths) {
            let isRename = false;
            const shadowFilePath = path.join(this.shadowRepoBranchPath, itemPath.rel_path);
            const shadowExists = fs.existsSync(shadowFilePath);
            const fileInConfig = itemPath.rel_path in this.configFiles;
            const createdAt = formatDatetime(itemPath.modified_at);

            const handler = new eventHandler(this.repoPath, createdAt, this.viaDaemon);

            // For binary file, can only handle create event
            if (itemPath.is_binary) {
                if (!fileInConfig) {
                    // Upload new binary file
                    handler.handleNewFile(itemPath.file_path);
                }
                continue;
            }
            // It is a change event
            if (fileInConfig) {
                // Read latest content of the file
                const currentContent = fs.readFileSync(itemPath.file_path, "utf8");
                handler.handleChanges(itemPath.file_path, currentContent);
                continue;
            }
            // If rel_path is not in configFiles and shadow does not exists, can be a rename OR deleted file
            if (!shadowExists) {
                const renameResult = this.checkForRename(itemPath.file_path);
                if (renameResult.isRename) {
                    const oldRelPath = renameResult.shadowFilePath.split(path.join(this.shadowRepoBranchPath, path.sep))[1];
                    isRename = oldRelPath !== itemPath.rel_path;
                    if (isRename) {
                        const oldFilePath = path.join(this.repoPath, oldRelPath);
                        handler.handleRename(oldFilePath, itemPath.file_path);
                        this.renamedFiles.push(oldRelPath);
                        continue;
                    }
                }
            }
            // If not handled in changesHandler and renameHandler, it must be new file
            handler.handleNewFile(itemPath.file_path);
        }
    }

    checkForRename(filePath: string) {
        // Check for rename only for non-empty files
        const repoPath = this.repoPath;
        const shadowRepoBranchPath = this.shadowRepoBranchPath;
        let shadowFilePath = '';
        let matchingFilesCount = 0;
        const content = fs.readFileSync(filePath, "utf8");
        if (!content) {
            return {
                isRename: false,
                shadowFilePath
            };
        }
        const syncIgnoreItems = getSyncIgnoreItems(this.repoPath);
        const ig = ignore().add(syncIgnoreItems);
        const skipRepos = getSkipRepos(repoPath, syncIgnoreItems);

        const options = {
            filters: skipRepos,
            listeners: {
                file: function (root: string, fileStats: any, next: any) {
                    const oldFilePath = path.join(root, fileStats.name);
                    const relPath = oldFilePath.split(path.join(shadowRepoBranchPath, path.sep))[1];
                    const isBinary = isBinaryFileSync(oldFilePath);
                    // skip syncIgnored files
                    const shouldIgnore = ig.ignores(relPath);
                    if (shouldIgnore) {
                        return next();
                    }
                    // Skip binary files
                    if (isBinary) {
                        return next();
                    }
                    // Ignore shadow files whose actual files exist in the repo
                    const actualFilePath = path.join(repoPath, relPath);
                    if (fs.existsSync(actualFilePath)) {
                        return next();
                    }
                    const shadowContent = fs.readFileSync(oldFilePath, "utf8");
                    const ratio = similarity(content, shadowContent);
                    if (ratio > SEQUENCE_MATCHER_RATIO) {
                        shadowFilePath = oldFilePath;
                        matchingFilesCount += 1;
                    }
                    return next();
                }
            }
        };

        walk.walkSync(shadowRepoBranchPath, options);
        return {
            isRename: matchingFilesCount === 1,
            shadowFilePath
        };
    }

    generateDiffForDeletedFiles() {
        /*
         Pick files that are present in config.yml but
         - is sync able file
         - not present in actual repo
         - is not in renamed files
         - not present in .deleted repo
         - present in .shadow repo
        */
        const activeRelPaths = this.itemPaths.map(itemPath => itemPath.rel_path);
        Object.keys(this.configFiles).forEach(relPath => {
            // Cache path of file
            const cacheFilePath = path.join(this.deletedRepoBranchPath, relPath);
            const shadowFilePath = path.join(this.shadowRepoBranchPath, relPath);
            // See if should discard this file
            if (!this.initUtilsObj.isSyncAble(relPath) ||
                activeRelPaths.includes(relPath) ||
                this.renamedFiles.includes(relPath) ||
                fs.existsSync(cacheFilePath) ||
                !fs.existsSync(shadowFilePath)) {
                return;
            }
            const filePath = path.join(this.repoPath, relPath);
            const handler = new eventHandler(this.repoPath);
            handler.handleDelete(filePath);
        });
    }
}

export const detectBranchChange = async () => {
    /*
    * See if repo is in config.yml and is active
    * Check if associated user has an access token
    */
    const settings = generateSettings();
    const configJSON = readYML(settings.CONFIG_PATH);
    const users = readYML(settings.USER_PATH) || {};
    const readyRepos = <any>{};
    for (const repoPath of Object.keys(configJSON.repos)) {

        if (configJSON.repos[repoPath].is_disconnected) continue;

        const configRepo = configJSON.repos[repoPath];
        if (!(configRepo.email in users)) continue;

        const accessToken = users[configRepo.email].access_token;
        const userEmail = configRepo.email;
        if (!accessToken) {
            putLogEvent(`Access token not found for repo: ${repoPath}, ${userEmail}`, userEmail);
            continue;
        }
        const branch = getBranch(repoPath);
        const pathUtilsObj = new pathUtils(repoPath, branch);

        const shadowRepo = pathUtilsObj.getShadowRepoPath();

        if (!fs.existsSync(repoPath) || !fs.existsSync(shadowRepo)) {
            // TODO: Handle out of sync repo
            continue;
        }

        const initUtilsObj = new initUtils(repoPath, true);

        if (branch in configRepo.branches) {
            const configFiles = configRepo['branches'][branch];
            if (isEmpty(configFiles)) continue;
            // If all files IDs are None in config.yml, we need to sync the branch
            const shouldSyncBranch = Object.values(configFiles).every(element => element === null);
            if (shouldSyncBranch) {
                const itemPaths = initUtilsObj.getSyncablePaths(<IUserPlan>{}, true);
                await initUtilsObj.uploadRepo(branch, accessToken, itemPaths, configRepo.email, false);
            }
            readyRepos[repoPath] = branch;
            continue;
        }
        // Need to sync the branch
        const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
        const originalsRepoExists = fs.existsSync(originalsRepoBranchPath);

        if (originalsRepoExists) {
            // init has been called, now see if we can upload the repo/branch
            const itemPaths = initUtilsObj.getSyncablePaths(<IUserPlan>{}, true);
            await initUtilsObj.uploadRepo(branch, accessToken, itemPaths, configRepo.email, false);
        } else {
            const handler = new initHandler(repoPath, accessToken, true);
            await handler.syncRepo();
        }
        readyRepos[repoPath] = branch;
    }
    return readyRepos;
};
