import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";
import isOnline from 'is-online';
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
    randomRepoPath, getConfigFilePath, getSyncIgnoreFilePath, getUserFilePath, Config, addUser, waitFor,
    writeTestRepoFiles,
    NESTED_PATH
} from "../helpers/helpers";
import {API_ROUTES, DEFAULT_BRANCH, VSCODE, NOTIFICATION, SYNCIGNORE} from "../../src/constants";
import {readYML} from "../../src/utils/common";
import fetchMock from "jest-fetch-mock";
import {pathUtils} from "../../src/utils/path_utils";
import { createSystemDirectories, generateRandomNumber } from "../../src/utils/setup_utils";
import { s3UploaderUtils } from "../../src/init/s3_uploader";


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

    test("No .syncignore", async () => {
        fs.writeFileSync(filePath, "");
        const initUtilsObj = new initUtils(repoPath);
        const paths = await initUtilsObj.getSyncablePaths();
        expect(paths).toHaveLength(1);
    });

    test("Ignore file and match rest", async () => {
        fs.writeFileSync(filePath, "");
        fs.writeFileSync(path.join(repoPath, "ignore.js"), DUMMY_FILE_CONTENT);
        fs.writeFileSync(syncIgnorePath, SYNC_IGNORE_DATA+"\nignore.js");
        const initUtilsObj = new initUtils(repoPath);
        const paths = await initUtilsObj.getSyncablePaths();
        // 1 is .syncignore, other is file.js
        expect(paths).toHaveLength(2);
        paths.sort((a, b) => a.size - b.size);
        expect(paths[0].rel_path).toStrictEqual("file.js");
        expect(paths[0].is_binary).toBe(false);
        expect(paths[0].file_path).toStrictEqual(filePath);
        expect(paths[0].size).toStrictEqual(0);
        expect(paths[1].rel_path).toStrictEqual(SYNCIGNORE);
        expect(paths[1].is_binary).toBe(false);
        expect(paths[1].file_path).toStrictEqual(syncIgnorePath);
        expect(paths[1].size).toBeTruthy();
    });

    test("Dot files/directories", async () => {
        // .directory should be ignored, .ignore file should be considered
        const dotRepoPath = path.join(repoPath, ".directory");
        const filePath = path.join(repoPath, ".ignore");
        fs.mkdirSync(dotRepoPath, {recursive: true});
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        const initUtilsObj = new initUtils(repoPath);
        const paths = await initUtilsObj.getSyncablePaths();
        expect(paths).toHaveLength(1);
        expect(paths[0].rel_path).toStrictEqual(".ignore");
        expect(paths[0].is_binary).toBe(false);
        expect(paths[0].file_path).toStrictEqual(filePath);
        expect(paths[0].size === 0).toBe(false);
    });

    test("with symlink", async () => {
        const dotRepoPath = path.join(repoPath, ".directory");
        fs.symlinkSync(repoPath, dotRepoPath);
        const initUtilsObj = new initUtils(repoPath);
        const paths = await initUtilsObj.getSyncablePaths();
        expect(paths).toHaveLength(0);
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
    const repoPath = randomRepoPath();
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
        const initUtilsObj = new initUtils(repoPath);
        initUtilsObj.saveIamUser(TEST_USER);
        expect(fs.existsSync(userFilePath)).toBe(true);
        const users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
    });

    test("With no active user.yml",  () => {
        addUser(baseRepoPath, false);
        const initUtilsObj = new initUtils(repoPath);
        initUtilsObj.saveIamUser(TEST_USER);
        expect(fs.existsSync(userFilePath)).toBe(true);
        const users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
    });

    test("User not in user.yml",  () => {
        fs.writeFileSync(userFilePath, yaml.dump(userFileData));
        const testUser = Object.assign({}, TEST_USER);
        testUser.email = ANOTHER_TEST_EMAIL;
        const initUtilsObj = new initUtils(repoPath);
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
        fs.writeFileSync(userFilePath, yaml.dump(userFileData));
        const testUser = Object.assign({}, TEST_USER);
        testUser.email = TEST_EMAIL;
        const initUtilsObj = new initUtils(repoPath);
        initUtilsObj.saveIamUser(testUser);
        expect(fs.existsSync(userFilePath)).toBe(true);
        const users = readYML(userFilePath);
        expect(users[TEST_EMAIL].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_EMAIL].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
        expect(users[TEST_EMAIL].access_token).toStrictEqual("TOKEN ABC");
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
        fs.writeFileSync(configPath, yaml.dump(configData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Should save file IDs",  () => {
        const initUtilsObj = new initUtils(repoPath);
        initUtilsObj.saveFileIds(DEFAULT_BRANCH, TEST_EMAIL, TEST_REPO_RESPONSE);
        const config = readYML(configPath);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH]).toStrictEqual(TEST_REPO_RESPONSE.file_path_and_id);
    });
});

describe("uploadRepo",  () => {
    let baseRepoPath;
    let s3UploaderRepo;
    let repoPath;
    let syncIgnorePath;
    let configPath;
    let userFilePath;

    const expectedConfig = {
        ".syncignore": null,
        "file_1.js": null,
    };
    expectedConfig[NESTED_PATH] = null;
    const mockTabs = [
        {
            tabs: [
                {
                    input: {
                            uri: {
                                path: 'newFilePath1',
                        }
                    },
                    isActive: true,
                },
                {
                    input: {
                            uri: {
                                path: 'newFilePath2',
                        }
                    },
                    isActive: false,
                },
            ]
        }
    ]

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
        writeTestRepoFiles(repoPath);
        addUser(baseRepoPath);
        configPath = getConfigFilePath(baseRepoPath);
        userFilePath = getUserFilePath(baseRepoPath);
        syncIgnorePath = getSyncIgnoreFilePath(repoPath);
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo(false, TEST_EMAIL, expectedConfig);
        fs.writeFileSync(syncIgnorePath, SYNC_IGNORE_DATA+"\nignore.js");
        fs.writeFileSync(path.join(repoPath, "ignore.js"), DUMMY_FILE_CONTENT);
        s3UploaderRepo = pathUtils.getS3UploaderRepo();
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Server Down",  async () => {
        // Generate ItemPaths
        const initUtilsObj = new initUtils(repoPath);
        const itemPaths = await initUtilsObj.getSyncablePaths();
        // Files count from TEST_RESPONSE_DATA
        expect(itemPaths).toHaveLength(3);
        // Mock response for checkServerDown
        fetchMock.mockResponseOnce(JSON.stringify({status: false}));
        await initUtilsObj.uploadRepo(DEFAULT_BRANCH, "ACCESS_TOKEN", itemPaths,
            TEST_EMAIL, false, generateRandomNumber(1,10));
        // Verify file Ids have been added in config
        const config = readYML(configPath);
        const expectedConfig = {
            ".syncignore": null,
            "file_1.js": null,
        };
        expectedConfig[NESTED_PATH] = null;
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH]).toStrictEqual(expectedConfig);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("repo In Config",  async () => {
        isOnline.mockReturnValue(true);
        Object.defineProperty(vscode.window.tabGroups, 'all', {
            get: jest.fn(() => mockTabs),
        });

        // Generate ItemPaths
        const initUtilsObj = new initUtils(repoPath);
        const itemPaths = await initUtilsObj.getSyncablePaths();
        // Files count from TEST_RESPONSE_DATA
        expect(itemPaths).toHaveLength(3);
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
        // Run s3Uploader
        const uploaderUtils = new s3UploaderUtils();
        await uploaderUtils.runUploader();
        await waitFor(4);
        // Verify file Ids have been added in config
        const config = readYML(configPath);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH]).toStrictEqual(TEST_REPO_RESPONSE.file_path_and_id);
        // verify user.yml
        const users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_CONNECTED);
        // Make sure files have been deleted from .originals
        filePaths.forEach(_filePath => {
            const relPath = _filePath.split(path.join(repoPath, path.sep))[1];
            const originalPath = path.join(originalsRepoBranchPath, relPath);
            expect(fs.existsSync(originalPath)).toBe(false);
        });
        let diffFiles = fs.readdirSync(s3UploaderRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("repo Not In Config",  async () => {
        Object.defineProperty(vscode.window.tabGroups, 'all', {
            get: jest.fn(() => mockTabs),
          });    
        const configUtil = new Config(repoPath, configPath);
        configUtil.removeRepo();
        const initUtilsObj = new initUtils(repoPath);
        const itemPaths = await initUtilsObj.getSyncablePaths();
        // Files count from TEST_RESPONSE_DATA
        expect(itemPaths).toHaveLength(3);
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

        // verify user.yml
        const users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
        // Verify notification msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_CONNECTED);
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
        expect(body.source).toStrictEqual(VSCODE);
        expect(body.platform).toStrictEqual(os.platform());
        const files_data = JSON.parse(body.files_data);
        Object.keys(TEST_REPO_RESPONSE.file_path_and_id).forEach(key => {
            expect(files_data[key]).toBeTruthy();
        });
    });

    test("Error in uploadRepoToServer",  async () => {
        const initUtilsObj = new initUtils(repoPath);
        const itemPaths = await initUtilsObj.getSyncablePaths();
        // Files count from TEST_RESPONSE_DATA
        expect(itemPaths).toHaveLength(3);
        // Mock response for checkServerDown
        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(null);
        await initUtilsObj.uploadRepo(DEFAULT_BRANCH, "ACCESS_TOKEN", itemPaths,
            TEST_EMAIL, false, generateRandomNumber(1,10));
        // Verify file Ids were not added in config
        const config = readYML(configPath);
        expect(DEFAULT_BRANCH in config.repos[repoPath].branches[DEFAULT_BRANCH]).toBe(false);
        // verify user.yml
        const users = readYML(userFilePath);
        expect(users[TEST_EMAIL].iam_access_key).toBe(undefined);
        expect(users[TEST_EMAIL].iam_secret_key).toBe(undefined);
        // Verify error msg
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_CONNECTE_FAILED);
    });
});
