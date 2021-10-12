import path from "path";
import {DEFAULT_BRANCH, DIFF_SOURCE} from "../../src/constants";
import fs from "fs";
import yaml from "js-yaml";

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

export const TEST_REPO_RESPONSE = {
    'repo_id': 123,
    'branch_id': 456,
    'file_path_and_id': {
        "file_1.js": 1,
        "directory/file_2.js": 2,
    },
    'urls': {
        "file_1.js": PRE_SIGNED_URL,
        "directory/file_2.js": PRE_SIGNED_URL,
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

    addRepo = () => {
        const config = {repos: {}};
        config.repos[this.repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        config.repos[this.repoPath].branches[DEFAULT_BRANCH] = {};
        fs.writeFileSync(this.configPath, yaml.safeDump(config));
    }

    removeRepo = () => {
        const config = {repos: {}};
        fs.writeFileSync(this.configPath, yaml.safeDump(config));
    }
}
