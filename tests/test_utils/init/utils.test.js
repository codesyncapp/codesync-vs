import fs from "fs";
import yaml from "js-yaml";
import vscode from "vscode";
import getBranchName from 'current-git-branch';
import {initUtils} from "../../../src/init/utils";
import untildify from 'untildify';

import {
    ANOTHER_TEST_EMAIL,
    DUMMY_FILE_CONTENT,
    SYNC_IGNORE_DATA,
    TEST_EMAIL,
    TEST_REPO_RESPONSE,
    TEST_USER,
    USER_PLAN,
    randomBaseRepoPath,
    randomRepoPath
} from "../../helpers/helpers";
import {DEFAULT_BRANCH, NOTIFICATION, SYNCIGNORE} from "../../../src/constants";
import {readYML} from "../../../src/utils/common";
import fetchMock from "jest-fetch-mock";


describe("isValidRepoSize",  () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("true result",  () => {
        const isValid = initUtils.isValidRepoSize(USER_PLAN.SIZE-10, USER_PLAN);
        expect(isValid).toBe(true);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
    });

    test("false result",  () => {
        const isValid = initUtils.isValidRepoSize(USER_PLAN.SIZE+10, USER_PLAN);
        expect(isValid).toBe(false);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0].startsWith(NOTIFICATION.REPOS_LIMIT_BREACHED)).toBe(true);
    });
});

describe("isValidFilesCount",  () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("true result",  () => {
        const isValid = initUtils.isValidFilesCount(USER_PLAN.FILE_COUNT-10, USER_PLAN);
        expect(isValid).toBe(true);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
    });

    test("false result",  () => {
        const isValid = initUtils.isValidFilesCount(USER_PLAN.FILE_COUNT+10, USER_PLAN);
        expect(isValid).toBe(false);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0].startsWith(NOTIFICATION.FILES_LIMIT_BREACHED)).toBe(true);
    });
});

describe("successfullySynced",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const configPath = `${baseRepoPath}/config.yml`;
    const configData = {repos: {}};

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.safeDump(configData));
    });

    afterEach(() => {
        fs.rmdirSync(repoPath, {recursive: true});
        fs.rmdirSync(baseRepoPath, {recursive: true});
    });

    test("Non-Synced Repo",  () => {
        const isSynced = initUtils.successfullySynced(repoPath);
        expect(isSynced).toBe(false);
    });

    test("Non Synced Branch",  () => {
        configData.repos[repoPath] = {branches: {}};
        fs.writeFileSync(configPath, yaml.safeDump(configData));
        const isSynced = initUtils.successfullySynced(repoPath);
        expect(isSynced).toBe(true);
    });

    test("Invalid file IDs",  () => {
        configData.repos[repoPath] = {branches: {}};
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = {
            file_1: null,
            file_2: null,
        };
        fs.writeFileSync(configPath, yaml.safeDump(configData));
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const isSynced = initUtils.successfullySynced(repoPath);
        expect(isSynced).toBe(false);
    });

    test("Valid file IDs",  () => {
        configData.repos[repoPath] = {branches: {}};
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = {
            file_1: 123,
            file_2: 456,
        };
        fs.writeFileSync(configPath, yaml.safeDump(configData));
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const isSynced = initUtils.successfullySynced(repoPath);
        expect(isSynced).toBe(true);
    });
});

describe("getSyncablePaths",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const syncIgnorePath = `${repoPath}/.syncignore`;
    const filePath = `${repoPath}/file.js`;

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
    });

    afterEach(() => {
        fs.rmdirSync(repoPath, {recursive: true});
        fs.rmdirSync(baseRepoPath, {recursive: true});
    });

    test("No .syncignore",  () => {
        const paths = initUtils.getSyncablePaths(repoPath, USER_PLAN);
        expect(paths).toHaveLength(0);
    });

    test("Ignore file and match rest",  () => {
        fs.writeFileSync(filePath, "");
        fs.writeFileSync(`${repoPath}/ignore.js`, DUMMY_FILE_CONTENT);
        fs.writeFileSync(syncIgnorePath, SYNC_IGNORE_DATA+"\nignore.js");
        const paths = initUtils.getSyncablePaths(repoPath, USER_PLAN);
        // 1 is .syncignore, other is file.js
        expect(paths).toHaveLength(2);
        expect(paths[0].rel_path).toStrictEqual(SYNCIGNORE);
        expect(paths[0].is_binary).toBe(false);
        expect(paths[0].file_path).toStrictEqual(syncIgnorePath);
        expect(paths[0].size).toBeTruthy();
        expect(paths[1].rel_path).toStrictEqual("file.js");
        expect(paths[1].is_binary).toBe(false);
        expect(paths[1].file_path).toStrictEqual(filePath);
        expect(paths[1].size).toStrictEqual(0);
    });

    test("Size increases the limit",  () => {
        fs.writeFileSync(filePath, "");
        fs.writeFileSync(`${repoPath}/ignore.js`, "DUMMY FILE CONTENT");
        fs.writeFileSync(syncIgnorePath, SYNC_IGNORE_DATA+"\nignore.js");
        const userPlan = Object.assign({}, USER_PLAN);
        userPlan.SIZE = 0;
        const paths = initUtils.getSyncablePaths(repoPath, userPlan);
        expect(paths).toHaveLength(0);
    });
});

describe("copyFilesTo",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const filePath = `${repoPath}/file.js`;
    const shadowRepo = `${baseRepoPath}/.shadow/${repoPath}`;

    beforeEach(() => {
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
    });

    afterEach(() => {
        fs.rmdirSync(repoPath, {recursive: true});
        fs.rmdirSync(baseRepoPath, {recursive: true});
    });

    test("Copy to Shadow repo",  () => {
        initUtils.copyFilesTo(repoPath, [filePath], shadowRepo);
        expect(fs.existsSync(`${shadowRepo}/file.js`)).toBe(true);
    });

    test("Copy non-existing file",  () => {
        fs.rmSync(filePath);
        initUtils.copyFilesTo(repoPath, [filePath], shadowRepo);
        expect(fs.existsSync(`${shadowRepo}/file.js`)).toBe(false);
    });
});

describe("saveIamUser",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const userFilePath = `${baseRepoPath}/user.yml`;
    const userFileData = {};
    userFileData[TEST_USER.email] = {
        access_key: TEST_USER.iam_access_key,
        secret_key: TEST_USER.iam_secret_key,
    };

    beforeEach(() => {
        fs.mkdirSync(baseRepoPath, {recursive: true});
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
    });

    afterEach(() => {
        fs.rmdirSync(baseRepoPath, {recursive: true});
    });

    test("With no user.yml",  () => {
        initUtils.saveIamUser(TEST_USER);
        expect(fs.existsSync(userFilePath)).toBe(true);
        const users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
    });

    test("User not in user.yml",  () => {
        fs.writeFileSync(userFilePath, yaml.safeDump(userFileData));
        const testUser = Object.assign({}, TEST_USER);
        testUser.email = ANOTHER_TEST_EMAIL;
        initUtils.saveIamUser(testUser);
        expect(fs.existsSync(userFilePath)).toBe(true);
        const users = readYML(userFilePath);
        expect(users[ANOTHER_TEST_EMAIL].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[ANOTHER_TEST_EMAIL].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
    });
});

describe("saveSequenceTokenFile",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const sequenceTokenFilePath = `${baseRepoPath}/sequence_token.yml`;
    const sequenceTokenFileData = {};
    sequenceTokenFileData[TEST_EMAIL] = "";

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
    });

    afterEach(() => {
        fs.rmdirSync(baseRepoPath, {recursive: true});
    });

    test("With no sequence_token.yml",  () => {
        initUtils.saveSequenceTokenFile(TEST_EMAIL);
        expect(fs.existsSync(sequenceTokenFilePath)).toBe(true);
        const users = readYML(sequenceTokenFilePath);
        expect(users[TEST_EMAIL]).toStrictEqual("");
    });

    test("User not in user.yml",  () => {
        fs.writeFileSync(sequenceTokenFilePath, yaml.safeDump(sequenceTokenFileData));
        initUtils.saveSequenceTokenFile(ANOTHER_TEST_EMAIL);
        expect(fs.existsSync(sequenceTokenFilePath)).toBe(true);
        const users = readYML(sequenceTokenFilePath);
        expect(users[ANOTHER_TEST_EMAIL]).toStrictEqual("");
    });
});

describe("saveFileIds",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const configPath = `${baseRepoPath}/config.yml`;
    const configData = {repos: {}};
    configData.repos[repoPath] = {branches: {}};

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.safeDump(configData));
    });

    afterEach(() => {
        fs.rmdirSync(repoPath, {recursive: true});
        fs.rmdirSync(baseRepoPath, {recursive: true});
    });

    test("Should save file IDs",  () => {
        initUtils.saveFileIds(repoPath, DEFAULT_BRANCH, "ACCESS_TOKEN", TEST_EMAIL,
            TEST_REPO_RESPONSE);
        const config = readYML(configPath);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH]).toStrictEqual(TEST_REPO_RESPONSE.file_path_and_id);
    });
});

describe("uploadRepo",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const syncIgnorePath = `${repoPath}/.syncignore`;
    const filePath = `${repoPath}/file.js`;
    const configPath = `${baseRepoPath}/config.yml`;
    const userFilePath = `${baseRepoPath}/user.yml`;
    const sequenceTokenFilePath = `${baseRepoPath}/sequence_token.yml`;
    const configData = {repos: {}};

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.safeDump(configData));
        fs.writeFileSync(syncIgnorePath, SYNC_IGNORE_DATA+"\nignore.js");
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(`${repoPath}/ignore.js`, DUMMY_FILE_CONTENT);
    });

    afterEach(() => {
        fs.rmdirSync(repoPath, {recursive: true});
        fs.rmdirSync(baseRepoPath, {recursive: true});
    });

    test("repo In Config",  async () => {
        untildify.mockReturnValue(baseRepoPath);
        // Add repo in config
        configData.repos[repoPath] = {branches: {}};
        fs.writeFileSync(configPath, yaml.safeDump(configData));
        // Generate ItemPaths
        const itemPaths = initUtils.getSyncablePaths(repoPath, USER_PLAN);
        // 1 is .syncignore, other is file.js
        expect(itemPaths).toHaveLength(2);
        // Mock response for checkServerDown
        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(JSON.stringify(TEST_REPO_RESPONSE));

        await initUtils.uploadRepo(repoPath, DEFAULT_BRANCH, "ACCESS_TOKEN", itemPaths,
            false, false, false, TEST_EMAIL);

        // Verify file Ids have been added in config
        const config = readYML(configPath);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH]).toStrictEqual(TEST_REPO_RESPONSE.file_path_and_id);

        // Verify sequence_token.yml
        let users = readYML(sequenceTokenFilePath);
        expect(users[TEST_EMAIL]).toStrictEqual("");

        // verify user.yml
        users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
    });

    test("repo Not In Config",  async () => {
        const configData = {repos: {}};
        fs.writeFileSync(configPath, yaml.safeDump(configData));
        const itemPaths = initUtils.getSyncablePaths(repoPath, USER_PLAN);
        // 1 is .syncignore, other is file.js
        expect(itemPaths).toHaveLength(2);
        // Mock response for checkServerDown
        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(JSON.stringify(TEST_REPO_RESPONSE));

        await initUtils.uploadRepo(repoPath, DEFAULT_BRANCH, "ACCESS_TOKEN", itemPaths,
            false, false, false,
            TEST_EMAIL);

        // Verify file Ids have been added in config
        const config = readYML(configPath);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH]).toStrictEqual(TEST_REPO_RESPONSE.file_path_and_id);

        // Verify sequence_token.yml
        let users = readYML(sequenceTokenFilePath);
        expect(users[TEST_EMAIL]).toStrictEqual("");

        // verify user.yml
        users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
    });

    test("Error in uploadRepoToServer",  async () => {
        // Write these files as putLogEvent is called when error occurs
        fs.writeFileSync(userFilePath, yaml.safeDump({}));
        fs.writeFileSync(sequenceTokenFilePath, yaml.safeDump({}));

        const itemPaths = initUtils.getSyncablePaths(repoPath, USER_PLAN);
        // 1 is .syncignore, other is file.js
        expect(itemPaths).toHaveLength(2);
        // Mock response for checkServerDown
        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(null);

        await initUtils.uploadRepo(repoPath, DEFAULT_BRANCH, "ACCESS_TOKEN", itemPaths,
            false, false, false,
            TEST_EMAIL);

        // Verify file Ids have been added in config
        const config = readYML(configPath);
        expect(DEFAULT_BRANCH in config.repos[repoPath].branches[DEFAULT_BRANCH]).toBe(false);

        // Verify sequence_token.yml
        const sequenceTokenUsers = readYML(sequenceTokenFilePath);
        expect(TEST_EMAIL in sequenceTokenUsers).toBe(false);
        // verify user.yml
        const users = readYML(userFilePath);
        expect(TEST_EMAIL in users).toBe(false);
        // Verify error msg
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.SYNC_FAILED);

    });
});
