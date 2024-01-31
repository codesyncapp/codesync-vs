import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from "untildify";

import {
    addUser,
    Config,
    getConfigFilePath,
    getUserFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    DEFAULT_SYNCIGNORE_TEST_DATA
} from "../helpers/helpers";
import {
    createSystemDirectories,
    setupCodeSync,
    showConnectRepoView, 
    showLogIn,
    showRepoIsSyncIgnoredView,
    createOrUpdateSyncignore
} from "../../src/utils/setup_utils";
import { readYML } from "../../src/utils/common";
import { generateSettings } from "../../src/settings";
import {getRepoInSyncMsg, getDirectorySyncIgnoredMsg, getDirectoryIsSyncedMsg, NOTIFICATION, SYNCIGNORE} from "../../src/constants";


describe("createSystemDirectories",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const configPath = path.join(baseRepoPath, "config.yml");

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test('createSystemDirectories', () => {
        createSystemDirectories();
        const lsResult = fs.readdirSync(baseRepoPath);
        expect(lsResult.includes(".diffs")).toBe(true);
        expect(lsResult.includes(".originals")).toBe(true);
        expect(lsResult.includes(".shadow")).toBe(true);
        expect(lsResult.includes(".deleted")).toBe(true);
        expect(lsResult.includes(".locks")).toBe(true);
        expect(lsResult.includes("config.yml")).toBe(true);
        const config = readYML(configPath);
        expect("repos" in config).toBe(true);
    });

    test('createSystemDirectories with invalid config file', () => {
        const dummyText = "dummy text";
        fs.writeFileSync(configPath, dummyText);
        let config = readYML(configPath);
        expect(config).toStrictEqual(dummyText);
        expect(config.repos).toStrictEqual(undefined);
        createSystemDirectories();
        const lsResult = fs.readdirSync(baseRepoPath);
        expect(lsResult.includes(".diffs")).toBe(true);
        expect(lsResult.includes(".originals")).toBe(true);
        expect(lsResult.includes(".shadow")).toBe(true);
        expect(lsResult.includes(".deleted")).toBe(true);
        expect(lsResult.includes(".locks")).toBe(true);
        expect(lsResult.includes("config.yml")).toBe(true);
        config = readYML(configPath);
        expect(config.repos).toStrictEqual({});
    });
});

describe("createOrUpdateSyncignore",  () => {
    const baseRepoPath = randomBaseRepoPath();

    beforeEach(() => {
        jest.clearAllMocks();
        fetch.resetMocks();
        fetchMock.mockResponseOnce(DEFAULT_SYNCIGNORE_TEST_DATA);
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test('get syncignore from s3', async () => {
        const settings = generateSettings();
        if (fs.existsSync(settings.SYNCIGNORE_PATH)) fs.unlinkSync(settings.SYNCIGNORE_PATH);
        await createOrUpdateSyncignore();
        expect(fs.existsSync(settings.SYNCIGNORE_PATH)).toBe(true);
    });
});


describe("setupCodeSync",  () => {
    const userData = {"dummy_email": {access_token: "ABC"}};

    let baseRepoPath;
    let repoPath;
    let userFilePath;
    let configPath;
    const configData = {repos: {}};
    configData.repos[repoPath] = {branches: {}};

    beforeEach(() => {
        baseRepoPath = randomBaseRepoPath();
        repoPath = randomRepoPath();
        userFilePath = getUserFilePath(baseRepoPath);
        configPath = getConfigFilePath(baseRepoPath);
        configData.repos[repoPath] = {branches: {}};
        jest.clearAllMocks();
        fetch.resetMocks();
        fetchMock.mockResponseOnce(DEFAULT_SYNCIGNORE_TEST_DATA);
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test('with no user.yml', async () => {
        const port = await setupCodeSync(undefined);
        const lsResult = fs.readdirSync(baseRepoPath);
        expect(lsResult.includes(".diffs")).toBe(true);
        expect(lsResult.includes(".originals")).toBe(true);
        expect(lsResult.includes(".shadow")).toBe(true);
        expect(lsResult.includes(".deleted")).toBe(true);
        expect(lsResult.includes(".locks")).toBe(true);
        expect(lsResult.includes("config.yml")).toBe(true);
        // should return port number
        expect(port).toBeTruthy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.WELCOME_MSG);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.JOIN);
    });

    test('with empty user.yml', async () => {
        fs.writeFileSync(userFilePath, yaml.dump({}));
        const port = await setupCodeSync(undefined);
        // should return port number
        expect(port).toBeTruthy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.WELCOME_MSG);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.JOIN);
        fs.rmSync(userFilePath);
    });

    test('with no active user', async () => {
        addUser(baseRepoPath, false);
        const port = await setupCodeSync(repoPath);
        // should return port number
        expect(port).toBeTruthy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.WELCOME_MSG);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.JOIN);
        fs.rmSync(userFilePath);
    });

    test('with user no repo opened', async () => {
        fs.writeFileSync(userFilePath, yaml.dump(userData));
        await setupCodeSync("");
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test('with user and repo not synced', async () => {
        fs.writeFileSync(userFilePath, yaml.dump(userData));
        const port = await setupCodeSync(repoPath);
        // should return port number
        expect(port).toBeTruthy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.CONNECT_REPO);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.CONNECT);
        fs.rmSync(userFilePath);
    });

    test('with synced repo',  async () => {
        fs.writeFileSync(userFilePath, yaml.dump(userData));
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        const port = await setupCodeSync(repoPath);
        // should return port number
        expect(port).toBeFalsy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        const msg = getRepoInSyncMsg(repoPath);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.TRACK_IT);
        fs.rmSync(userFilePath);
    });

    test('showConnectRepoView',  async () => {
        fs.writeFileSync(configPath, yaml.dump({repos: {}}));
        const shouldShowConnectRepoView = showConnectRepoView(repoPath);
        expect(shouldShowConnectRepoView).toBe(true);
    });

    test('showRepoIsSyncIgnoredView',  async () => {
        fs.writeFileSync(configPath, yaml.dump({repos: {}}));
        const shouldShow = showRepoIsSyncIgnoredView(repoPath);
        expect(shouldShow).toBe(false);
    });

    test('with sub directory',  async () => {
        fs.writeFileSync(userFilePath, yaml.dump(userData));
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        const subDir = path.join(repoPath, "directory");
        const port = await setupCodeSync(subDir);
        // should return port number
        expect(port).toBeFalsy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        const msg = getDirectoryIsSyncedMsg(subDir, repoPath);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.TRACK_PARENT_REPO);
        fs.rmSync(userFilePath);
    });

    test('with sub directory syncignored',  async () => {
        const subDirName = "directory";
        fs.writeFileSync(userFilePath, yaml.dump(userData));
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        // Add subDir to .syncignore
        const syncignorePath = path.join(repoPath, SYNCIGNORE);
        fs.writeFileSync(syncignorePath, subDirName);
        const subDir = path.join(repoPath, subDirName);
        const port = await setupCodeSync(subDir);
        // should return port number
        expect(port).toBeTruthy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        const msg = getDirectorySyncIgnoredMsg(subDir, repoPath);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.OPEN_SYNCIGNORE);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.TRACK_PARENT_REPO);
        expect(vscode.window.showInformationMessage.mock.calls[0][3]).toBe(NOTIFICATION.DISCONNECT_PARENT_REPO);
        fs.rmSync(userFilePath);
    });

    test('with sub directory whose parent is_disconnected',  async () => {
        fs.writeFileSync(userFilePath, yaml.dump(userData));
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo(true);
        addUser(baseRepoPath);
        const subDir = path.join(repoPath, "directory");
        const port = await setupCodeSync(subDir);
        // should return port number
        // should return port number
        expect(port).toBeTruthy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.CONNECT_REPO);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.CONNECT);
        fs.rmSync(userFilePath);
    });
});


describe("showLogin",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {"dummy_email": {access_token: "ABC"}};

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test('with no user.yml',   () => {
        const shouldShowLogin = showLogIn();
        expect(shouldShowLogin).toBe(true);
    });

    test('with empty user.yml',  async () => {
        fs.writeFileSync(userFilePath, yaml.dump({}));
        const shouldShowLogin = showLogIn();
        expect(shouldShowLogin).toBe(true);
        fs.rmSync(userFilePath);
    });

    test('with no active user',  async () => {
        addUser(baseRepoPath, false);
        const shouldShowLogin = showLogIn();
        expect(shouldShowLogin).toBe(true);
        fs.rmSync(userFilePath);
    });

    test('with user',  async () => {
        fs.writeFileSync(userFilePath, yaml.dump(userData));
        const shouldShowLogin = showLogIn();
        expect(shouldShowLogin).toBe(false);
        fs.rmSync(userFilePath);
    });
});
