import fs from "fs";
import vscode from "vscode";
import yaml from "js-yaml";
import {randomBaseRepoPath, randomRepoPath} from "../../helpers/helpers";
import {createSystemDirectories, setupCodeSync, showConnectRepoView, showLogIn} from "../../../src/utils/setup_utils";
import {NOTIFICATION} from "../../../out/constants";


describe("createSystemDirectories",  () => {
    const baseRepoPath = randomBaseRepoPath();

    beforeEach(() => {
        jest.resetModules(); // Most important - it clears the cache
        fs.mkdirSync(baseRepoPath, { recursive: true });
    });

    afterEach(() => {
        fs.rmdirSync(baseRepoPath, { recursive: true });
    });

    test('createSystemDirectories',  () => {
        createSystemDirectories(baseRepoPath);
        const lsResult = fs.readdirSync(baseRepoPath);
        expect(lsResult.includes(".diffs")).toBe(true);
        expect(lsResult.includes(".originals")).toBe(true);
        expect(lsResult.includes(".shadow")).toBe(true);
        expect(lsResult.includes(".deleted")).toBe(true);
        expect(lsResult.includes("config.yml")).toBe(true);
        expect(lsResult.includes("sequence_token.yml")).toBe(true);
    });
});

describe("setupCodeSync",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const userFilePath = `${baseRepoPath}/user.yml`;
    const userData = {"dummy_email": {access_token: "ABC"}};

    const configPath = `${baseRepoPath}/config.yml`;
    const configData = {repos: {}};
    configData.repos[repoPath] = {branches: {}};

    beforeEach(() => {
        jest.clearAllMocks();
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
    });

    afterEach(() => {
        fs.rmdirSync(baseRepoPath, {recursive: true});
        fs.rmdirSync(repoPath, {recursive: true});
    });

    test('with no user.yml', async () => {
        const port = await setupCodeSync(repoPath, baseRepoPath);
        const lsResult = fs.readdirSync(baseRepoPath);
        expect(lsResult.includes(".diffs")).toBe(true);
        expect(lsResult.includes(".originals")).toBe(true);
        expect(lsResult.includes(".shadow")).toBe(true);
        expect(lsResult.includes(".deleted")).toBe(true);
        expect(lsResult.includes("config.yml")).toBe(true);
        expect(lsResult.includes("sequence_token.yml")).toBe(true);
        // should return port number
        expect(port).toBeTruthy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.WELCOME_MSG);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.JOIN);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.IGNORE);
    });

    test('with empty user.yml', async () => {
        fs.writeFileSync(userFilePath, yaml.safeDump({}));
        const port = await setupCodeSync(repoPath, baseRepoPath);
        // should return port number
        expect(port).toBeTruthy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.WELCOME_MSG);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.JOIN);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.IGNORE);
        fs.rmSync(userFilePath);
    });

    test('with user and repo not synced', async () => {
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
        const port = await setupCodeSync(repoPath, baseRepoPath);
        // should return port number
        expect(port).toBeTruthy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.CONNECT_REPO);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.CONNECT);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.IGNORE);
        fs.rmSync(userFilePath);
    });

    test('with synced repo',  async () => {
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
        fs.writeFileSync(configPath, yaml.safeDump(configData));
        const port = await setupCodeSync(repoPath, baseRepoPath);
        // should return port number
        expect(port).toBeFalsy();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.REPO_IN_SYNC);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.TRACK_IT);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.UNSYNC_REPO);
        fs.rmSync(userFilePath);
    });

    test('showConnectRepoView',  async () => {
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
        fs.writeFileSync(configPath, yaml.safeDump(configData));
        const shouldShowConnectRepoView = showConnectRepoView(userFilePath);
        expect(shouldShowConnectRepoView).toBe(true);
    });
});


describe("showLogin",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const userFilePath = `${baseRepoPath}/user.yml`;
    const userData = {"dummy_email": {access_token: "ABC"}};

    beforeEach(() => {
        jest.resetModules(); // Most important - it clears the cache
        fs.mkdirSync(baseRepoPath, { recursive: true });
    });

    afterEach(() => {
        fs.rmdirSync(baseRepoPath, { recursive: true });
    });

    test('with no user.yml',   () => {
        const shouldShowLogin = showLogIn(userFilePath);
        expect(shouldShowLogin).toBe(true);
    });

    test('with empty user.yml',  async () => {
        fs.writeFileSync(userFilePath, yaml.safeDump({}));
        const shouldShowLogin = showLogIn(userFilePath);
        expect(shouldShowLogin).toBe(true);
        fs.rmSync(userFilePath);
    });

    test('with user',  async () => {
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
        const shouldShowLogin = showLogIn(userFilePath);
        expect(shouldShowLogin).toBe(false);
        fs.rmSync(userFilePath);
    });
});
