import * as fs from "fs";
import * as path from "path";
import * as walk from "walk";
import * as getBranchName from "current-git-branch";

import {readYML} from "../utils/common";
import {
    CONFIG_PATH, DATETIME_FORMAT,
    DEFAULT_BRANCH, DELETED_REPO,
    FILE_SIZE_AS_COPY,
    ORIGINALS_REPO,
    SEQUENCE_MATCHER_RATIO,
    SHADOW_REPO,
    USER_PATH
} from "../constants";
import {putLogEvent} from "../logger";
import {initUtils} from "../utils/init_utils";
import {IFileToUpload, IUserPlan} from "../interface";
import {syncRepo} from "../init_handler";
import {similarity} from "./utils";
import {diff_match_patch} from "diff-match-patch";
import {manageDiff} from "../utils/diff_utils";
import {isBinaryFileSync} from "isbinaryfile";
import * as dateFormat from "dateformat";


const populateBufferForMissedEvents = async (readyRepos: any) => {
    for (const repoPath of Object.keys(readyRepos)) {
        const branch = readyRepos[repoPath];
        const obj = new PopulateBuffer(repoPath, branch);
        if (obj.modifiedInPast) {
            continue;
        }
        const data = await obj.populateBufferForRepo();
        const deletedFilesDiffs = await obj.getDiffForDeletedFiles(data.configFiles, data.relPaths, data.renamedFiles);
        const diffs = Object.assign({}, data.diffs, deletedFilesDiffs);
        obj.addDiffsInBuffer(diffs);
    }
};


export const populateBuffer = async () => {
    const readyRepos = await detectBranchChange();
    await populateBufferForMissedEvents(readyRepos);
};

class PopulateBuffer {
    repoPath: string;
    branch: string;
    repoBranchPath: string;
    repoModifiedAt: number;
    modifiedInPast: boolean;
    itemPaths: IFileToUpload[];

    constructor(repoPath: string, branch: string) {
        this.repoPath = repoPath;
        this.branch = branch;
        this.repoModifiedAt = -1;
        this.repoBranchPath = path.join(this.repoPath, this.branch);
        this.itemPaths = initUtils.getSyncablePaths(this.repoPath, <IUserPlan>{}, false, true);
        this.modifiedInPast = this.getModifiedInPast();
    }

    getModifiedInPast() {
        this.repoModifiedAt = Math.max(...this.itemPaths.map(itemPath => itemPath.modified_at));
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
        const options = {
            listeners: {
                file: function (root: string, fileStats: any, next: any) {
                    const oldFilePath = `${root}/${fileStats.name}`;
                    const isBinary = isBinaryFileSync(oldFilePath);
                    // Skip binary files
                    if (isBinary) {
                        return;
                    }
                    const relPath = oldFilePath.split(`${shadowRepoBranchPath}/`)[1];
                    // Ignore shadow files whose actual files exist in the repo
                    const actualFilePath = path.join(repoPath, relPath);
                    if (fs.existsSync(actualFilePath)) {
                        return;
                    }
                    const shadowContent = fs.readFileSync(oldFilePath, "utf8");
                    const ratio = similarity(content, shadowContent);
                    if (ratio > SEQUENCE_MATCHER_RATIO) {
                        shadowFilePath = oldFilePath;
                        matchingFilesCount += 1;
                    }
                    next();
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
        const renamedFiles: string[] = [];
        const config = readYML(CONFIG_PATH);
        const configRepo = config.repos[this.repoPath];
        const configFiles = configRepo.branches[this.branch];
        const repoBranchPath = path.join(this.repoPath, this.branch);
        const shadowRepoBranchPath = path.join(SHADOW_REPO, path.join(this.repoPath, this.branch));
        const originalsRepoBranchPath = path.join(ORIGINALS_REPO, path.join(this.repoPath, this.branch));
        const relPaths = this.itemPaths.map(itemPath => itemPath.rel_path);
        console.log(`Watching Repo: ${this.repoPath}`);
        for (const itemPath of this.itemPaths) {
            let diff = "";
            let isRename = false;
            const shadowFilePath = path.join(shadowRepoBranchPath, itemPath.rel_path);
            const originalFilePath = path.join(originalsRepoBranchPath, itemPath.rel_path);
            const shadowExists = fs.existsSync(shadowFilePath);
            if (!(itemPath.rel_path in configFiles) && !shadowExists && !itemPath.is_binary) {
                const renameResult = this.checkForRename(shadowRepoBranchPath, itemPath.file_path);
                isRename = renameResult.isRename;
                if (isRename) {
                    const oldRelPath = renameResult.shadowFilePath.split(shadowRepoBranchPath)[1];
                    console.log('oldRelPath: ', oldRelPath);
                    const oldAbsPath = path.join(repoBranchPath, oldRelPath);
                    const newAbsPath = path.join(repoBranchPath, itemPath.rel_path);
                    if (oldRelPath === itemPath.rel_path) {
                        isRename = false;
                    } else {
                        // Remove old file from shadow repo
                        fs.unlinkSync(renameResult.shadowFilePath);
                        // Add diff for rename with old_path and new_path
                        diff = JSON.stringify({
                            old_abs_path: oldAbsPath,
                            new_abs_path: newAbsPath,
                            old_rel_path: oldRelPath,
                            new_rel_path: itemPath.rel_path
                        });
                        renamedFiles.push(oldRelPath);
                    }
                }
            }
            let isNewFile = !(itemPath.rel_path in configFiles) && !isRename && !fs.existsSync(originalFilePath) &&
                !fs.existsSync(shadowFilePath);

            let previousContent = "";
            // Do not compute diffs for binary files, but see if it is a new file OR deleted file
            if (!isRename && !(itemPath.is_binary)) {
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
                //  Create text representation of patches objects
                diff = dmp.patch_toText(patches);
            }
            // Sync file in shadow repo with latest content
            initUtils.copyFilesTo(this.repoPath, [itemPath.file_path], shadowRepoBranchPath);

            // For new file, copy it in .originals. If already exists there, skip it
            if (isNewFile) {
                if (fs.existsSync(originalFilePath)) {
                    isNewFile = false;
                } else {
                    diff = "";
                    initUtils.copyFilesTo(this.repoPath, [itemPath.file_path], originalsRepoBranchPath);
                }
            }
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
        return {
            diffs,
            configFiles,
            relPaths,
            renamedFiles
        };
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

    getDiffForDeletedFiles(configFiles: any, activeFiles: string[], renamedFiles: string[]) {
        /*
         Pick files that are present in config.yml but not present in
         - actual repo
         - shadow repo
        */
        const diffs = <any>{};
        Object.keys(configFiles).forEach(relPath => {
           const fileId = configFiles[relPath];
            // Cache path of file
            const fileBranchPath = path.join(this.repoBranchPath, relPath);
            const cacheFilePath = path.join(DELETED_REPO, fileBranchPath);
            const shadowFilePath = path.join(SHADOW_REPO, fileBranchPath);
            if (activeFiles.includes(relPath) || renamedFiles.includes(relPath) ||
                fs.existsSync(cacheFilePath) || !fs.existsSync(shadowFilePath)) {
                return;
            }
            diffs[relPath] = {
                'is_deleted': true,
                'diff': null,  // Computing later while handling buffer
            };
            const cacheRepoBranchPath = path.join(DELETED_REPO, this.repoBranchPath);
            // Pick from .shadow and add file in .deleted repo to avoid duplicate diffs
            initUtils.copyFilesTo(this.repoPath, [shadowFilePath], cacheRepoBranchPath);
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
    const configJSON = readYML(CONFIG_PATH);
    const users = readYML(USER_PATH) || {};
    const readyRepos = <any>{};
    for (const repoPath of Object.keys(configJSON.repos)) {
        if (configJSON.repos[repoPath].is_disconnected) {
            continue;
        }
        const configRepo = configJSON.repos[repoPath];
        if (!configRepo.email) {
            continue;
        }
        const accessToken = users[configRepo.email].access_token;
        const userEmail = configRepo.email;
        if (!accessToken) {
            putLogEvent(`Access token not found for repo: ${repoPath}, ${userEmail}`, userEmail);
            continue;
        }
        const branch = getBranchName({altPath: repoPath}) || DEFAULT_BRANCH;
        const shadowRepo = path.join(SHADOW_REPO, repoPath);

        if (!fs.existsSync(repoPath) || !fs.existsSync(shadowRepo)) {
            // TODO: Handle out of sync repo
            continue;
        }
        const originalsRepoBranchPath = path.join(ORIGINALS_REPO, path.join(repoPath, branch));
        const originalsRepoExists = fs.existsSync(originalsRepoBranchPath);
        if (!(branch in configRepo.branches)) {
            if (originalsRepoExists) {
                // init has been called, now see if we can upload the repo/branch
                const itemPaths = initUtils.getSyncablePaths(repoPath, <IUserPlan>{}, true);
                await initUtils.uploadRepo(repoPath, branch, accessToken, itemPaths, false, true, true, configRepo.email);
            } else {
                await syncRepo(repoPath, accessToken, true, true);
            }
            continue;
        }

        const configFiles = configRepo['branches'][branch];
        // If all files IDs are None in config.yml, we need to sync the branch
        const shouldSyncBranch = Object.values(configFiles).every(element => element === null);
        if (shouldSyncBranch) {
            const itemPaths = initUtils.getSyncablePaths(repoPath, <IUserPlan>{}, true);
            await initUtils.uploadRepo(repoPath, branch, accessToken, itemPaths, false, true, true, configRepo.email);
        }
        readyRepos[repoPath] = branch;
    }
    return readyRepos;
};
