import fs from "fs";
import path from "path";

import { glob } from 'glob';
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
    getDefaultIgnorePatterns,
    getGlobIgnorePatterns,
    getSyncIgnoreItems,
    isEmpty,
    isUserActive,
    readFile,
    readYML,
    shouldIgnorePath
} from "../utils/common";
import {
    FORCE_UPLOAD_FROM_DAEMON,
    GLOB_TIME_TAKEN_THRESHOLD, 
    BRANCH_SYNC_TIMEOUT, 
    RUN_DELETE_HANDLER_AFTER, 
    RUN_POPULATE_BUFFER_AFTER, 
    RUN_POPULATE_BUFFER_CURRENT_REPO_AFTER, 
    SEQUENCE_MATCHER_RATIO
 } from "../constants";
import {eventHandler} from "../events/event_handler";
import { CodeSyncLogger } from "../logger";
import { CODESYNC_STATES, CodeSyncState } from "../utils/state_utils";
import { removeFile } from "../utils/file_utils";


export const populateBuffer = async (viaDaemon=true) => {
    if (!viaDaemon) return;
    // Return if any branch is being synced
    const isBranchSyncInProcess = CodeSyncState.canSkipRun(CODESYNC_STATES.IS_SYNCING_BRANCH, BRANCH_SYNC_TIMEOUT);
    if (isBranchSyncInProcess) return;
    const readyRepos = await detectBranchChange();
    await populateBufferForMissedEvents(readyRepos);
};

export const populateBufferForMissedEvents = async (readyRepos: any) => {
    // Return if populateBuffer is already running
    const isRunning = CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_RUNNING);
    if (isRunning) return;
    CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_RUNNING, true);
    const currentRepoPath = pathUtils.getRootPath();
    for (const repoPath of Object.keys(readyRepos)) {
        const branch = readyRepos[repoPath];
        const populateBufferKey = `${repoPath}:${branch}:populateBuffer`;
        // Adding more wait for currently opened repo
        const compareWith = repoPath === currentRepoPath ? RUN_POPULATE_BUFFER_CURRENT_REPO_AFTER : RUN_POPULATE_BUFFER_AFTER;
        const skipRunForRepo = CodeSyncState.canSkipRun(populateBufferKey, compareWith);

        if (skipRunForRepo) continue;
        CodeSyncState.set(populateBufferKey, new Date().getTime());
        const t0 = new Date().getTime();
        
        try {
            const populateBuffer = new PopulateBuffer(repoPath, branch);
            await populateBuffer.init();
            if (!populateBuffer.modifiedInPast) {
                await populateBuffer.run();
                const t1 = new Date().getTime();
                const timeTook = (t1 - t0) / 1000;
                if (timeTook > GLOB_TIME_TAKEN_THRESHOLD) {
                    CodeSyncLogger.warning(`populateBuffer took=${timeTook}s for ${repoPath}, files=${populateBuffer.itemPaths.length}`);
                }
            }
            const generateDiffForDeletedFilesKey = `${repoPath}:${branch}:generateDiffForDeletedFiles`;
            const canSkipDeleteHandler = CodeSyncState.canSkipRun(generateDiffForDeletedFilesKey, RUN_DELETE_HANDLER_AFTER);
            if (canSkipDeleteHandler) continue;
            populateBuffer.generateDiffForDeletedFiles();
            CodeSyncState.set(generateDiffForDeletedFilesKey, new Date().getTime());
            // Itereating only 1 repo in 1 iteration
            if (!populateBuffer.modifiedInPast) break;
        } catch (e) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            CodeSyncLogger.critical(`populateBuffer exited for ${repoPath}`, e.stack);
        }
    }
    CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_RUNNING, false);
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
    lastSyncedAtKey: string;
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
    defaultIgnorePatterns: string[];
    potentialMatchFiles: string[];
    gotPotentialMatchFiles: boolean;
    instanceUUID: string;

    constructor(repoPath: string, branch: string) {
        this.repoPath = repoPath;
        this.branch = branch;
        this.instanceUUID = CodeSyncState.get(CODESYNC_STATES.INSTANCE_UUID);
        this.lastSyncedAtKey = `${this.repoPath}:lastSyncedAt`;
        this.repoModifiedAt = -1;
        this.settings = generateSettings();
        this.repoBranchPath = path.join(this.repoPath, this.branch);
        this.initUtilsObj = new initUtils(this.repoPath, true);
        this.config = readYML(this.settings.CONFIG_PATH);
        const configRepo = this.config.repos[this.repoPath];
        this.configFiles = configRepo.branches[this.branch];
        this.renamedFiles = [];
        this.pathUtils = new pathUtils(this.repoPath, this.branch);
        this.shadowRepoBranchPath = this.pathUtils.getShadowRepoBranchPath();
        this.deletedRepoBranchPath = this.pathUtils.getDeletedRepoBranchPath();
        this.originalsRepoBranchPath = this.pathUtils.getOriginalsRepoBranchPath();
        this.syncIgnoreItems = getSyncIgnoreItems(this.repoPath);
        this.defaultIgnorePatterns = getDefaultIgnorePatterns();
        this.potentialMatchFiles = [];
        this.gotPotentialMatchFiles = false;
        this.itemPaths = [];
        this.modifiedInPast = false;
    }

    async init() {
        CodeSyncLogger.debug(`PopulateBuffer:init repo=${this.repoPath}, branch=${this.branch}, uuid=${this.instanceUUID}`);
        this.itemPaths = await this.initUtilsObj.getSyncablePaths();
        this.modifiedInPast = this.getModifiedInPast();
        CodeSyncLogger.debug(`PopulateBuffer:init:files files=${this.itemPaths.length}, repo=${this.repoPath}, branch=${this.branch}`);
    }

    getModifiedInPast() {
        const maxModifiedAt = Math.max(...this.itemPaths.map(itemPath => itemPath.modified_at || 0));
        const maxCreatedAt = Math.max(...this.itemPaths.map(itemPath => itemPath.created_at || 0));
        this.repoModifiedAt = Math.max(maxModifiedAt, maxCreatedAt);
        const lastSyncedAt = CodeSyncState.get(this.lastSyncedAtKey);
        // Set the value for next iteration
        CodeSyncState.set(this.lastSyncedAtKey, this.repoModifiedAt);
        return lastSyncedAt && lastSyncedAt >= this.repoModifiedAt;
    }

    async run() {
        CodeSyncLogger.debug(`PopulateBuffer:run repo=${this.repoPath}, branch=${this.branch}`);
        const handler = new eventHandler(this.repoPath, "", true);
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
            if (!shadowExists) {
                if (!this.gotPotentialMatchFiles) {
                    this.potentialMatchFiles = await this.getPotentialRenamedFiles();
                    this.gotPotentialMatchFiles = true;
                }
                const renameResult = this.checkForRename(itemPath.file_path);
                if (renameResult.isRename) {
                    const oldRelPath = renameResult.matchingFilePath.split(path.join(this.shadowRepoBranchPath, path.sep))[1];
                    isRename = oldRelPath !== itemPath.rel_path;
                    if (isRename) {
                        const oldFilePath = path.join(this.repoPath, oldRelPath);
                        handler.handleRename(oldFilePath, itemPath.file_path);
                        this.renamedFiles.push(oldRelPath);
                        // Remove matched file from potential matched files
                        const index = this.potentialMatchFiles.indexOf(renameResult.matchingFilePath);
                        if (index > -1) this.potentialMatchFiles.splice(index, 1);
                        continue;
                    }
                }
            }
            // If not handled in changesHandler and renameHandler, it must be new file
            const forceUpload = Boolean(itemPath.created_at && (new Date().getTime() - itemPath.created_at) > FORCE_UPLOAD_FROM_DAEMON);
            handler.handleNewFile(itemPath.file_path, forceUpload);
        }
    }

    async getPotentialRenamedFiles() {
        /*
        If a file is renamed in actual repo, it will be present in the shadow repo with pervious name.
        So potential renamed files in the shadow repo should possess following properties
        - Shadow file should not be ignorable from .syncignore
        - Actual file should not be present for the shadow file
        - Relative path of shadow file should be present in config file
        - Shadow file should not be a binary file since we are going to match the text of files
        - Shadow file should not be empty
         */
        const globIgnorePatterns = getGlobIgnorePatterns(this.shadowRepoBranchPath, this.syncIgnoreItems);
        // These are shadow files whose actual files are present in the repo
        const skipShadowRelPaths = this.itemPaths.map(itemPath => itemPath.rel_path);
        const t0 = new Date().getTime();
        const shadowRelPaths = await glob("**", { 
            cwd: this.shadowRepoBranchPath,
            ignore: globIgnorePatterns, 
            nodir: true, 
            dot: true
        });
        // Skip those shadow files whose actual files are present in the repo
        const filteredRelPaths = shadowRelPaths.filter(x => !skipShadowRelPaths.includes(x));
        // Get shadow paths from rel paths
        const shadowFilePaths = filteredRelPaths.map(shadowRelPath => path.join(this.shadowRepoBranchPath, shadowRelPath));
        // Itereate over filtered shadow file paths
        const filteredFiles = shadowFilePaths.filter(shadowFilePath => {
            const relPath = shadowFilePath.split(path.join(this.shadowRepoBranchPath, path.sep))[1];
            const isInConfig = relPath in this.configFiles;
            if (!isInConfig) {
                removeFile(shadowFilePath, "getPotentialRenamedFiles");
                return false;
            }
            const ignorablePath = shouldIgnorePath(relPath, this.defaultIgnorePatterns, this.syncIgnoreItems);
            // If file is not in config OR is is present in .syncignore, remove the file from .shadow
            if (ignorablePath) {
                removeFile(shadowFilePath, "getPotentialRenamedFiles");
                return false;
            }
            let isBinary = false;
            // Skip binary files
            try {
                isBinary = isBinaryFileSync(shadowFilePath);
            } catch (e) {
                CodeSyncLogger.error(`getPotentialRenamedFiles: isBinaryFileSync failed on ${shadowFilePath}`);
            }
            if (isBinary) return false;
            // Skip empty shadow files
            const content = readFile(shadowFilePath);
            if (!content) return false;
            return true;
        });
        CodeSyncLogger.debug(`getPotentialRenamedFiles: glob took=${(new Date().getTime() - t0)/1000}s, Files Count=${shadowRelPaths.length}, repoPath=${this.repoPath}`);
        return filteredFiles;
    }

    checkForRename(filePath: string) {
        let matchingFilePath = '';
        let matchingFilesCount = 0;
        if (!this.potentialMatchFiles.length) return {
            isRename: false,
            matchingFilePath
        };
        const content = readFile(filePath);
        if (!content) return {
                isRename: false,
                matchingFilePath
            };

        this.potentialMatchFiles.forEach(potentialMatchingFile => {
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
            const isIgnorablePath = shouldIgnorePath(relPath, this.defaultIgnorePatterns, this.syncIgnoreItems);
            if (isIgnorablePath  ||
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

		// Check if branch is already being synced, skip it
		const syncingBranchKey = `${CODESYNC_STATES.SYNCING_BRANCH}:${repoPath}:${branch}`;
		const isSyncInProcess = CodeSyncState.canSkipRun(syncingBranchKey, BRANCH_SYNC_TIMEOUT);
		if (isSyncInProcess) continue;

        const initUtilsObj = new initUtils(repoPath, true);
        let uploaded = false; 

        if (branch in configRepo.branches) {
            const configFiles = configRepo.branches[branch];
            if (isEmpty(configFiles)) continue;
            // If all files IDs are None in config.yml, we need to sync the branch
            const shouldSyncBranch = Object.values(configFiles).every(element => element === null);
            if (shouldSyncBranch) {
                const itemPaths = await initUtilsObj.getSyncablePaths();
                uploaded = await initUtilsObj.uploadRepo(branch, accessToken, itemPaths, configRepo.email);
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
            const itemPaths = await initUtilsObj.getSyncablePaths();
            uploaded = await initUtilsObj.uploadRepo(branch, accessToken, itemPaths, configRepo.email);
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
