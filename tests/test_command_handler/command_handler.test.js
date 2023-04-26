import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from "untildify";
import fetchMock from "jest-fetch-mock";
import getBranchName from "current-git-branch";

import {
    postSelectionDisconnectRepo,
    SignUpHandler,
    SyncHandler,
    trackFileHandler,
    trackRepoHandler,
    disconnectRepoHandler
} from "../../src/handlers/commands_handler";
import {
    Config,
    getConfigFilePath,
    getUserFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    setWorkspaceFolders,
    TEST_EMAIL
} from "../helpers/helpers";
import {
    NOTIFICATION,
    DEFAULT_BRANCH,
    getRepoInSyncMsg
} from "../../src/constants";
import {WEB_APP_URL} from "../../src/settings";
import {readYML} from "../../src/utils/common";


describe("SignUpHandler",  () => {

    test("SignUpHandler",  () => {
        SignUpHandler();
        expect(global.skipAskConnect).toBe(false);
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
    });
});

describe("SyncHandler",  () => {
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
        setWorkspaceFolders(repoPath);
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.dump(configData));
        fs.writeFileSync(userFilePath, yaml.dump(userData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No Repo Path",  async () => {
        await SyncHandler();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("repo Not In Config", async () => {
        const user = {
            "email": TEST_EMAIL,
            "plan": {
                REPO_COUNT: 5
            },
            "repo_count": 4
        };
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(user));
        await SyncHandler();
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
        await SyncHandler();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        const repoInSyncMsg = getRepoInSyncMsg(repoPath);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(repoInSyncMsg);
    });

});

describe("disconnectRepoHandler",  () => {
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
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.dump(configData));
        fs.writeFileSync(userFilePath, yaml.dump(userData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No Repo Path", () => {
        disconnectRepoHandler();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("Ask Dicsonnect confirmation", () => {
        disconnectRepoHandler();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showWarningMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_DISCONNECT_CONFIRMATION);
        expect(vscode.window.showWarningMessage.mock.calls[0][1]).toStrictEqual(NOTIFICATION.YES);
        expect(vscode.window.showWarningMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.CANCEL);
    });

    test("Ask Dicsonnect parent confirmation; Sub Dir of synced repo", () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        const subDir = path.join(repoPath, "directory");
        setWorkspaceFolders(subDir);
        disconnectRepoHandler();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showWarningMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_DISCONNECT_PARENT_CONFIRMATION);
        expect(vscode.window.showWarningMessage.mock.calls[0][1]).toStrictEqual(NOTIFICATION.YES);
        expect(vscode.window.showWarningMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.CANCEL);
    });
});


describe("postSelectionDisconnectRepo",  () => {
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
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.dump(configData));
        fs.writeFileSync(userFilePath, yaml.dump(userData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No Selection",  async () => {
        await postSelectionDisconnectRepo(repoPath, undefined);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(0);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("Clicked Cancel",  async () => {
        await postSelectionDisconnectRepo(repoPath, NOTIFICATION.CANCEL);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(0);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("Repo is already inactive",  async () => {
        configData.repos[repoPath] = {
            is_disconnected: true,
            branches: {}
        };
        fs.writeFileSync(configPath, yaml.dump(configData));
        await postSelectionDisconnectRepo(repoPath, NOTIFICATION.YES);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(0);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("Disconnecting error from server",  async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        const errJSON = {error: {message: "NOT SO FAST"}};
        fetchMock.mockResponseOnce(JSON.stringify(errJSON));
        await postSelectionDisconnectRepo(repoPath, NOTIFICATION.YES);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_DISCONNECT_FAILED);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(0);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
    });

    test("Should Dicsonnect",  async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        fetchMock.mockResponseOnce(JSON.stringify({}));

        await postSelectionDisconnectRepo(repoPath, NOTIFICATION.YES);

        // Read config
        const config = readYML(configPath);
        expect(config.repos[repoPath].is_disconnected).toBe(true);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(3);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("isSubDir");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual("isSyncIgnored");
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.REPO_DISCONNECTED);
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

    test("Repo in config",  async () => {
        setWorkspaceFolders(repoPath);
        configData.repos[repoPath] = {
            id: 1234,
            branches: {},
        };
        fs.writeFileSync(configPath, yaml.dump(configData));
        const playbackLink = trackRepoHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
        expect(playbackLink.startsWith(WEB_APP_URL)).toBe(true);
    });

    test("With nested directory",  async () => {
        const subDir = path.join(repoPath, "directory");
        setWorkspaceFolders(subDir);
    
        configData.repos[repoPath] = {
            id: 1234,
            branches: {},
        };
        fs.writeFileSync(configPath, yaml.dump(configData));
        const playbackLink = trackRepoHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
        expect(playbackLink.startsWith(WEB_APP_URL)).toBe(true);
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
            branches: {}
        };
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = {"file.js": 1234};
        fs.writeFileSync(configPath, yaml.dump(configData));

        trackFileHandler();
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
    });
});
