import fs from "fs";
import path from "path";

import { globSync } from 'glob';
import {isBinaryFileSync} from "isbinaryfile";
import stringSimilarity from "string-similarity";

import {initUtils} from "../init/utils";
import {IFileToUpload} from "../interface";
import {initHandler} from "../init/init_handler";
import {generateSettings} from "../settings";
import {pathUtils} from "../utils/path_utils";
import {
    formatDatetime,
    getBranch,
    getSkipPaths,
    getSyncIgnoreItems,
    isEmpty,
    isIgnoreAblePath,
    isUserActive,
    readFile,
    readYML
} from "../utils/common";
import { SEQUENCE_MATCHER_RATIO } from "../constants";
import {eventHandler} from "../events/event_handler";
import { CodeSyncLogger } from "../logger";


export const populateBuffer = async (viaDaemon=true) => {
    if (!viaDaemon) return;
    const readyRepos = await detectBranchChange();
    await populateBufferForMissedEvents(readyRepos);
};

export const populateBufferForMissedEvents = async (readyRepos: any) => {
    for (const repoPath of Object.keys(readyRepos)) {
        const branch = readyRepos[repoPath];
        const obj = new PopulateBuffer(repoPath, branch);
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
    syncIgnoreItems: string[];

    constructor(repoPath: string, branch: string) {
        this.repoPath = repoPath;
        this.branch = branch;
        this.repoModifiedAt = -1;
        this.settings = generateSettings();
        this.repoBranchPath = path.join(this.repoPath, this.branch);
        this.initUtilsObj = new initUtils(this.repoPath, true);
        this.itemPaths = this.initUtilsObj.getSyncablePaths();
        this.modifiedInPast = this.getModifiedInPast();
        this.config = readYML(this.settings.CONFIG_PATH);
        const configRepo = this.config.repos[this.repoPath];
        this.configFiles = configRepo.branches[this.branch];
        this.renamedFiles = [];
        this.pathUtils = new pathUtils(this.repoPath, this.branch);
        this.shadowRepoBranchPath = this.pathUtils.getShadowRepoBranchPath();
        this.deletedRepoBranchPath = this.pathUtils.getDeletedRepoBranchPath();
        this.originalsRepoBranchPath = this.pathUtils.getOriginalsRepoBranchPath();
        this.syncIgnoreItems = getSyncIgnoreItems(this.repoPath);
    }

    getModifiedInPast() {
        const maxModifiedAt = Math.max(...this.itemPaths.map(itemPath => itemPath.modified_at || 0));
        const maxCreatedAt = Math.max(...this.itemPaths.map(itemPath => itemPath.created_at || 0));
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
        const handler = new eventHandler(this.repoPath, "", true);
        const potentialMatchFiles = this.getPotentialRenamedFiles();
        for (const itemPath of this.itemPaths) {
            let isRename = false;
            const shadowFilePath = path.join(this.shadowRepoBranchPath, itemPath.rel_path);
            const shadowExists = fs.existsSync(shadowFilePath);
            const fileInConfig = itemPath.rel_path in this.configFiles;
            // Reset values for each file
            handler.isNewFile = false;
            handler.isRename = false;
            handler.isDelete = false;
            handler.createdAt = formatDatetime(itemPath.created_at);
            
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
                handler.createdAt = formatDatetime(itemPath.modified_at);
                // Read latest content of the file
                const currentContent = readFile(itemPath.file_path);
                handler.handleChanges(itemPath.file_path, currentContent);
                continue;
            }
            // If rel_path is not in configFiles and shadow does not exist, can be a new file OR a rename
            if (!shadowExists && potentialMatchFiles.length) {
                const renameResult = this.checkForRename(itemPath.file_path, potentialMatchFiles);
                if (renameResult.isRename) {
                    const oldRelPath = renameResult.matchingFilePath.split(path.join(this.shadowRepoBranchPath, path.sep))[1];
                    isRename = oldRelPath !== itemPath.rel_path;
                    if (isRename) {
                        const oldFilePath = path.join(this.repoPath, oldRelPath);
                        handler.handleRename(oldFilePath, itemPath.file_path);
                        this.renamedFiles.push(oldRelPath);
                        // Remove matched file from potential matched files
                        const index = potentialMatchFiles.indexOf(renameResult.matchingFilePath);
                        if (index > -1) potentialMatchFiles.splice(index, 1);
                        continue;
                    }
                }
            }
            // If not handled in changesHandler and renameHandler, it must be new file
            handler.handleNewFile(itemPath.file_path);
        }
    }

    getPotentialRenamedFiles() {
        /*
        If a file is renamed in actual repo, it will be present in the shadow repo with pervious name.
        So potential renamed files in the shadow repo should possess following properties
        - Actual file should not be present for the shadow file
        - Relative path of shadow file should be present in config file
        - Shadow file should not be a binary file since we are going to match the text of files
        - Shadow file should not be empty
         */
        const skipPaths = getSkipPaths(this.shadowRepoBranchPath, this.syncIgnoreItems);
        const shadowFiles = globSync(`${this.shadowRepoBranchPath}/**`, { ignore: skipPaths, nodir: true, dot: true });
        const filteredFiles = shadowFiles.filter(shadowFilePath => {
            const relPath = shadowFilePath.split(path.join(this.shadowRepoBranchPath, path.sep))[1];
            const shouldIgnorePath = isIgnoreAblePath(relPath, this.syncIgnoreItems);
			if (shouldIgnorePath) return;
            if (!(relPath in this.configFiles)) {
                fs.unlink(shadowFilePath, err => {
                    if (!err) return;
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    CodeSyncLogger.error("getPotentialRenamedFiles: Error deleting shadow file", shadowFilePath, err);
                });
                return false;
            }
            // Skip the shadow files that have corresponding files in the project repo
            const actualFilePath = path.join(this.repoPath, relPath);
            if (fs.existsSync(actualFilePath)) return false;
            // Skip binary files
            const isBinary = isBinaryFileSync(shadowFilePath);
            if (isBinary) return false;
            // Skip empty shadow files
            const content = readFile(shadowFilePath);
            if (!content) return false;
            return true;
        });
        return filteredFiles;
    }

    checkForRename(filePath: string, potentialMatchingFiles: string[]) {
        let matchingFilePath = '';
        let matchingFilesCount = 0;
        const content = readFile(filePath);
        if (!content) return {
                isRename: false,
                matchingFilePath
            };

        potentialMatchingFiles.forEach(potentialMatchingFile => {
            const shadowContent = readFile(potentialMatchingFile);
            const ratio = stringSimilarity.compareTwoStrings(content, shadowContent);
            if (ratio > SEQUENCE_MATCHER_RATIO) {
                matchingFilePath = potentialMatchingFile;
                matchingFilesCount += 1;
            }
        });

        return {
            isRename: matchingFilesCount === 1,
            matchingFilePath
        };
    }

    generateDiffForDeletedFiles() {
        /*
         Pick files that are present in config.yml and
         - is sync able file
         - is not present in actual repo
         - is not in renamed files
         - not present in .deleted repo
         - present in .shadow repo
        */
        const activeRelPaths = this.itemPaths.map(itemPath => itemPath.rel_path);
        const handler = new eventHandler(this.repoPath);
        Object.keys(this.configFiles).forEach(relPath => {
            // Cache path of file
            const cacheFilePath = path.join(this.deletedRepoBranchPath, relPath);
            const shadowFilePath = path.join(this.shadowRepoBranchPath, relPath);
            // See if should discard this file
            if (isIgnoreAblePath(relPath, this.syncIgnoreItems) ||
                activeRelPaths.includes(relPath) ||
                this.renamedFiles.includes(relPath) ||
                fs.existsSync(cacheFilePath) ||
                !fs.existsSync(shadowFilePath)) {
                return;
            }
            const filePath = path.join(this.repoPath, relPath);
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

        const user = users[configRepo.email];
        if (!isUserActive(user)) continue;

        const accessToken = user.access_token;
        const branch = getBranch(repoPath);
        const pathUtilsObj = new pathUtils(repoPath, branch);

        const shadowRepo = pathUtilsObj.getShadowRepoPath();

        if (!fs.existsSync(repoPath) || !fs.existsSync(shadowRepo)) {
            // TODO: Handle out of sync repo
            continue;
        }

        const initUtilsObj = new initUtils(repoPath, true);
        let uploaded = false; 

        if (branch in configRepo.branches) {
            const configFiles = configRepo.branches[branch];
            if (isEmpty(configFiles)) continue;
            // If all files IDs are None in config.yml, we need to sync the branch
            const shouldSyncBranch = Object.values(configFiles).every(element => element === null);
            if (shouldSyncBranch) {
                const itemPaths = initUtilsObj.getSyncablePaths();
                uploaded = await initUtilsObj.uploadRepo(branch, accessToken, itemPaths, configRepo.email, false);
                if (!uploaded) continue;    
            }
            // By default, add repo to readyRepos
            readyRepos[repoPath] = branch;
            continue;
        }
        // Need to sync the branch
        const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
        const originalsRepoExists = fs.existsSync(originalsRepoBranchPath);

        if (originalsRepoExists) {
            // init has been called, now see if we can upload the repo/branch
            const itemPaths = initUtilsObj.getSyncablePaths();
            uploaded = await initUtilsObj.uploadRepo(branch, accessToken, itemPaths, configRepo.email, false);
        } else {
            const handler = new initHandler(repoPath, accessToken, true);
            uploaded = await handler.connectRepo();
        }
        if (uploaded) {
            readyRepos[repoPath] = branch;
        }
    }

    return readyRepos;
};
