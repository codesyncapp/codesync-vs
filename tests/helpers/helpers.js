import fs from "fs";
import path from "path";
import yaml from "js-yaml";

import {readYML} from "../../src/utils/common";
import {diff_match_patch} from "diff-match-patch";
import {pathUtils} from "../../src/utils/path_utils";
import {DEFAULT_BRANCH, DIFF_SOURCE} from "../../src/constants";
import vscode from "vscode";

export function getRandomString(length) {
    var randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    var result = '';
    for ( let i = 0; i < length; i++ ) {
        result += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
    }
    return result;
}

export function randomName() {
    return getRandomString(10);
}

function randomBaseRepoName() {
    return `.codesync_${randomName()}`;
}

function randomRepoName() {
    return `test_repo_${randomName()}`;
}

export function randomBaseRepoPath() {
    return path.join(__dirname, "..", "tests_data", randomBaseRepoName());
}

export function randomRepoPath() {
    return path.join(__dirname, "..", "tests_data", randomRepoName());
}

export function getConfigFilePath(baseRepoPath) {
    return path.join(baseRepoPath, "config.yml");
}

export function getUserFilePath(baseRepoPath) {
    return path.join(baseRepoPath, "user.yml");
}

export function getSeqTokenFilePath(baseRepoPath) {
    return path.join(baseRepoPath, "sequence_token.yml");
}

export function getSyncIgnoreFilePath(repoPath) {
    return path.join(repoPath, ".syncignore");
}

export async function waitFor(seconds) {
    return await new Promise((r) => setTimeout(r, seconds*1000));
}

export const PRE_SIGNED_URL = {
    'url': 'https://codesync.s3.amazonaws.com/',
    'fields': {
        'key': 'repos/1/codesync-intellij/master/gradle/wrapper/gradle-wrapper.jar',
        'AWSAccessKeyId': 'DUMMY_KEY',
        'policy': 'ABC POLICY',
        'signature': 'enz87g3VP0fxp/sCehLWsNZ4KRE='
    }
};

export const TEST_EMAIL = 'test@codesync.com';
export const ANOTHER_TEST_EMAIL = 'anotherTest@codesync.com';
export const INVALID_TOKEN_JSON = {"error": "Invalid token"};
export const SYNC_IGNORE_DATA = ".DS_Store\n.git\n\n\n.node_modules\n";
export const DUMMY_FILE_CONTENT = "DUMMY FILE CONTENT";

export const USER_PLAN = {
    "SIZE": 10 * 1000 * 1000,  // 10 MB
    "FILE_COUNT": 100,
    "REPO_COUNT": 5
};

export const TEST_USER = {
    email: TEST_EMAIL,
    iam_access_key: "iam_access_key",
    iam_secret_key: "iam_secret_key",
};

export const FILE_ID = 1234;
export const TEST_REPO_RESPONSE = {
    'repo_id': 123,
    'branch_id': 456,
    'file_path_and_id': {
        "file_1.js": FILE_ID,
        "directory/file_2.js": 2,
        ".syncignore": 3,
    },
    'urls': {
        "file_1.js": PRE_SIGNED_URL,
        "directory/file_2.js": PRE_SIGNED_URL,
        ".syncignore": PRE_SIGNED_URL
    },
    'user': TEST_USER
};

export const DIFF_DATA = {
    repo_path: "",
    branch: "",
    file_relative_path: "",
    created_at: "",
    diff: null,
    source: DIFF_SOURCE
};

export class Config {

    constructor(repoPath, configPath) {
        this.repoPath = repoPath;
        this.configPath = configPath;
    }

    addRepo = (isDisconnected=false) => {
        const config = {repos: {}};
        config.repos[this.repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        config.repos[this.repoPath].branches[DEFAULT_BRANCH] = TEST_REPO_RESPONSE.file_path_and_id;
        if (isDisconnected) {
            config.repos[this.repoPath].is_disconnected = true;
        }
        fs.writeFileSync(this.configPath, yaml.safeDump(config));
    }

    removeRepo = () => {
        const config = {repos: {}};
        fs.writeFileSync(this.configPath, yaml.safeDump(config));
    }
}

export const assertChangeEvent = (repoPath, diffsRepo, oldText, updatedText,
                                  fileRelPath, shadowFilePath,
                                  diffsCount = 1) => {
    // Read shadow file
    const shadowText = fs.readFileSync(shadowFilePath, "utf8");
    expect(shadowText).toStrictEqual(updatedText);
    // Verify correct diff file has been generated
    const diffFiles = fs.readdirSync(diffsRepo);
    expect(diffFiles).toHaveLength(diffsCount);
    const diffFilePath = path.join(diffsRepo, diffFiles[diffsCount-1]);
    const diffData = readYML(diffFilePath);
    expect(diffData.source).toEqual(DIFF_SOURCE);
    expect(diffData.is_new_file).toBeFalsy();
    expect(diffData.is_rename).toBeFalsy();
    expect(diffData.is_deleted).toBeFalsy();
    expect(diffData.repo_path).toEqual(repoPath);
    expect(diffData.branch).toEqual(DEFAULT_BRANCH);
    expect(diffData.file_relative_path).toEqual(fileRelPath);
    // Verify diff is correct
    const dmp = new diff_match_patch();
    const patches = dmp.patch_make(oldText, updatedText);
    //  Create text representation of patches objects
    const diffs = dmp.patch_toText(patches);
    expect(diffData.diff).toStrictEqual(diffs);
    return true;
};

export const assertRenameEvent = (repoPath, configPath, oldRelPath, newRelPath,
                                  diffsCount = 1, assertID = true) => {

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
    const diffsRepo = pathUtilsObj.getDiffsRepo();

    const oldShadowFilePath = path.join(shadowRepoBranchPath, oldRelPath);
    const renamedShadowFilePath = path.join(shadowRepoBranchPath, newRelPath);
    // Verify file has been renamed in the shadow repo
    expect(fs.existsSync(oldShadowFilePath)).toBe(false);
    expect(fs.existsSync(renamedShadowFilePath)).toBe(true);
    // Verify correct diff file has been generated
    let diffFiles = fs.readdirSync(diffsRepo);
    expect(diffFiles).toHaveLength(diffsCount);
    const diffFilePath = path.join(diffsRepo, diffFiles[diffsCount-1]);
    const diffData = readYML(diffFilePath);
    expect(diffData.source).toEqual(DIFF_SOURCE);
    expect(diffData.is_rename).toBe(true);
    expect(diffData.is_new_file).toBeFalsy();
    expect(diffData.is_deleted).toBeFalsy();
    expect(diffData.repo_path).toEqual(repoPath);
    expect(diffData.branch).toEqual(DEFAULT_BRANCH);
    expect(diffData.file_relative_path).toEqual(newRelPath);
    expect(JSON.parse(diffData.diff).old_rel_path).toEqual(oldRelPath);
    expect(JSON.parse(diffData.diff).new_rel_path).toEqual(newRelPath);
    if (assertID) {
        const configJSON = readYML(configPath);
        expect(configJSON.repos[repoPath].branches[DEFAULT_BRANCH][newRelPath]).toStrictEqual(FILE_ID);
    }
    return true;
};

export const assertNewFileEvent = (repoPath, newRelPath, diffsCount = 1) => {
    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
    const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
    const diffsRepo = pathUtilsObj.getDiffsRepo();

    const originalsFilePath = path.join(originalsRepoBranchPath, newRelPath);
    const shadowFilePath = path.join(shadowRepoBranchPath, newRelPath);
    // Verify file has been created in the .shadow repo and .originals repos
    expect(fs.existsSync(shadowFilePath)).toBe(true);
    expect(fs.existsSync(originalsFilePath)).toBe(true);
    // Verify correct diff file has been generated
    let diffFiles = fs.readdirSync(diffsRepo);
    expect(diffFiles).toHaveLength(diffsCount);
    const diffFilePath = path.join(diffsRepo, diffFiles[diffsCount-1]);
    const diffData = readYML(diffFilePath);
    expect(diffData.source).toEqual(DIFF_SOURCE);
    expect(diffData.is_new_file).toBe(true);
    expect(diffData.is_rename).toBeFalsy();
    expect(diffData.is_deleted).toBeFalsy();
    expect(diffData.repo_path).toEqual(repoPath);
    expect(diffData.branch).toEqual(DEFAULT_BRANCH);
    expect(diffData.file_relative_path).toEqual(newRelPath);
    expect(diffData.diff).toEqual("");
    return true;
};

export const assertFileDeleteEvent = (repoPath, fileRelPath, isDirectory=false) => {
    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const diffsRepo = pathUtilsObj.getDiffsRepo();
    const cacheRepoBranchPath = pathUtilsObj.getDeletedRepoBranchPath();
    // Verify file/Directory has been renamed in the shadow repo
    if (isDirectory) {
        const cacheDirectoryPath = path.join(cacheRepoBranchPath, "directory");
        expect(fs.existsSync(cacheDirectoryPath)).toBe(true);
    } else {
        const cacheFilePath = path.join(cacheRepoBranchPath, fileRelPath);
        expect(fs.existsSync(cacheFilePath)).toBe(true);
    }
    // Verify correct diff file has been generated
    let diffFiles = fs.readdirSync(diffsRepo);
    expect(diffFiles).toHaveLength(1);
    const diffFilePath = path.join(diffsRepo, diffFiles[0]);
    const diffData = readYML(diffFilePath);
    expect(diffData.source).toEqual(DIFF_SOURCE);
    expect(diffData.is_deleted).toBe(true);
    expect(diffData.is_rename).toBeFalsy();
    expect(diffData.is_new_file).toBeFalsy();
    expect(diffData.created_at).toBeTruthy();
    expect(diffData.repo_path).toEqual(repoPath);
    expect(diffData.branch).toEqual(DEFAULT_BRANCH);
    expect(diffData.file_relative_path).toEqual(fileRelPath);
    expect(diffData.diff).toEqual("");
    return true;
};


export const addUser = (baseRepoPath, isActive=true) => {
    // Add user
    const userFilePath = getUserFilePath(baseRepoPath);
    const userFileData = {};
    userFileData[TEST_USER.email] = {
        access_key: TEST_USER.iam_access_key,
        secret_key: TEST_USER.iam_secret_key,
        access_token: "ACCESS_TOKEN",
        is_active: isActive
    };
    fs.writeFileSync(userFilePath, yaml.safeDump(userFileData));
    return userFilePath;
};


export const setWorkspaceFolders = (repoPath) => {
    jest.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue([{uri: {fsPath: repoPath}}]);
};
