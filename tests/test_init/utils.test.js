import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from 'untildify';
import {initUtils} from "../../src/init/utils";

import {
    ANOTHER_TEST_EMAIL,
    DUMMY_FILE_CONTENT,
    SYNC_IGNORE_DATA,
    TEST_EMAIL,
    TEST_REPO_RESPONSE,
    TEST_USER,
    randomBaseRepoPath,
    randomRepoPath, getConfigFilePath, getSyncIgnoreFilePath, getUserFilePath, getSeqTokenFilePath, Config, addUser, waitFor
} from "../helpers/helpers";
import {API_ROUTES, DEFAULT_BRANCH, DIFF_SOURCE, NOTIFICATION, SYNCIGNORE} from "../../src/constants";
import {readYML} from "../../src/utils/common";
import fetchMock from "jest-fetch-mock";
import {isBinaryFileSync} from "isbinaryfile";
import {pathUtils} from "../../src/utils/path_utils";
import { createSystemDirectories } from "../../src/utils/setup_utils";


describe("getSyncablePaths",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const syncIgnorePath = getSyncIgnoreFilePath(repoPath);
    const filePath = path.join(repoPath, "file.js");

    beforeEach(() => {
        jest.clearAllMocks();
        global.IS_CODESYNC_TEST_MODE = true;
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No .syncignore",  () => {
        fs.writeFileSync(filePath, "");
        const initUtilsObj = new initUtils(repoPath);
        const paths = initUtilsObj.getSyncablePaths();
        expect(paths).toHaveLength(1);
    });

    test("Ignore file and match rest",  () => {
        isBinaryFileSync.mockReturnValue(false);
        fs.writeFileSync(filePath, "");
        fs.writeFileSync(path.join(repoPath, "ignore.js"), DUMMY_FILE_CONTENT);
        fs.writeFileSync(syncIgnorePath, SYNC_IGNORE_DATA+"\nignore.js");
        const initUtilsObj = new initUtils(repoPath);
        const paths = initUtilsObj.getSyncablePaths();

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
});

describe("copyFilesTo",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const filePath = path.join(repoPath, "file.js");
    untildify.mockReturnValue(baseRepoPath);
    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const shadowRepo = pathUtilsObj.getShadowRepoPath();
    const deletedRepo = pathUtilsObj.getDeletedRepoPath();

    beforeEach(() => {
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Copy to Shadow repo",  () => {
        const initUtilsObj = new initUtils(repoPath);
        initUtilsObj.copyFilesTo([filePath], shadowRepo);
        expect(fs.existsSync(path.join(shadowRepo, "file.js"))).toBe(true);
    });

    test("Copy from .shadow to .deleted repo",  () => {
        // Copy to shadow
        const initUtilsObj = new initUtils(repoPath);
        initUtilsObj.copyFilesTo([filePath], shadowRepo);
        const shadowFilePath = path.join(shadowRepo, "file.js");
        const deletedFilePath = path.join(deletedRepo, "file.js");
        expect(fs.existsSync(shadowFilePath)).toBe(true);
        // Copy to .originals
        initUtilsObj.copyFilesTo([shadowFilePath], deletedRepo, true);
        expect(fs.existsSync(deletedFilePath)).toBe(true);
    });

    test("Copy non-existing file",  () => {
        fs.rmSync(filePath);
        const initUtilsObj = new initUtils(repoPath);
        initUtilsObj.copyFilesTo([filePath], shadowRepo);
        expect(fs.existsSync(path.join(shadowRepo, "file.js"))).toBe(false);
    });
});

describe("saveIamUser",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const userFilePath = getUserFilePath(baseRepoPath);
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
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("With no user.yml",  () => {
        const initUtilsObj = new initUtils();
        initUtilsObj.saveIamUser(TEST_USER);
        expect(fs.existsSync(userFilePath)).toBe(true);
        const users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
    });

    test("With no active user.yml",  () => {
        addUser(baseRepoPath, false);
        const initUtilsObj = new initUtils();
        initUtilsObj.saveIamUser(TEST_USER);
        expect(fs.existsSync(userFilePath)).toBe(true);
        const users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
    });

    test("User not in user.yml",  () => {
        fs.writeFileSync(userFilePath, yaml.safeDump(userFileData));
        const testUser = Object.assign({}, TEST_USER);
        testUser.email = ANOTHER_TEST_EMAIL;
        const initUtilsObj = new initUtils();
        initUtilsObj.saveIamUser(testUser);
        expect(fs.existsSync(userFilePath)).toBe(true);
        const users = readYML(userFilePath);
        expect(users[ANOTHER_TEST_EMAIL].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[ANOTHER_TEST_EMAIL].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
    });

    test("User user in user.yml with only access token",  () => {
        userFileData[TEST_USER.email] = {
            access_token: "TOKEN ABC"
        };
        fs.writeFileSync(userFilePath, yaml.safeDump(userFileData));
        const testUser = Object.assign({}, TEST_USER);
        testUser.email = TEST_EMAIL;
        const initUtilsObj = new initUtils();
        initUtilsObj.saveIamUser(testUser);
        expect(fs.existsSync(userFilePath)).toBe(true);
        const users = readYML(userFilePath);
        expect(users[TEST_EMAIL].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_EMAIL].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
        expect(users[TEST_EMAIL].access_token).toStrictEqual("TOKEN ABC");
    });
});

describe("saveSequenceTokenFile",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const sequenceTokenFilePath = getSeqTokenFilePath(baseRepoPath);
    const sequenceTokenFileData = {};
    sequenceTokenFileData[TEST_EMAIL] = "";

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
    });

    afterEach(() => {
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("With no sequence_token.yml",  () => {
        const initUtilsObj = new initUtils();
        initUtilsObj.saveSequenceTokenFile(TEST_EMAIL);
        expect(fs.existsSync(sequenceTokenFilePath)).toBe(true);
        const users = readYML(sequenceTokenFilePath);
        expect(users[TEST_EMAIL]).toStrictEqual("");
    });

    test("User not in user.yml",  () => {
        const initUtilsObj = new initUtils();
        fs.writeFileSync(sequenceTokenFilePath, yaml.safeDump(sequenceTokenFileData));
        initUtilsObj.saveSequenceTokenFile(ANOTHER_TEST_EMAIL);
        expect(fs.existsSync(sequenceTokenFilePath)).toBe(true);
        const users = readYML(sequenceTokenFilePath);
        expect(users[ANOTHER_TEST_EMAIL]).toStrictEqual("");
    });
});

describe("saveFileIds",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
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
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Should save file IDs",  () => {
        const initUtilsObj = new initUtils(repoPath);
        initUtilsObj.saveFileIds(DEFAULT_BRANCH, "ACCESS_TOKEN", TEST_EMAIL, TEST_REPO_RESPONSE);
        const config = readYML(configPath);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH]).toStrictEqual(TEST_REPO_RESPONSE.file_path_and_id);
    });
});

describe("uploadRepo",  () => {
    let baseRepoPath;
    let repoPath;
    let syncIgnorePath;
    let filePath;
    let configPath;
    let userFilePath;
    let sequenceTokenFilePath;
    const configData = {repos: {}};

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();

        baseRepoPath = randomBaseRepoPath();
        repoPath = randomRepoPath();
        // Create directories
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();

        configPath = getConfigFilePath(baseRepoPath);
        userFilePath = getUserFilePath(baseRepoPath);
        sequenceTokenFilePath = getSeqTokenFilePath(baseRepoPath);
        syncIgnorePath = getSyncIgnoreFilePath(repoPath);
        filePath = path.join(repoPath, "file.js");
    
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        fs.writeFileSync(configPath, yaml.safeDump(configData));
        fs.writeFileSync(syncIgnorePath, SYNC_IGNORE_DATA+"\nignore.js");
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(path.join(repoPath, "ignore.js"), DUMMY_FILE_CONTENT);
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Server Down",  async () => {
        // Generate ItemPaths
        const initUtilsObj = new initUtils(repoPath);
        const itemPaths = initUtilsObj.getSyncablePaths();
        // 1 is .syncignore, other is file.js
        expect(itemPaths).toHaveLength(2);
        // Mock response for checkServerDown
        fetchMock.mockResponseOnce(JSON.stringify({status: false}));

        await initUtilsObj.uploadRepo(DEFAULT_BRANCH, "ACCESS_TOKEN", itemPaths,
            TEST_EMAIL, false);

        // Verify file Ids have been added in config
        const config = readYML(configPath);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH]).toStrictEqual({
            ".syncignore": null,
            "file.js": null,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("repo In Config",  async () => {
        // Generate ItemPaths
        const initUtilsObj = new initUtils(repoPath);
        const itemPaths = initUtilsObj.getSyncablePaths();
        // 1 is .syncignore, other is file.js
        expect(itemPaths).toHaveLength(2);
        // Mock response for checkServerDown
        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(JSON.stringify(TEST_REPO_RESPONSE));

        const filePaths = itemPaths.map(itemPath => itemPath.file_path);
        const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
        // copy files to .originals repo
        const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
        initUtilsObj.copyFilesTo(filePaths, originalsRepoBranchPath);
        // copy files to .shadow repo
        const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
        initUtilsObj.copyFilesTo(filePaths, shadowRepoBranchPath);
    
        await initUtilsObj.uploadRepo(DEFAULT_BRANCH, "ACCESS_TOKEN", itemPaths,
            TEST_EMAIL, false);
        await waitFor(3);

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
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_SYNCED);
        // Make sure files have been deleted from .originals
        filePaths.forEach(_filePath => {
            const relPath = _filePath.split(path.join(repoPath, path.sep))[1];
            const originalPath = path.join(originalsRepoBranchPath, relPath);
            expect(fs.existsSync(originalPath)).toBe(false);
        });
    });

    test("repo Not In Config",  async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.removeRepo();
        const initUtilsObj = new initUtils(repoPath);
        const itemPaths = initUtilsObj.getSyncablePaths();
        // 1 is .syncignore, other is file.js
        expect(itemPaths).toHaveLength(2);
        // Mock response for checkServerDown
        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(JSON.stringify(TEST_REPO_RESPONSE));
    
        await initUtilsObj.uploadRepo(DEFAULT_BRANCH, "ACCESS_TOKEN", itemPaths,
            TEST_EMAIL, false);

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
        // Verify error msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_SYNCED);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        // Assert API call
        expect(fetch.mock.calls[1][0]).toStrictEqual(API_ROUTES.REPO_INIT);
        const options = fetch.mock.calls[1][1];
        expect(options.method).toStrictEqual('POST');
        expect(options.headers).toStrictEqual({
            'Content-Type': 'application/json',
            'Authorization': `Basic ACCESS_TOKEN`
        });
        const body = JSON.parse(fetch.mock.calls[1][1].body);
        expect(body.name).toStrictEqual(path.basename(repoPath));
        expect(body.is_public).toBe(false);
        expect(body.branch).toStrictEqual(DEFAULT_BRANCH);
        expect(body.source).toStrictEqual(DIFF_SOURCE);
        expect(body.platform).toStrictEqual(os.platform());
        const files_data = JSON.parse(body.files_data);
        [".syncignore", "file.js"].forEach(key => {
            expect(files_data[key]).toBeTruthy();
        });
    });

    test("Error in uploadRepoToServer",  async () => {
        // Write these files as putLogEvent is called when error occurs
        fs.writeFileSync(userFilePath, yaml.safeDump({}));
        fs.writeFileSync(sequenceTokenFilePath, yaml.safeDump({}));

        const initUtilsObj = new initUtils(repoPath);
        const itemPaths = initUtilsObj.getSyncablePaths();
        // 1 is .syncignore, other is file.js
        expect(itemPaths).toHaveLength(2);
        // Mock response for checkServerDown
        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(null);

        await initUtilsObj.uploadRepo(DEFAULT_BRANCH, "ACCESS_TOKEN", itemPaths,
            TEST_EMAIL, false);

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
