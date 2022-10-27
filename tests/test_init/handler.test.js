import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from 'untildify';

import { DEFAULT_BRANCH, GITIGNORE, NOTIFICATION, SYNCIGNORE } from "../../src/constants";
import fetchMock from "jest-fetch-mock";
import { initHandler } from "../../src/init/init_handler";
import {
    Config,
    DUMMY_FILE_CONTENT,
    getConfigFilePath,
    getSeqTokenFilePath,
    getUserFilePath,
    INVALID_TOKEN_JSON,
    randomBaseRepoPath,
    randomRepoPath,
    TEST_EMAIL,
    TEST_REPO_RESPONSE,
    TEST_USER,
    waitFor,
    addUser
} from "../helpers/helpers";
import { SYNC_IGNORE_FILE_DATA } from "../../src/constants";
import { pathUtils } from "../../src/utils/path_utils";
import { readYML } from "../../src/utils/common";

describe("initHandler: connectRepo", () => {
    let baseRepoPath;
    let repoPath;
    let configPath;
    const user = { email: "dummy@email.cpm"};

    beforeEach(() => {
        jest.clearAllMocks();
        fetch.resetMocks();
        baseRepoPath = randomBaseRepoPath();
        repoPath = randomRepoPath();
        untildify.mockReturnValue(baseRepoPath);

        configPath = getConfigFilePath(baseRepoPath);

        fs.mkdirSync(baseRepoPath, { recursive: true });
        fs.mkdirSync(repoPath, { recursive: true });
        const configData = { repos: {} };
        fs.writeFileSync(configPath, yaml.safeDump(configData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test.only("Server is down", async () => {
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
        const _syncIgnoreData = fs.readFileSync(syncIgnorePath, "utf8");
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
        const _syncIgnoreData = fs.readFileSync(syncIgnorePath, "utf8");
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
        const _syncIgnoreData = fs.readFileSync(syncIgnorePath, "utf8");
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
        const _syncIgnoreData = fs.readFileSync(syncIgnorePath, "utf8");
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
        const _syncIgnoreData = fs.readFileSync(syncIgnorePath, "utf8");
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
    let sequenceTokenFilePath;
    const fileName = "file_1.js";
    let filePath;
    let pathUtilsObj;
    let shadowFilePath;
    let originalsFilePath;
    const user = {email: "dummy@email.cpm"};

    beforeEach(() => {
        jest.clearAllMocks();
        fetch.resetMocks();
        baseRepoPath = randomBaseRepoPath();
        untildify.mockReturnValue(baseRepoPath);
        repoPath = randomRepoPath();
        filePath = path.join(repoPath, fileName);
        pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
        shadowFilePath = path.join(pathUtilsObj.getShadowRepoBranchPath(), fileName);
        originalsFilePath = path.join(pathUtilsObj.getOriginalsRepoBranchPath(), fileName);
        fs.mkdirSync(baseRepoPath, { recursive: true });
        fs.mkdirSync(repoPath, { recursive: true });
        const configData = { repos: {} };
        configPath = getConfigFilePath(baseRepoPath);
        userFilePath = getUserFilePath(baseRepoPath);
        sequenceTokenFilePath = getSeqTokenFilePath(baseRepoPath);

        fs.writeFileSync(configPath, yaml.safeDump(configData));
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
        // Verify sequence_token.yml
        let users = readYML(sequenceTokenFilePath);
        expect(users[TEST_EMAIL]).toStrictEqual("");
        // verify user.yml
        users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(0);
        // Verify file added in .shadow but removed from .originals
        expect(fs.existsSync(shadowFilePath)).toBe(true);
        await waitFor(3);
        expect(fs.existsSync(originalsFilePath)).toBe(false);
    });
});
