import fs from "fs";
import path from "path";
import vscode from "vscode";
import yaml from "js-yaml";
import untildify from "untildify";

import {activate} from "../src/extension";
import {
    contextVariables,
    COMMAND,
    NOTIFICATION,
    SYNCIGNORE,
    getRepoInSyncMsg,
    NOTIFICATION_BUTTON,
    getDisconnectedRepoMsg,
    getSubDirectoryInSyncMsg,
    getDirectorySyncIgnoredMsg,
    HttpStatusCodes
} from "../src/constants";
import { authHandler, reactivateAccountHandler, logoutHandler } from "../src/handlers/user_commands";
import {
    connectRepoHandler,
    trackFileHandler,
    trackRepoHandler,
    openSyncIgnoreHandler,
    upgradePlanHandler,
    viewDashboardHandler,
    viewActivityHandler,
    disconnectRepoHandler,
    reconnectRepoHandler
} from "../src/handlers/commands_handler";
import {
    createSystemDirectories, 
    setInitialContext,
    registerCommands,
    setupCodeSync,
    createStatusBarItem,
    generateRandomNumber
} from "../src/utils/setup_utils";
import {
    addUser,
    Config,
    getConfigFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    setWorkspaceFolders,
    waitFor,
    TEST_EMAIL
} from "./helpers/helpers";
import { showFreeTierLimitReached } from "../src/utils/notifications";

describe("Extension: activate", () => {

    let baseRepoPath;
    let repoPath;
    let configPath;
    let configData = {repos: {}};
    const user = {
        email: TEST_EMAIL,
    };

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        fetchMock.mockResponse(JSON.stringify({"user": user}));
        baseRepoPath = randomBaseRepoPath("activate");
        repoPath = randomRepoPath();
        configPath = getConfigFilePath(baseRepoPath);
        configData.repos[repoPath] = {id: generateRandomNumber(1, 100000), branches: {}};
        setWorkspaceFolders(repoPath);
        untildify.mockReturnValue(baseRepoPath);
        global.IS_CODESYNC_TEST_MODE = true;

        fs.mkdirSync(repoPath, {recursive: true});
        fs.mkdirSync(baseRepoPath, {recursive: true});

        createSystemDirectories();
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("activate: Fresh Setup, no user, no repo opened", async () => {
        setWorkspaceFolders("");
        await activate(vscode.ExtensionContext);
        // Output of setupCodeSync 
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.WELCOME_MSG);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.LOGIN);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.IGNORE);
        // Output of setInitialContext
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        // showConnectRepoView should be false
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.isSubDir);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual(contextVariables.isSyncIgnored);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);
        // CodeSyncActivated should be true
        expect(vscode.commands.executeCommand.mock.calls[4][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[4][1]).toStrictEqual(contextVariables.codesyncActivated);
        expect(vscode.commands.executeCommand.mock.calls[4][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[5][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[5][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[5][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[6][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[6][1]).toStrictEqual(contextVariables.isDisconnectedRepo);
        expect(vscode.commands.executeCommand.mock.calls[6][2]).toStrictEqual(false);
        // Output of registerCommands
        expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(Object.keys(COMMAND).length);
        expect(vscode.commands.registerCommand.mock.calls[0][0]).toStrictEqual(COMMAND.triggerSignUp);
        expect(vscode.commands.registerCommand.mock.calls[0][1]).toStrictEqual(authHandler);
        expect(vscode.commands.registerCommand.mock.calls[1][0]).toStrictEqual(COMMAND.triggerLogout);
        expect(vscode.commands.registerCommand.mock.calls[1][1]).toStrictEqual(logoutHandler);
        expect(vscode.commands.registerCommand.mock.calls[2][0]).toStrictEqual(COMMAND.triggerSync);
        expect(vscode.commands.registerCommand.mock.calls[2][1]).toStrictEqual(connectRepoHandler);
        expect(vscode.commands.registerCommand.mock.calls[3][0]).toStrictEqual(COMMAND.triggerDisconnectRepo);
        expect(vscode.commands.registerCommand.mock.calls[3][1]).toStrictEqual(disconnectRepoHandler);
        expect(vscode.commands.registerCommand.mock.calls[4][0]).toStrictEqual(COMMAND.trackRepo);
        expect(vscode.commands.registerCommand.mock.calls[4][1]).toStrictEqual(trackRepoHandler);
        expect(vscode.commands.registerCommand.mock.calls[5][0]).toStrictEqual(COMMAND.trackFile);
        expect(vscode.commands.registerCommand.mock.calls[5][1]).toStrictEqual(trackFileHandler);
        expect(vscode.commands.registerCommand.mock.calls[6][0]).toStrictEqual(COMMAND.openSyncIgnore);
        expect(vscode.commands.registerCommand.mock.calls[6][1]).toStrictEqual(openSyncIgnoreHandler);
        expect(vscode.commands.registerCommand.mock.calls[7][0]).toStrictEqual(COMMAND.upgradePlan);
        expect(vscode.commands.registerCommand.mock.calls[7][1]).toStrictEqual(upgradePlanHandler);
        expect(vscode.commands.registerCommand.mock.calls[8][0]).toStrictEqual(COMMAND.viewDashboard);
        expect(vscode.commands.registerCommand.mock.calls[8][1]).toStrictEqual(viewDashboardHandler);
        expect(vscode.commands.registerCommand.mock.calls[9][0]).toStrictEqual(COMMAND.viewActivity);
        expect(vscode.commands.registerCommand.mock.calls[9][1]).toStrictEqual(viewActivityHandler);
        expect(vscode.commands.registerCommand.mock.calls[10][0]).toStrictEqual(COMMAND.reactivateAccount);
        expect(vscode.commands.registerCommand.mock.calls[10][1]).toStrictEqual(reactivateAccountHandler);
        expect(vscode.commands.registerCommand.mock.calls[11][0]).toStrictEqual(COMMAND.triggerReconnectRepo);
        expect(vscode.commands.registerCommand.mock.calls[11][1]).toStrictEqual(reconnectRepoHandler);
        // createStatusBarItem
        expect(vscode.window.createStatusBarItem).toHaveBeenCalledTimes(1);
        // Verify events listeners are registered just fine
        // onDidChangeTextDocument
        expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalledTimes(1);
        // onDidCreateFiles
        expect(vscode.workspace.onDidCreateFiles).toHaveBeenCalledTimes(1);
        // onDidRenameFiles
        expect(vscode.workspace.onDidRenameFiles).toHaveBeenCalledTimes(1);
    });

    test("setupCodeSync: Fresh Setup, no user, no repo opened", async () => {
        setWorkspaceFolders("");
        await setupCodeSync("");
        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.WELCOME_MSG);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.LOGIN);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.IGNORE);
    });

    test("setInitialContext: Fresh Setup, no user, no repo opened", async () => {
        setWorkspaceFolders("");
        setInitialContext();
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        // showConnectRepoView should be false
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.isSubDir);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual(contextVariables.isSyncIgnored);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);
        // CodeSyncActivated should be true
        expect(vscode.commands.executeCommand.mock.calls[4][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[4][1]).toStrictEqual(contextVariables.codesyncActivated);
        expect(vscode.commands.executeCommand.mock.calls[4][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[5][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[5][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[5][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[6][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[6][1]).toStrictEqual(contextVariables.isDisconnectedRepo);
        expect(vscode.commands.executeCommand.mock.calls[6][2]).toStrictEqual(false);
    });

    test("registerCommands: Fresh Setup, no user, no repo opened", async () => {
        setWorkspaceFolders("");
        // Register commands
        registerCommands(vscode.ExtensionContext);
        expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(Object.keys(COMMAND).length);
        expect(vscode.commands.registerCommand.mock.calls[0][0]).toStrictEqual(COMMAND.triggerSignUp);
        expect(vscode.commands.registerCommand.mock.calls[0][1]).toStrictEqual(authHandler);
        expect(vscode.commands.registerCommand.mock.calls[1][0]).toStrictEqual(COMMAND.triggerLogout);
        expect(vscode.commands.registerCommand.mock.calls[1][1]).toStrictEqual(logoutHandler);
        expect(vscode.commands.registerCommand.mock.calls[2][0]).toStrictEqual(COMMAND.triggerSync);
        expect(vscode.commands.registerCommand.mock.calls[2][1]).toStrictEqual(connectRepoHandler);
        expect(vscode.commands.registerCommand.mock.calls[3][0]).toStrictEqual(COMMAND.triggerDisconnectRepo);
        expect(vscode.commands.registerCommand.mock.calls[3][1]).toStrictEqual(disconnectRepoHandler);
        expect(vscode.commands.registerCommand.mock.calls[4][0]).toStrictEqual(COMMAND.trackRepo);
        expect(vscode.commands.registerCommand.mock.calls[4][1]).toStrictEqual(trackRepoHandler);
        expect(vscode.commands.registerCommand.mock.calls[5][0]).toStrictEqual(COMMAND.trackFile);
        expect(vscode.commands.registerCommand.mock.calls[5][1]).toStrictEqual(trackFileHandler);
        expect(vscode.commands.registerCommand.mock.calls[6][0]).toStrictEqual(COMMAND.openSyncIgnore);
        expect(vscode.commands.registerCommand.mock.calls[6][1]).toStrictEqual(openSyncIgnoreHandler);
        expect(vscode.commands.registerCommand.mock.calls[7][0]).toStrictEqual(COMMAND.upgradePlan);
        expect(vscode.commands.registerCommand.mock.calls[7][1]).toStrictEqual(upgradePlanHandler);
        expect(vscode.commands.registerCommand.mock.calls[8][0]).toStrictEqual(COMMAND.viewDashboard);
        expect(vscode.commands.registerCommand.mock.calls[8][1]).toStrictEqual(viewDashboardHandler);
        expect(vscode.commands.registerCommand.mock.calls[9][0]).toStrictEqual(COMMAND.viewActivity);
        expect(vscode.commands.registerCommand.mock.calls[9][1]).toStrictEqual(viewActivityHandler);
        expect(vscode.commands.registerCommand.mock.calls[10][0]).toStrictEqual(COMMAND.reactivateAccount);
        expect(vscode.commands.registerCommand.mock.calls[10][1]).toStrictEqual(reactivateAccountHandler);
        expect(vscode.commands.registerCommand.mock.calls[11][0]).toStrictEqual(COMMAND.triggerReconnectRepo);
        expect(vscode.commands.registerCommand.mock.calls[11][1]).toStrictEqual(reconnectRepoHandler);
    });

    test("createStatusBarItem: Fresh Setup, no user, no repo opened", async () => {
        setWorkspaceFolders("");
        // Register commands
        createStatusBarItem(vscode.ExtensionContext);
        // createStatusBarItem
        expect(vscode.window.createStatusBarItem).toHaveBeenCalledTimes(1);
    });

    test("Fresh Setup, no active user, repo not connected", async () => {
        addUser(baseRepoPath, false);
        setWorkspaceFolders(repoPath);
        await activate(vscode.ExtensionContext);
        await waitFor(1);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.isSubDir);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual(contextVariables.isSyncIgnored);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);

        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.WELCOME_MSG);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.LOGIN);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.IGNORE);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
    });

    test("With active user, repo not connected", async () => {
        addUser(baseRepoPath);
        await activate(vscode.ExtensionContext);
        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(NOTIFICATION.CONNECT_REPO);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.CONNECT);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.isSubDir);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual(contextVariables.isSyncIgnored);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
    });

    test("With active user, repo is connected", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.isSubDir);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual(contextVariables.isSyncIgnored);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);
        const msg = getRepoInSyncMsg(repoPath);
        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.TRACK_IT);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
    });

    test("With active user, repo is disconnected", async () => {
        addUser(baseRepoPath);
        const _configData = {...configData};
        _configData.repos[repoPath].is_disconnected = true;
        fs.writeFileSync(configPath, yaml.dump(_configData));
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.isSubDir);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual(contextVariables.isSyncIgnored);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[4][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[4][1]).toStrictEqual(contextVariables.codesyncActivated);
        expect(vscode.commands.executeCommand.mock.calls[4][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[5][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[5][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[5][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[6][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[6][1]).toStrictEqual(contextVariables.isDisconnectedRepo);
        expect(vscode.commands.executeCommand.mock.calls[6][2]).toStrictEqual(true);

        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
        // Should show Reconnect Msg
        const msg = getDisconnectedRepoMsg(repoPath);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toBe(NOTIFICATION_BUTTON.RECONNECT_REPO);
    });

    test("With deactivated user, repo is connected", async () => {
        fetch.resetMocks();
        fetchMock.mockResponse(JSON.stringify({error: {message: "INVALID_ACCESS_TOKEN"}}), {status: HttpStatusCodes.USER_ACCOUNT_DEACTIVATED});
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(10);
        // First 3 will be for Deactivated account
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showReactivateAccount);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);
        // Rest will be for setInitialContext()
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[4][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[4][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[4][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[5][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[5][1]).toStrictEqual(contextVariables.isSubDir);
        expect(vscode.commands.executeCommand.mock.calls[5][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[6][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[6][1]).toStrictEqual(contextVariables.isSyncIgnored);
        expect(vscode.commands.executeCommand.mock.calls[6][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[7][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[7][1]).toStrictEqual(contextVariables.codesyncActivated);
        expect(vscode.commands.executeCommand.mock.calls[7][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[8][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[8][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[8][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[9][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[9][1]).toStrictEqual(contextVariables.isDisconnectedRepo);
        expect(vscode.commands.executeCommand.mock.calls[9][2]).toStrictEqual(false);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.ACCOUNT_DEACTIVATED);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toStrictEqual(NOTIFICATION_BUTTON.REACTIVATE_ACCOUNT);
    });

    test("With deactivated user, repo is disconnected", async () => {
        addUser(baseRepoPath);
        fetchMock.mockResponseOnce(JSON.stringify({error: {message: "INVALID_ACCESS_TOKEN"}}));
        const _configData = {...configData};
        _configData.repos[repoPath].is_disconnected = true;
        fs.writeFileSync(configPath, yaml.dump(_configData));
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be true
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        // isSubDir should be false
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.isSubDir);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(false);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual(contextVariables.isSyncIgnored);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[4][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[4][1]).toStrictEqual(contextVariables.codesyncActivated);
        expect(vscode.commands.executeCommand.mock.calls[4][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[5][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[5][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[5][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[6][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[6][1]).toStrictEqual(contextVariables.isDisconnectedRepo);
        expect(vscode.commands.executeCommand.mock.calls[6][2]).toStrictEqual(true);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
        expect(vscode.commands.executeCommand.mock.calls[4][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[4][1]).toStrictEqual(contextVariables.codesyncActivated);
        expect(vscode.commands.executeCommand.mock.calls[4][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[5][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[5][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[5][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[6][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[6][1]).toStrictEqual(contextVariables.isDisconnectedRepo);
        expect(vscode.commands.executeCommand.mock.calls[6][2]).toStrictEqual(true);
        // Should show Reconnect Msg
        const msg = getDisconnectedRepoMsg(repoPath);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toBe(NOTIFICATION_BUTTON.RECONNECT_REPO);
    });

    test("With user, current repo is a sub directory of a connected repo", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        const subDir = path.join(repoPath, "directory");
        setWorkspaceFolders(subDir);
        await activate(vscode.ExtensionContext);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(7);
        // showLogin should be false
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be false
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        // isSubDir should be true
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.isSubDir);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(true);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual(contextVariables.isSyncIgnored);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[4][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[4][1]).toStrictEqual(contextVariables.codesyncActivated);
        expect(vscode.commands.executeCommand.mock.calls[4][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[5][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[5][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[5][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[6][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[6][1]).toStrictEqual(contextVariables.isDisconnectedRepo);
        expect(vscode.commands.executeCommand.mock.calls[6][2]).toStrictEqual(false);
        const msg = getSubDirectoryInSyncMsg(subDir, repoPath);
        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.TRACK_PARENT_REPO);
    });

    test("With active user, repo is sub directory and syncignored", async () => {
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
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(false);
        // showConnectRepoView should be true
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        // isSubDir should be true
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.isSubDir);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toStrictEqual(true);
        // isSyncIgnored should be false
        expect(vscode.commands.executeCommand.mock.calls[3][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[3][1]).toStrictEqual(contextVariables.isSyncIgnored);
        expect(vscode.commands.executeCommand.mock.calls[3][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[4][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[4][1]).toStrictEqual(contextVariables.codesyncActivated);
        expect(vscode.commands.executeCommand.mock.calls[4][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[5][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[5][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[5][2]).toStrictEqual(false);
        expect(vscode.commands.executeCommand.mock.calls[6][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[6][1]).toStrictEqual(contextVariables.isDisconnectedRepo);
        expect(vscode.commands.executeCommand.mock.calls[6][2]).toStrictEqual(false);
        const msg = getDirectorySyncIgnoredMsg(subDir, repoPath);
        // Should show Welcome msg
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toBe(NOTIFICATION.OPEN_SYNCIGNORE);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toBe(NOTIFICATION.TRACK_PARENT_REPO);
        expect(vscode.window.showInformationMessage.mock.calls[0][3]).toBe(NOTIFICATION.DISCONNECT_PARENT_REPO);
    });


    test('With canAvailTrial = False', async () => {
        const repoPath = randomRepoPath();
        const isNewPrivateRepo = true;
        const canAvailTrial = false;
        showFreeTierLimitReached(repoPath, isNewPrivateRepo, canAvailTrial);

        const msg = `${NOTIFICATION.PRIVATE_REPO_COUNT_LIMIT_REACHED}. ${NOTIFICATION.UPGRADE_PRICING_PLAN}`;
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toBe(NOTIFICATION.UPGRADE_TO_PRO);
    })

    test('With canAvailTrial = True', async () => {
        const repoPath = randomRepoPath();
        const isNewPrivateRepo = true;
        const canAvailTrial = true;
        showFreeTierLimitReached(repoPath, isNewPrivateRepo, canAvailTrial);

        const msg = `${NOTIFICATION.PRIVATE_REPO_COUNT_LIMIT_REACHED}. ${NOTIFICATION.UPGRADE_PRICING_PLAN}`;
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toBe(NOTIFICATION.TRY_PRO_FOR_FREE);
    })
});
