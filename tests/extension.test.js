import fs from "fs";
import path from "path";
import vscode from "vscode";
import yaml from "js-yaml";
import lockFile from "lockfile";
import untildify from "untildify";

import {activate, deactivate} from "../src/extension";
import {
    COMMAND,
    NOTIFICATION,
    SYNCIGNORE, 
    getRepoInSyncMsg, 
    getDirectoryIsSyncedMsg,
    getDirectorySyncIgnoredMsg
} from "../src/constants";
import {
    SignUpHandler,
    SyncHandler,
    trackFileHandler,
    trackRepoHandler,
    unSyncHandler,
    openSyncIgnoreHandler
} from "../src/handlers/commands_handler";
import {createSystemDirectories} from "../src/utils/setup_utils";
import {
    addUser,
    Config,
    getConfigFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    setWorkspaceFolders
} from "./helpers/helpers";
import {logout} from "../src/utils/auth_utils";
import { generateSettings } from "../src/settings";
import { CodeSyncState, CODESYNC_STATES } from "../src/utils/state_utils";

describe("Extension: activate",() => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const configData = {repos: {}};
    configData.repos[repoPath] = {branches: {}};

    beforeEach(() => {
        jest.clearAllMocks();
        setWorkspaceFolders(repoPath);
        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();
        fs.mkdirSync(repoPath, {recursive: true});
        global.IS_CODESYNC_DEV = true;
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Fresh Setup, no user, no repo opened", async () => {
        setWorkspaceFolders("");
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(5);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        // showConnectRepoView should be false
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual("isSubDir");
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual("isSyncIgnored");
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);
        // CodeSyncActivated should be true
        expect(vscode.commands.executeCommand.mock.calls[4][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[4][1]).toStrictEqual("CodeSyncActivated");
        expect(vscode.commands.executeCommand.mock.calls[4][2]).toStrictEqual(true);

        // Register commands
        expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(7);
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
        expect(vscode.commands.registerCommand.mock.calls[6][0]).toStrictEqual(COMMAND.openSyncIgnore);
        expect(vscode.commands.registerCommand.mock.calls[6][1]).toStrictEqual(openSyncIgnoreHandler);

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

    test("Fresh Setup, no active user, repo not synced", async () => {
        addUser(baseRepoPath, false);
        setWorkspaceFolders(repoPath);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(5);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual("isSubDir");
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual("isSyncIgnored");
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);

        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.WELCOME_MSG);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.JOIN);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.IGNORE);
    });

    test("With user, repo not synced", async () => {
        addUser(baseRepoPath);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual("isSubDir");
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual("isSyncIgnored");
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);

        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.CONNECT_REPO);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.CONNECT);
    });

    test("With user, repo is disconnected", async () => {
        addUser(baseRepoPath);
        const _configData = JSON.parse(JSON.stringify(configData));
        _configData.repos[repoPath].is_disconnected = true;
        fs.writeFileSync(configPath, yaml.safeDump(_configData));
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual("isSubDir");
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual("isSyncIgnored");
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);

        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.CONNECT_REPO);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.CONNECT);
    });

    test("With user, repo is in sync", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual("isSubDir");
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual("isSyncIgnored");
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);

        const msg = getRepoInSyncMsg(repoPath);
        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.TRACK_IT);
    });

    test("With user, repo is sub directory and synced", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        const subDir = path.join(repoPath, "directory");
        setWorkspaceFolders(subDir);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be false
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be false
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        // isSubDir should be true
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual("isSubDir");
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(true);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual("isSyncIgnored");
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);

        const msg = getDirectoryIsSyncedMsg(subDir, repoPath);
        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.TRACK_PARENT_REPO);
    });

    test("With user, repo is sub directory and syncignored", async () => {
        const subDirName = "directory";
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        // Add subDir to .syncignore
        const syncignorePath = path.join(repoPath, SYNCIGNORE);
        fs.writeFileSync(syncignorePath, subDirName);
        const subDir = path.join(repoPath, subDirName);
        setWorkspaceFolders(subDir);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual("showConnectRepoView");
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
        // isSubDir should be true
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual("isSubDir");
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(true);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual("isSyncIgnored");
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(true);

        const msg = getDirectorySyncIgnoredMsg(subDir, repoPath);
        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.OPEN_SYNCIGNORE);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.TRACK_PARENT_REPO);
        expect(vscode.window.showInformationMessage.mock.calls[0][3]).toBe(NOTIFICATION.UNSYNC_PARENT_REPO);
    });
});

describe("Extension: deactivate",() => {
    const baseRepoPath = randomBaseRepoPath();
    untildify.mockReturnValue(baseRepoPath);
    const settings = generateSettings();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(global.console, 'log');
        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();
        const settings = generateSettings();
        lockFile.lockSync(settings.POPULATE_BUFFER_LOCK_FILE);
        lockFile.lockSync(settings.DIFFS_SEND_LOCK_FILE);
    });

    afterEach(() => {
        lockFile.unlockSync(settings.POPULATE_BUFFER_LOCK_FILE);
        lockFile.unlockSync(settings.DIFFS_SEND_LOCK_FILE);
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Acquried no lock", () => {
        CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
        CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
        deactivate(vscode.ExtensionContext);
        expect(console.log).toHaveBeenCalledTimes(0);
        expect(lockFile.checkSync(settings.POPULATE_BUFFER_LOCK_FILE)).toBe(true);
        expect(lockFile.checkSync(settings.DIFFS_SEND_LOCK_FILE)).toBe(true);
    });

    test("Acquried populateBuffer lock", () => {
        CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, true);
        CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
        deactivate(vscode.ExtensionContext);
        expect(console.log).toHaveBeenCalledTimes(0);
        expect(lockFile.checkSync(settings.POPULATE_BUFFER_LOCK_FILE)).toBe(false);
        expect(lockFile.checkSync(settings.DIFFS_SEND_LOCK_FILE)).toBe(true);
    });

    test("Acquried diffsSend lock", () => {
        CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
        CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, true);
        deactivate(vscode.ExtensionContext);
        expect(console.log).toHaveBeenCalledTimes(0);
        expect(lockFile.checkSync(settings.POPULATE_BUFFER_LOCK_FILE)).toBe(true);
        expect(lockFile.checkSync(settings.DIFFS_SEND_LOCK_FILE)).toBe(false);
    });

    test("Acquried both locks", () => {
        CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, true);
        CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, true);
        deactivate(vscode.ExtensionContext);
        expect(console.log).toHaveBeenCalledTimes(0);
        expect(lockFile.checkSync(settings.POPULATE_BUFFER_LOCK_FILE)).toBe(false);
        expect(lockFile.checkSync(settings.DIFFS_SEND_LOCK_FILE)).toBe(false);
    });
});
