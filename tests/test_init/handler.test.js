import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";
import isOnline from 'is-online';
import untildify from 'untildify';
import { DEFAULT_BRANCH, GITIGNORE, NOTIFICATION, SYNCIGNORE } from "../../src/constants";
import fetchMock from "jest-fetch-mock";
import { initHandler } from "../../src/init/init_handler";
import {
    Config,
    DUMMY_FILE_CONTENT,
    getConfigFilePath,
    getUserFilePath,
    INVALID_TOKEN_JSON,
    randomBaseRepoPath,
    randomRepoPath,
    TEST_REPO_RESPONSE,
    TEST_USER,
    waitFor,
    addUser,
    writeTestRepoFiles
} from "../helpers/helpers";
import { SYNC_IGNORE_FILE_DATA } from "../../src/constants";
import { pathUtils } from "../../src/utils/path_utils";
import { readYML, readFile } from "../../src/utils/common";
import { createSystemDirectories } from "../../src/utils/setup_utils";
import { CodeSyncState, CODESYNC_STATES } from "../../src/utils/state_utils";
import { s3UploaderUtils } from "../../src/init/s3_uploader";

describe("initHandler: connectRepo", () => {
    let baseRepoPath;
    let repoPath;
    let configPath;
    const user = { email: "dummy@email.cpm"};

    beforeEach(() => {
        jest.clearAllMocks();
        fetch.resetMocks();
        global.IS_CODESYNC_TEST_MODE = true;
        
        baseRepoPath = randomBaseRepoPath("initHandler_connectRepo");
        repoPath = randomRepoPath();

        fs.mkdirSync(baseRepoPath, { recursive: true });
        fs.mkdirSync(repoPath, { recursive: true });

        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();
        
        configPath = getConfigFilePath(baseRepoPath);
        const configData = { repos: {} };
        fs.writeFileSync(configPath, yaml.dump(configData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Server is down", async () => {
        fetchMock.mockResponseOnce(null);
        const handler = new initHandler(repoPath, "ACCESS_TOKEN");
        await handler.connectRepo();
        // Verify error msg
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.SERVICE_NOT_AVAILABLE);
    });

    test("Invalid access token", async () => {
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const handler = new initHandler(repoPath, "ACCESS_TOKEN");
        await handler.connectRepo();
        // Verify error msg
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.AUTHENTICATION_FAILED);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toStrictEqual(NOTIFICATION.LOGIN);
        expect(vscode.window.showErrorMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.IGNORE);
    });

    test("Repo already synced", async () => {
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(user));
        const handler = new initHandler(repoPath, "ACCESS_TOKEN");
        // Add repo in config
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        await handler.connectRepo();
        // Verify error msg
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showWarningMessage.mock.calls[0][0].startsWith("Repo is already in sync with branch")).toBe(true);
    });

    test("Repo is_disconnected", async () => {
        const syncIgnorePath = path.join(repoPath, SYNCIGNORE);
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(user));
        // Add repo in config
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo(true);
        addUser(baseRepoPath);
        const handler = new initHandler(repoPath, "ACCESS_TOKEN");
        await handler.connectRepo();
        // Verify error msg
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(fs.existsSync(syncIgnorePath)).toBe(true);
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(1);
    });

    test("Repo is_disconnected, syncing sub directory", async () => {
        const subDir = path.join(repoPath, "directory");
        fs.mkdirSync(subDir);
        const syncIgnorePath = path.join(subDir, SYNCIGNORE);
        const handler = new initHandler(subDir, "ACCESS_TOKEN");
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(user));
        // Add repo in config
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo(true);
        addUser(baseRepoPath);
        await handler.connectRepo();
        // Verify error msg
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(fs.existsSync(syncIgnorePath)).toBe(true);
        const _syncIgnoreData = readFile(syncIgnorePath);
        expect(_syncIgnoreData).toStrictEqual(SYNC_IGNORE_FILE_DATA);
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(1);
    });

    test(".syncignore should be created", async () => {
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(user));
        const handler = new initHandler(repoPath, "ACCESS_TOKEN");
        await handler.connectRepo();
        // Verify error msg
        const syncIgnorePath = path.join(repoPath, SYNCIGNORE);
        expect(fs.existsSync(syncIgnorePath)).toBe(true);
        const _syncIgnoreData = readFile(syncIgnorePath);
        expect(_syncIgnoreData).toStrictEqual(SYNC_IGNORE_FILE_DATA);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(1);
    });

    test(".syncignore should match with .gitignore", async () => {
        const gitignorePath = path.join(repoPath, GITIGNORE);
        const gitignoreData = ".idea\nnode_modules";
        fs.writeFileSync(gitignorePath, gitignoreData);
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(user));
        const handler = new initHandler(repoPath, "ACCESS_TOKEN");
        await handler.connectRepo();
        // Verify error msg
        const syncIgnorePath = path.join(repoPath, SYNCIGNORE);
        expect(fs.existsSync(syncIgnorePath)).toBe(true);
        const _syncIgnoreData = readFile(syncIgnorePath);
        expect(_syncIgnoreData).toStrictEqual(gitignoreData);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(1);
    });

    test(".syncignore exists", async () => {
        const syncIgnorePath = path.join(repoPath, SYNCIGNORE);
        const syncIgnoreData = ".idea\nnode_modules";
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(user));
        const handler = new initHandler(repoPath, "ACCESS_TOKEN");
        await handler.connectRepo();
        expect(fs.existsSync(syncIgnorePath)).toBe(true);
        const _syncIgnoreData = readFile(syncIgnorePath);
        expect(_syncIgnoreData).toStrictEqual(syncIgnoreData);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(1);
    });

    test("via Daemon", async () => {
        const syncIgnorePath = path.join(repoPath, SYNCIGNORE);
        const syncIgnoreData = ".idea\nnode_modules";
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(user));
        const handler = new initHandler(repoPath, "ACCESS_TOKEN", true);
        await handler.connectRepo();
        // Verify .syncignore has been created
        expect(fs.existsSync(syncIgnorePath)).toBe(true);
        const _syncIgnoreData = readFile(syncIgnorePath);
        expect(_syncIgnoreData).toStrictEqual(syncIgnoreData);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(0);
    });
});

describe("initHandler: Syncing Branch", () => {
    let baseRepoPath;
    let repoPath;
    let configPath;
    let userFilePath;
    const fileName = "file_1.js";
    let filePath;
    let pathUtilsObj;
    let shadowFilePath;
    let originalsFilePath;
    const user = {email: "dummy@email.cpm"};

    beforeEach(() => {
        jest.clearAllMocks();
        fetch.resetMocks();
        baseRepoPath = randomBaseRepoPath("initHandler_Syncing Branch");
        repoPath = randomRepoPath();
        fs.mkdirSync(baseRepoPath, { recursive: true });
        fs.mkdirSync(repoPath, { recursive: true });
        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();
        filePath = path.join(repoPath, fileName);
        pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
        shadowFilePath = path.join(pathUtilsObj.getShadowRepoBranchPath(), fileName);
        originalsFilePath = path.join(pathUtilsObj.getOriginalsRepoBranchPath(), fileName);
        const configData = { repos: {} };
        configPath = getConfigFilePath(baseRepoPath);
        userFilePath = getUserFilePath(baseRepoPath);
        fs.writeFileSync(configPath, yaml.dump(configData));
        writeTestRepoFiles(repoPath);
    });

    afterEach(() => {
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
        fs.rmSync(repoPath, { recursive: true, force: true });
    });

    test("Syncing Branch, Server down", async () => {
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(user))
            .mockResponseOnce(JSON.stringify({ status: false }));
        const handler = new initHandler(repoPath, "ACCESS_TOKEN", true);
        await handler.connectRepo();
        // Verify error msg
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        // Verify null against file_id in config file
        const config = readYML(configPath);
        expect(repoPath in config.repos).toBe(true);
        expect(DEFAULT_BRANCH in config.repos[repoPath].branches).toBe(true);
        expect(fileName in config.repos[repoPath].branches[DEFAULT_BRANCH]).toBe(true);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH][fileName]).toStrictEqual(null);
        // Verify file added in .shadow and .originals
        expect(fs.existsSync(shadowFilePath)).toBe(true);
        expect(fs.existsSync(originalsFilePath)).toBe(true);
    });

    test("Should sync branch", async () => {
        isOnline.mockReturnValue(true);
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(user))
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(TEST_REPO_RESPONSE));
        const handler = new initHandler(repoPath, "ACCESS_TOKEN", true);
        await handler.connectRepo();
        // Verify error msg
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        // Verify null against file_id in config file
        const config = readYML(configPath);
        expect(repoPath in config.repos).toBe(true);
        expect(DEFAULT_BRANCH in config.repos[repoPath].branches).toBe(true);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH]).toStrictEqual(TEST_REPO_RESPONSE.file_path_and_id);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH][fileName]).toBe(TEST_REPO_RESPONSE.file_path_and_id[fileName]);
        // verify user.yml
        const users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(0);
        // Verify file added in .shadow but removed from .originals
        expect(fs.existsSync(shadowFilePath)).toBe(true);
        const uploaderUtils = new s3UploaderUtils();
        await uploaderUtils.runUploader();
        await waitFor(3);
        expect(fs.existsSync(originalsFilePath)).toBe(false);
        const syncingBranchKey = `${CODESYNC_STATES.SYNCING_BRANCH}:${repoPath}:${DEFAULT_BRANCH}`;
        expect(CodeSyncState.get(syncingBranchKey)).toBe(false);
        expect(CodeSyncState.get(CODESYNC_STATES.IS_SYNCING_BRANCH)).toBe(false);
        expect(fs.readdirSync(pathUtils.getS3UploaderRepo())).toHaveLength(0);
    });
});
