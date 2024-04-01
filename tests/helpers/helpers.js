import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";

import {readYML, readFile} from "../../src/utils/common";
import {diff_match_patch} from "diff-match-patch";
import {pathUtils} from "../../src/utils/path_utils";
import {UserState} from "../../src/utils/user_utils";
import {generateRandomNumber} from "../../src/utils/setup_utils";
import {DEFAULT_BRANCH, VSCODE, WebPaths} from "../../src/constants";
import {WEB_APP_URL} from "../../src/settings";
import {ErrorCodes} from "../../src/utils/common";

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

function randomBaseRepoName(name) {
    const _randomName = name ? `${name}_${randomName()}` : randomName();
    return `.codesync_${_randomName}`;
}

function randomRepoName() {
    return `test_repo_${randomName()}`;
}

export function randomBaseRepoPath(name=null) {
    return path.join(__dirname, "..", "tests_data", randomBaseRepoName(name));
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

export function getSyncIgnoreFilePath(repoPath) {
    return path.join(repoPath, ".syncignore");
}

export async function waitFor(seconds) {
    return await new Promise((r) => setTimeout(r, seconds*1000));
}

export function writeTestRepoFiles(repoPath) {
    fs.mkdirSync(`${repoPath}/directory`);
    Object.keys(TEST_REPO_RESPONSE).forEach(key => {
        if (key === "urls") {
            Object.keys(TEST_REPO_RESPONSE[key]).forEach(fileName => {
                const repoFilePath = path.join(repoPath, fileName);
                if (fs.existsSync(repoFilePath)) return;
                fs.writeFileSync(repoFilePath, DUMMY_FILE_CONTENT);
            });
        }
    });
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
export const AUTH0_TEST_ID_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RAY29kZXN5bmMuY29tIn0.bl7QQajhg2IjPp8h0gzFku85qCrXQN4kThoo1AxB_Dc';
export const ANOTHER_TEST_EMAIL = 'anotherTest@codesync.com';
export const INVALID_TOKEN_JSON = {"error": {"message": "Invalid token"}};
export const FILE_UPLOAD_400 = {error: {message: "File path is in the syncignore file and can not be uploaded."}};
export const FILE_UPLOAD_402 = {error: {message: "Repo size limit reached"}};
export const REPO_UPLOAD_402 = {error: {message: "Repo size limit reached"}};
export const PRIVATE_REPO_UPLOAD_402 = {
    error: {
        message: "Only 1 private repo is allowed", 
        error_code: ErrorCodes.PRIVATE_REPO_COUNT_LIMIT_REACHED
    }
};
export const ORG_REPO_PLAN_INFO = {
    is_org_repo: true,
    can_avail_trial: false,
    pricing_url: `${WEB_APP_URL}${WebPaths.PRICING}`
};
export const USER_REPO_PLAN_INFO = {
    is_org_repo: false,
    can_avail_trial: false,
    pricing_url: `${WEB_APP_URL}${WebPaths.PRICING}`
};
export const ORG_REPO_CAN_AVAIL_TRIAL = {
    is_org_repo: true,
    can_avail_trial: true,
    pricing_url: `${WEB_APP_URL}${WebPaths.PRICING}`
};
export const USER_REPO_CAN_AVAIL_TRIAL = {
    is_org_repo: false,
    can_avail_trial: true,
    pricing_url: `${WEB_APP_URL}${WebPaths.PRICING}`
};
export const FILE_UPLOAD_404 = {error: {message: "Branch not found"}};
export const FILE_UPLOAD_403 = {error: {message: "Unauthorized for given repo"}};
export const INTERNAL_SERVER_ERROR = {error: {message: "Internal Server Error"}};
export const SYNC_IGNORE_DATA = ".DS_Store\n.git\n\n\n.node_modules\n!tests";
export const DUMMY_FILE_CONTENT = "DUMMY FILE CONTENT";

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
        ".syncignore": 3,
    },
    'urls': {
        "file_1.js": PRE_SIGNED_URL,
        ".syncignore": PRE_SIGNED_URL
    },
    'user': TEST_USER
};
export const NESTED_PATH = path.join("directory", "file_2.js");
TEST_REPO_RESPONSE['file_path_and_id'][NESTED_PATH] = 2;
TEST_REPO_RESPONSE['urls'][NESTED_PATH] = PRE_SIGNED_URL;

export const DIFF_DATA = {
    repo_path: "",
    branch: "",
    file_relative_path: "",
    created_at: "",
    diff: null,
    source: VSCODE
};

export const DEFAULT_SYNCIGNORE_TEST_DATA = `.git/
################################
# Comment
################################
# Gradle files
.gradle/
build/
# Node
node_modules/
# Android
*.apk
!*.apk/
`;

export class Config {

    constructor(repoPath, configPath) {
        this.repoPath = repoPath;
        this.configPath = configPath;
    }

    addRepo = (isDisconnected=false, userEmail=TEST_EMAIL, filesConfig=null) => {
        const config = {repos: {}};
        config.repos[this.repoPath] = {
            id: generateRandomNumber(1, 100000),
            branches: {},
            email: userEmail,
            is_disconnected: isDisconnected
        };
        config.repos[this.repoPath].branches[DEFAULT_BRANCH] = filesConfig || TEST_REPO_RESPONSE.file_path_and_id;
        fs.writeFileSync(this.configPath, yaml.dump(config));
    }

    removeRepo = () => {
        const config = {repos: {}};
        fs.writeFileSync(this.configPath, yaml.dump(config));
    }
}

export const assertChangeEvent = (repoPath, diffsRepo, oldText, updatedText,
                                  fileRelPath, shadowFilePath,
                                  diffsCount = 1) => {
    // Read shadow file
    const shadowText = readFile(shadowFilePath);
    expect(shadowText).toStrictEqual(updatedText);
    // Verify correct diff file has been generated
    const diffFiles = fs.readdirSync(diffsRepo);
    expect(diffFiles).toHaveLength(diffsCount);
    const diffFilePath = path.join(diffsRepo, diffFiles[diffsCount-1]);
    const diffData = readYML(diffFilePath);
    expect(diffData.source).toEqual(VSCODE);
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
    expect(diffData.source).toEqual(VSCODE);
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
    expect(diffData.source).toEqual(VSCODE);
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
    let diffFiles = fs.readdirSync(diffsRepo).filter(diffFilePath => readYML(path.join(diffsRepo, diffFilePath)).is_deleted);
    expect(diffFiles).toHaveLength(1);
    const diffFilePath = path.join(diffsRepo, diffFiles[0]);
    const diffData = readYML(diffFilePath);
    expect(diffData.source).toEqual(VSCODE);
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
    const userState = new UserState();
    userState.set(isActive, false);
    userFileData[TEST_USER.email] = {
        access_key: TEST_USER.iam_access_key,
        secret_key: TEST_USER.iam_secret_key,
        access_token: "ACCESS_TOKEN",
        is_active: isActive
    };
    fs.writeFileSync(userFilePath, yaml.dump(userFileData));
    return userFilePath;
};


export const setWorkspaceFolders = (repoPath) => {
    jest.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue([{uri: {fsPath: repoPath}}]);
};
