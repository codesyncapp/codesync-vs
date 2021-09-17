import fs from "fs";
import path from "path";
import walk from "walk";
import dateFormat from "dateformat";
import getBranchName from "current-git-branch";
import ignore from "ignore";
import {isBinaryFileSync} from "isbinaryfile";

import { getSkipRepos, getSyncIgnoreItems, readYML } from "../utils/common";
import {
    DATETIME_FORMAT,
    DEFAULT_BRANCH,
    FILE_SIZE_AS_COPY,
    SEQUENCE_MATCHER_RATIO
} from "../constants";
import {putLogEvent} from "../logger";
import {initUtils} from "../init/utils";
import {IFileToUpload, IUserPlan} from "../interface";
import {syncRepo} from "../init/init_handler";
import {similarity} from "./utils";
import {diff_match_patch} from "diff-match-patch";
import {manageDiff} from "../events/diff_utils";
import {generateSettings} from "../settings";


export const populateBuffer = async () => {
    const readyRepos = await detectBranchChange();
    await populateBufferForMissedEvents(readyRepos);
};

const populateBufferForMissedEvents = async (readyRepos: any) => {
    for (const repoPath of Object.keys(readyRepos)) {
        const branch = readyRepos[repoPath];
        const obj = new PopulateBuffer(repoPath, branch);
        let dataDiffs = <any>{};
        if (!obj.modifiedInPast) {
            // Go for content diffs if repo was modified after lastSyncedAt
            dataDiffs = await obj.populateBufferForRepo();
        }
        const deletedFilesDiffs = obj.getDiffForDeletedFiles();
        const diffs = Object.assign({}, dataDiffs, deletedFilesDiffs);
        obj.addDiffsInBuffer(diffs);
    }
};


class PopulateBuffer {
    repoPath: string;
    branch: string;
    repoBranchPath: string;
    repoModifiedAt: number;
    modifiedInPast: boolean;
    itemPaths: IFileToUpload[];
    config: any;
    configFiles: any;
    renamedFiles: string[];
    settings: any

    constructor(repoPath: string, branch: string) {
        this.repoPath = repoPath;
        this.branch = branch;
        this.repoModifiedAt = -1;
        this.settings = generateSettings();
        this.repoBranchPath = path.join(this.repoPath, this.branch);
        this.itemPaths = new initUtils(this.repoPath).getSyncablePaths(<IUserPlan>{}, false, true);
        this.modifiedInPast = this.getModifiedInPast();
        this.config = readYML(this.settings.CONFIG_PATH);
        const configRepo = this.config.repos[this.repoPath];
        this.configFiles = configRepo.branches[this.branch];
        this.renamedFiles = [];
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

    checkForRename(shadowRepoBranchPath: string, filePath: string) {
        // Check for rename only for non-empty files
        const repoPath = this.repoPath;
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
                    const oldFilePath = `${root}/${fileStats.name}`;
                    const relPath = oldFilePath.split(`${shadowRepoBranchPath}/`)[1];
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

    async populateBufferForRepo() {
        const diffs = <any>{};
        const initUtilsObj = new initUtils(this.repoPath);
        const repoBranchPath = path.join(this.repoPath, this.branch);
        const shadowRepoBranchPath = path.join(this.settings.SHADOW_REPO, path.join(this.repoPath, this.branch));
        const originalsRepoBranchPath = path.join(this.settings.ORIGINALS_REPO, path.join(this.repoPath, this.branch));
        console.log(`Watching Repo: ${this.repoPath}`);
        for (const itemPath of this.itemPaths) {
            let diff = "";
            let previousContent = "";
            let isRename = false;
            const shadowFilePath = path.join(shadowRepoBranchPath, itemPath.rel_path);
            const originalFilePath = path.join(originalsRepoBranchPath, itemPath.rel_path);
            const shadowExists = fs.existsSync(shadowFilePath);
            // If rel_path is in configFiles, shadowExists & not is binary, we can compute diff
            if (itemPath.rel_path in this.configFiles && !itemPath.is_binary) {
                // It is new file, either it will be a copy or brand new file
                if (shadowExists) {
                    previousContent = fs.readFileSync(shadowFilePath, "utf8");
                } else if (itemPath.size > FILE_SIZE_AS_COPY) {
                    // Read original file
                    previousContent = fs.readFileSync(itemPath.file_path, "utf8");
                }
                // Read latest content of the file
                const latestContent = fs.readFileSync(itemPath.file_path, "utf8");
                const dmp = new diff_match_patch();
                const patches = dmp.patch_make(previousContent, latestContent);
                // Create text representation of patches objects
                diff = dmp.patch_toText(patches);
            }
            // If rel_path is not in configFiles and shadow does not exists, can be a rename OR deleted file
            if (!(itemPath.rel_path in this.configFiles) && !shadowExists && !itemPath.is_binary) {
                const renameResult = this.checkForRename(shadowRepoBranchPath, itemPath.file_path);
                if (renameResult.isRename) {
                    const oldRelPath = renameResult.shadowFilePath.split(`${shadowRepoBranchPath}/`)[1];
                    const oldAbsPath = path.join(repoBranchPath, oldRelPath);
                    const newAbsPath = path.join(repoBranchPath, itemPath.rel_path);
                    isRename = oldRelPath !== itemPath.rel_path;
                    if (isRename) {
                        // Remove old file from shadow repo
                        fs.unlinkSync(renameResult.shadowFilePath);
                        // Add diff for rename with old_path and new_path
                        diff = JSON.stringify({
                            old_abs_path: oldAbsPath,
                            new_abs_path: newAbsPath,
                            old_rel_path: oldRelPath,
                            new_rel_path: itemPath.rel_path
                        });
                        this.renamedFiles.push(oldRelPath);
                    }
                }
            }
            const isNewFile = !(itemPath.rel_path in this.configFiles) && !isRename &&
                !fs.existsSync(originalFilePath) && !fs.existsSync(shadowFilePath);
            // For new file, copy it in .originals. If already exists there, skip it
            if (isNewFile) {
                diff = "";
                initUtilsObj.copyFilesTo([itemPath.file_path], originalsRepoBranchPath);
            }
            // Sync file in shadow repo with latest content
            initUtilsObj.copyFilesTo( [itemPath.file_path], shadowRepoBranchPath);

            // Add diff only if it is non-empty or it is new file in which case diff will probably be empty initially
            if (diff || isNewFile) {
                diffs[itemPath.rel_path] = {
                    'diff': diff,
                    'is_rename': isRename,
                    'is_new_file': isNewFile,
                    'is_binary': itemPath.is_binary,
                    'created_at': dateFormat(new Date(itemPath.modified_at), DATETIME_FORMAT)
                };
            }
        }
        return diffs;
    }

    addDiffsInBuffer(diffs: any) {
        // Update lastSyncedAt in global
        (global as any).lastSyncedAt[this.repoPath] = this.repoModifiedAt;
        // Add diffs in buffer
        Object.keys(diffs).forEach(relPath => {
            const diffData = diffs[relPath];
            console.log(`Populating buffer for ${relPath}`);
            manageDiff(this.repoPath, this.branch, relPath, diffData.diff, diffData.is_new_file,
                diffData.is_rename, diffData.is_deleted, diffData.created_at);
        });
    }

    getDiffForDeletedFiles() {
        /*
         Pick files that are present in config.yml but
         - is sync able file
         - not present in actual repo
         - is not in renamed files
         - not present in .deleted repo
         - present in .shadow repo
        */
        const diffs = <any>{};
        const initUtilsObj = new initUtils(this.repoPath);
        const activeRelPaths = this.itemPaths.map(itemPath => itemPath.rel_path);
        Object.keys(this.configFiles).forEach(relPath => {
            // Cache path of file
            const fileBranchPath = path.join(this.repoBranchPath, relPath);
            const cacheFilePath = path.join(this.settings.DELETED_REPO, fileBranchPath);
            const shadowFilePath = path.join(this.settings.SHADOW_REPO, fileBranchPath);
            // See if should discard this file
            if (!initUtilsObj.isSyncAble(relPath) ||
                activeRelPaths.includes(relPath) ||
                this.renamedFiles.includes(relPath) ||
                fs.existsSync(cacheFilePath) ||
                !fs.existsSync(shadowFilePath)) {
                return;
            }

            diffs[relPath] = {
                'is_deleted': true,
                'diff': null,  // Computing later while handling buffer
            };
            const cacheRepoPath = path.join(this.settings.DELETED_REPO, this.repoPath);
            // Pick from .shadow and add file in .deleted repo to avoid duplicate diffs
            initUtilsObj.copyFilesTo( [shadowFilePath], cacheRepoPath);
        });
        return diffs;
    }
}

export const detectBranchChange = async () => {
    /*
    * See if repo is in config.yml and is active
    * Check if associated user has an access token
    *
    * */
    // Read config.json
    const settings = generateSettings();

    const configJSON = readYML(settings.CONFIG_PATH);
    const users = readYML(settings.USER_PATH) || {};
    const readyRepos = <any>{};
    for (const repoPath of Object.keys(configJSON.repos)) {
        if (configJSON.repos[repoPath].is_disconnected) {
            continue;
        }
        const configRepo = configJSON.repos[repoPath];
        if (!configRepo.email) {
            continue;
        }
        if (!(configRepo.email in users)) {
            continue;
        }
        const accessToken = users[configRepo.email].access_token;
        const userEmail = configRepo.email;
        if (!accessToken) {
            putLogEvent(`Access token not found for repo: ${repoPath}, ${userEmail}`, userEmail);
            continue;
        }
        const branch = getBranchName({altPath: repoPath}) || DEFAULT_BRANCH;
        const shadowRepo = path.join(settings.SHADOW_REPO, repoPath);

        if (!fs.existsSync(repoPath) || !fs.existsSync(shadowRepo)) {
            // TODO: Handle out of sync repo
            continue;
        }
        const initUtilsObj = new initUtils(repoPath);

        const originalsRepoBranchPath = path.join(settings.ORIGINALS_REPO, path.join(repoPath, branch));
        const originalsRepoExists = fs.existsSync(originalsRepoBranchPath);
        if (!(branch in configRepo.branches)) {
            if (originalsRepoExists) {
                // init has been called, now see if we can upload the repo/branch
                const itemPaths = initUtilsObj.getSyncablePaths(<IUserPlan>{}, true);
                await initUtilsObj.uploadRepo(branch, accessToken, itemPaths, false,
                    true, true, configRepo.email);
            } else {
                await syncRepo(repoPath, accessToken, true, true);
            }
            continue;
        }

        const configFiles = configRepo['branches'][branch];
        // If all files IDs are None in config.yml, we need to sync the branch
        const shouldSyncBranch = Object.values(configFiles).every(element => element === null);
        if (shouldSyncBranch) {
            const itemPaths = initUtilsObj.getSyncablePaths(<IUserPlan>{}, true);
            await initUtilsObj.uploadRepo(branch, accessToken, itemPaths, false, true,
                true, configRepo.email);
        }
        readyRepos[repoPath] = branch;
    }
    return readyRepos;
};
