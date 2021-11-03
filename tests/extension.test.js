import fs from "fs";
import vscode from "vscode";
import yaml from "js-yaml";
import untildify from "untildify";

import {activate} from "../src/extension";
import {COMMAND, NOTIFICATION} from "../src/constants";
import {
    SignUpHandler,
    SyncHandler,
    trackFileHandler,
    trackRepoHandler,
    unSyncHandler
} from "../src/handlers/commands_handler";
import {createSystemDirectories} from "../src/utils/setup_utils";
import {
    addUser,
    Config,
    getConfigFilePath,
    getUserFilePath,
    randomBaseRepoPath,
    randomRepoPath
} from "./helpers/helpers";
import {logout} from "../src/utils/auth_utils";


describe("Extension",() => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {"dummy_email": {access_token: "ABC"}};
    const configPath = getConfigFilePath(baseRepoPath);
    const configData = {repos: {}};
    configData.repos[repoPath] = {branches: {}};

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();
        global.IS_CODESYNC_DEV = true;
    });

    afterEach(() => {
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Fresh Setup, no user, no repo opened", async () => {
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(undefined);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(3);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        // showConnectRepoView should be false
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        // CodeSyncActivated should be true
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual("CodeSyncActivated");
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(true);

        // Register commands
        expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(6);
        expect(vscode.commands.registerCommand.mock.calls[0][0]).toStrictEqual(COMMAND.triggerSignUp);
        expect(vscode.commands.registerCommand.mock.calls[0][1]).toStrictEqual(SignUpHandler);
        expect(vscode.commands.registerCommand.mock.calls[1][0]).toStrictEqual(COMMAND.triggerLogout);
        expect(vscode.commands.registerCommand.mock.calls[1][1]).toStrictEqual(logout);
        expect(vscode.commands.registerCommand.mock.calls[2][0]).toStrictEqual(COMMAND.triggerSync);
        expect(vscode.commands.registerCommand.mock.calls[2][1]).toStrictEqual(SyncHandler);
        expect(vscode.commands.registerCommand.mock.calls[3][0]).toStrictEqual(COMMAND.triggerUnsync);
        expect(vscode.commands.registerCommand.mock.calls[3][1]).toStrictEqual(unSyncHandler);
        expect(vscode.commands.registerCommand.mock.calls[4][0]).toStrictEqual(COMMAND.trackRepo);
        expect(vscode.commands.registerCommand.mock.calls[4][1]).toStrictEqual(trackRepoHandler);
        expect(vscode.commands.registerCommand.mock.calls[5][0]).toStrictEqual(COMMAND.trackFile);
        expect(vscode.commands.registerCommand.mock.calls[5][1]).toStrictEqual(trackFileHandler);

        // createStatusBarItem
        expect(vscode.window.createStatusBarItem).toHaveBeenCalledTimes(1);

        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.WELCOME_MSG);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.JOIN);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.IGNORE);

        // Verify events listeners are registered just fine
        // createFileSystemWatcher
        expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
        expect(vscode.workspace.createFileSystemWatcher.mock.calls[0][0]).toBe(`**/*`);
        // onDidChangeTextDocument
        expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalledTimes(1);
        // onDidCreateFiles
        expect(vscode.workspace.onDidCreateFiles).toHaveBeenCalledTimes(1);
        // onDidRenameFiles
        expect(vscode.workspace.onDidRenameFiles).toHaveBeenCalledTimes(1);
    });

    test("Fresh Setup, no user, repo not synced", async () => {
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(3);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
    });

    test("With user, repo not synced", async () => {
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(3);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
    });

    test("With user, repo is disconnected", async () => {
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
        const _configData = JSON.parse(JSON.stringify(configData));
        _configData.repos[repoPath].is_disconnected = true;
        fs.writeFileSync(configPath, yaml.safeDump(_configData));
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(3);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
    });

    test("With user, repo is in sync", async () => {
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(3);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
    });
});
