import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from "untildify";
import fetchMock from "jest-fetch-mock";
import getBranchName from "current-git-branch";

import {
    connectRepoHandler,
    trackFileHandler,
    trackRepoHandler,
} from "../../src/handlers/commands_handler";
import { RepoState } from "../../src/utils/repo_state_utils";
import {RepoDisconnectHandler, RepoReconnectHandler} from "../../src/handlers/repo_commands";
import {
    Config,
    getConfigFilePath,
    getUserFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    setWorkspaceFolders,
    TEST_EMAIL,
    addUser
} from "../helpers/helpers";
import {
    NOTIFICATION,
    DEFAULT_BRANCH,
    getRepoInSyncMsg,
    contextVariables,
    getRepoDisconnectedMsg,
    getRepoReconnectedMsg
} from "../../src/constants";
import {systemConfig} from "../../src/settings";
import {readYML} from "../../src/utils/common";
import { authHandler } from "../../src/handlers/user_commands";

describe("authHandler",  () => {
    
    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
    });

    test("authHandler:skipAskConnect=false",  () => {
        authHandler();
        expect(global.skipAskConnect).toBe(false);
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
    });

    test("authHandler:skipAskConnect=true",  () => {
        authHandler(true);
        expect(global.skipAskConnect).toBe(true);
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
    });

});

describe("connectRepoHandler",  () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const configData = {repos: {}};
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {};
    userData[TEST_EMAIL] = {access_token: "ABC"};

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        setWorkspaceFolders(repoPath);
        new RepoState(repoPath).setSubDirState();
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.dump(configData));
        fs.writeFileSync(userFilePath, yaml.dump(userData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No Repo Path", async () => {
        await connectRepoHandler();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("repo Not In Config", async () => {
        const userResponse = {user: {email: TEST_EMAIL}};
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(userResponse));
        await connectRepoHandler();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
        // TODO: In case we activate choose account option
        // expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        // expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.CHOOSE_ACCOUNT);
        // expect(vscode.window.showInformationMessage.mock.calls[0][1]).toStrictEqual(TEST_EMAIL);
        // expect(vscode.window.showInformationMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.USE_DIFFERENT_ACCOUNT);
    });

    test("repo In Config", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        await connectRepoHandler();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        const repoInSyncMsg = getRepoInSyncMsg(repoPath);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(repoInSyncMsg);
    });

});

describe("RepoDisconnectHandler.run",  () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const configData = {repos: {}};
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {};
    userData[TEST_EMAIL] = {access_token: "ABC"};

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        setWorkspaceFolders(repoPath);
        new RepoState(repoPath).setSubDirState();
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        addUser(baseRepoPath);
        fs.writeFileSync(configPath, yaml.dump(configData));
        fs.writeFileSync(userFilePath, yaml.dump(userData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No Repo Path", () => {
        new RepoDisconnectHandler().run();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("Ask Disconnect confirmation", () => {
        new RepoDisconnectHandler().run();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showWarningMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_DISCONNECT_CONFIRMATION);
        expect(vscode.window.showWarningMessage.mock.calls[0][1]).toStrictEqual(NOTIFICATION.YES);
        expect(vscode.window.showWarningMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.CANCEL);
    });

    test("Ask Disconnect parent confirmation; Sub Dir of synced repo", () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        const subDir = path.join(repoPath, "directory");
        setWorkspaceFolders(subDir);
        new RepoState(subDir).setSubDirState();
        new RepoDisconnectHandler().run();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showWarningMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_DISCONNECT_PARENT_CONFIRMATION);
        expect(vscode.window.showWarningMessage.mock.calls[0][1]).toStrictEqual(NOTIFICATION.YES);
        expect(vscode.window.showWarningMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.CANCEL);
    });
});


describe("RepoDisconnectHandler.postSelection",  () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const configData = {repos: {}};
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {};
    userData[TEST_EMAIL] = {access_token: "ABC"};

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        setWorkspaceFolders(repoPath);
        new RepoState(repoPath).setSubDirState();
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.dump(configData));
        fs.writeFileSync(userFilePath, yaml.dump(userData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No Selection", async () => {
        const commandHandler = new RepoDisconnectHandler();
        await commandHandler.postSelection(undefined);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(0);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("Clicked Cancel", async () => {
        const commandHandler = new RepoDisconnectHandler();
        await commandHandler.postSelection(NOTIFICATION.CANCEL);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(0);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("Repo is already disconnected", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo(true);
        const commandHandler = new RepoDisconnectHandler();
        await commandHandler.postSelection(NOTIFICATION.YES);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(0);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("Disconnecting error from server", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        const errJSON = {error: {message: "NOT SO FAST"}};
        fetchMock.mockResponseOnce(JSON.stringify(errJSON));
        const commandHandler = new RepoDisconnectHandler();
        await commandHandler.postSelection(NOTIFICATION.YES);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_DISCONNECT_FAILED);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(0);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("Should Disconnect", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        fetchMock.mockResponseOnce(JSON.stringify({}));
        const commandHandler = new RepoDisconnectHandler();
        await commandHandler.postSelection(NOTIFICATION.YES);
        // Read config
        const config = readYML(configPath);
        expect(config.repos[repoPath].is_disconnected).toBe(true);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(4);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.isSubDir);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.isSyncIgnored);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual(contextVariables.isDisconnectedRepo);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(true);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        const msg = getRepoDisconnectedMsg(repoPath);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(msg);
    });
});

describe("RepoReconnectHandler.run",  () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const configData = {repos: {}};
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {};
    userData[TEST_EMAIL] = {access_token: "ABC"};

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        setWorkspaceFolders(repoPath);
        new RepoState(repoPath).setSubDirState();
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.dump(configData));
        fs.writeFileSync(userFilePath, yaml.dump(userData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Reconnect Repo", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo(true);
        fetchMock.mockResponseOnce(JSON.stringify({}));
        // Reconnect
        const reconnectHandler = new RepoReconnectHandler();
        await reconnectHandler.run();
        const msg = getRepoReconnectedMsg(repoPath);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(msg);
        // verify config
        const config = readYML(configPath);
        expect(config.repos[repoPath].is_disconnected).toBe(false);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(2);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.isDisconnectedRepo);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
    });

    test("Try to reconnect Repo already connected repo", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        fetchMock.mockResponseOnce(JSON.stringify({}));
        // Reconnect
        const reconnectHandler = new RepoReconnectHandler();
        await reconnectHandler.run();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
        // verify config
        const config = readYML(configPath);
        expect(config.repos[repoPath].is_disconnected).toBe(false);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(0);
    });

    test("API error while reconnecting repo", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo(true);
        fetchMock.mockResponseOnce(JSON.stringify({error: {message: "Error Msg"}}));
        // Reconnect
        const reconnectHandler = new RepoReconnectHandler();
        await reconnectHandler.run();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_RECONNECT_FAILED);
        // verify config
        const config = readYML(configPath);
        expect(config.repos[repoPath].is_disconnected).toBe(true);
    });

});

describe("trackRepoHandler",  () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const configData = {repos: {}};
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {};
    userData[TEST_EMAIL] = {access_token: "ABC"};

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        new RepoState(repoPath).setSubDirState();
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.dump(configData));
        fs.writeFileSync(userFilePath, yaml.dump(userData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No Repo Path",  () => {
        setWorkspaceFolders(undefined);
        trackRepoHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(0);
    });

    test("Repo in config", async () => {
        setWorkspaceFolders(repoPath);
        configData.repos[repoPath] = {
            id: 1234,
            branches: {},
        };
        fs.writeFileSync(configPath, yaml.dump(configData));
        const playbackLink = trackRepoHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
        expect(playbackLink.startsWith(systemConfig.WEBAPP_HOST)).toBe(true);
    });

    test("With nested directory", async () => {
        const subDir = path.join(repoPath, "directory");
        setWorkspaceFolders(subDir);
        configData.repos[repoPath] = {
            id: 1234,
            branches: {},
            email: TEST_EMAIL
        };
        fs.writeFileSync(configPath, yaml.dump(configData));
        new RepoState(subDir).setSubDirState();
        const playbackLink = trackRepoHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
        expect(playbackLink.startsWith(systemConfig.WEBAPP_HOST)).toBe(true);
    });
});

describe("trackFileHandler",  () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const configData = {repos: {}};
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {};
    userData[TEST_EMAIL] = {access_token: "ABC"};

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        new RepoState(repoPath).setSubDirState();
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.dump(configData));
        fs.writeFileSync(userFilePath, yaml.dump(userData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No Repo Path",  () => {
        setWorkspaceFolders(undefined);
        trackFileHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(0);
    });

    test("No editor is opened",  () => {
        // Mock data
        setWorkspaceFolders(repoPath);
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValueOnce(undefined);
        trackFileHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(0);
    });

    test("No file is opened",  () => {
        // Mock data
        setWorkspaceFolders(repoPath);
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValueOnce({
            document: {
                fileName: undefined
            }
        });
        trackFileHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(0);
    });

    test("File Path not in config",  () => {
        // Mock data
        setWorkspaceFolders(repoPath);
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document: {
                fileName: path.join(repoPath, "file.js")
            }
        });
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        // Update config file
        configData.repos[repoPath] = {
            id: 1234,
            branches: {},
        };
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = {};
        fs.writeFileSync(configPath, yaml.dump(configData));

        trackFileHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(0);
    });

    test("File Path in config",  () => {
        // Mock data
        setWorkspaceFolders(repoPath);
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document: {
                fileName: path.join(repoPath, "file.js")
            }
        });
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        // Update config file
        configData.repos[repoPath] = {
            id: 1234,
            branches: {}
        };
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = {"file.js": 1234};
        fs.writeFileSync(configPath, yaml.dump(configData));

        trackFileHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
    });

    test("With nested directory",  () => {
        // Mock data
        const subDir = path.join(repoPath, "directory");
        setWorkspaceFolders(subDir);
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document: {
                fileName: path.join(repoPath, "file.js")
            }
        });
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        // Update config file
        configData.repos[repoPath] = {
            id: 1234,
            branches: {},
            email: TEST_EMAIL
        };
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = {"file.js": 1234};
        fs.writeFileSync(configPath, yaml.dump(configData));
        new RepoState(subDir).setSubDirState();
        trackFileHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
    });
});
