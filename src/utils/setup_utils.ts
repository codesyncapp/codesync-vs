import fs from 'fs';
import yaml from 'js-yaml';
import vscode from 'vscode';
import {
	COMMAND,
	getDirectoryIsSyncedMsg,
	getRepoInSyncMsg,
	MAX_PORT,
	MIN_PORT,
	NOTIFICATION,
	SYNCIGNORE
} from "../constants";
import { isRepoSynced } from '../events/utils';
import { isPortAvailable, logout } from './auth_utils';
import { showConnectRepo, showSignUpButtons, showSyncIgnoredRepo } from './notifications';
import { checkSubDir, getActiveUsers, readYML } from './common';
import { 
	disconnectRepoHandler, 
	openSyncIgnoreHandler, 
	SignUpHandler, 
	SyncHandler, 
	trackFileHandler, 
	trackRepoHandler, 
	upgradePlanHandler, 
	viewDashboardHandler
 } from '../handlers/commands_handler';
import { generateSettings, PLUGIN_USER } from "../settings";
import { initExpressServer } from "../server/server";
import { getPluginUser } from './api_utils';
import { pathUtils } from './path_utils';

export const createSystemDirectories = () => {
	const settings = generateSettings();
	// Create system directories
	[
		settings.CODESYNC_ROOT,
		settings.DIFFS_REPO,
		settings.ORIGINALS_REPO,
		settings.SHADOW_REPO,
		settings.DELETED_REPO,
		settings.LOCKS_REPO
	].forEach(directoryPath => {
		// Create directory if does not exist
		if (!fs.existsSync(directoryPath)) fs.mkdirSync(directoryPath, { recursive: true });
	});
	
	// Default data for all system files
	const defaultData = <any>{};
	defaultData[settings.CONFIG_PATH] = yaml.safeDump({ repos: {} });
	defaultData[settings.USER_PATH] = yaml.safeDump({});
	defaultData[settings.SEQUENCE_TOKEN_PATH] = yaml.safeDump({});
	defaultData[settings.ALERTS] = yaml.safeDump({ team_activity: {} });
	defaultData[settings.POPULATE_BUFFER_LOCK_FILE] = "";
	defaultData[settings.DIFFS_SEND_LOCK_FILE] = "";
	defaultData[settings.UPGRADE_PLAN_ALERT] = "";
	[
		// System Files
		settings.CONFIG_PATH,
		settings.USER_PATH, 
		settings.SEQUENCE_TOKEN_PATH, 
		settings.ALERTS,
		// Lock Files
		settings.POPULATE_BUFFER_LOCK_FILE, 
		settings.DIFFS_SEND_LOCK_FILE, 
		settings.UPGRADE_PLAN_ALERT
	].forEach(filePath => {
		// Create file if does not exist
		if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, defaultData[filePath]);
	});
	
	return settings;
};

export const addPluginUser = async () => {
	const settings = generateSettings();
	const users = readYML(settings.USER_PATH) || {};
	const pluginUser = users[PLUGIN_USER.logStream];
    if (!pluginUser || !pluginUser.access_key || !pluginUser.secret_key) {
		// Get fresh credentials 
		const response = await getPluginUser();
		if (response.error) return;
        users[PLUGIN_USER.logStream] = {
            access_key: response.user.IAM_ACCESS_KEY,
            secret_key: response.user.IAM_SECRET_KEY
        };
    }
    fs.writeFileSync(settings.USER_PATH, yaml.safeDump(users));
};

const generateRandom = (min = 0, max = 100)  => {
	// find diff
	const difference = max - min;
	// generate random number
	let rand = Math.random();
	// multiply with difference
	rand = Math.floor( rand * difference);
	// add with min value
	rand = rand + min;
	return rand;
};

export const setupCodeSync = async (repoPath: string) => {
	const settings = createSystemDirectories();
	await addPluginUser();
	const userFilePath = settings.USER_PATH;
	let port = 0;
	while (!port) {
		const randomPort = generateRandom(MIN_PORT, MAX_PORT);
		const isAvailable = await isPortAvailable(randomPort);
		if (isAvailable) {
			port = randomPort;
		}
	}

	// Set port to global variable
	(global as any).port = port;

	initExpressServer();

	if (!fs.existsSync(userFilePath)) {
		showSignUpButtons();
		return port;
	}

	// Check if there is valid user present
	const validUsers = getActiveUsers();
	if (validUsers.length === 0) {
		showSignUpButtons();
		return port;
	}

	return showRepoStatusMsg(repoPath, port);
};

export const showLogIn = () => {
	const settings = generateSettings();
	if (!fs.existsSync(settings.USER_PATH)) {
		return true;
	}
	// Check if access token is present against users
	const validUsers = getActiveUsers();
	return validUsers.length === 0;
};

export const showRepoStatusMsg = (repoPath: string, port?: number) => {
	if (!repoPath) { return; }

	const subDirResult = checkSubDir(repoPath);

	registerSyncIgnoreSaveEvent(repoPath);
	
	if (showRepoIsSyncIgnoredView(repoPath)) {
		showSyncIgnoredRepo(repoPath, subDirResult.parentRepo);
		return port;
	}

	if (showConnectRepoView(repoPath)) {
		// Show notification to user to Sync the repo
		showConnectRepo(repoPath);
		return port;
	}

	let msg = getRepoInSyncMsg(repoPath);
	let button = NOTIFICATION.TRACK_IT;

	if (subDirResult.isSubDir) {
		button = NOTIFICATION.TRACK_PARENT_REPO;
		msg = getDirectoryIsSyncedMsg(repoPath, subDirResult.parentRepo);
	}

	// Show notification that repo is in sync
	vscode.window.showInformationMessage(msg, button).then(selection => {
		if (!selection) { return; }
		if (selection === NOTIFICATION.TRACK_IT) {
			trackRepoHandler();
		}
	});
};

export const showConnectRepoView = (repoPath: string) => {
	if (!repoPath) return false;
	return !isRepoSynced(repoPath);
};

export const showRepoIsSyncIgnoredView = (repoPath: string) => {
	if (!repoPath) return false;
	const result = checkSubDir(repoPath);
	return result.isSubDir && result.isSyncIgnored;
};

const registerSyncIgnoreSaveEvent = (repoPath: string) => {
	if (!(global as any).didSaveSyncIgnoreEventAdded) {
		(global as any).didSaveSyncIgnoreEventAdded = true;
		vscode.workspace.onDidSaveTextDocument(async event => {
			if (!event.fileName.endsWith(SYNCIGNORE)) return;
			showRepoStatusMsg(repoPath);
		});
	}
};

export const setInitialContext = () => {
	const repoPath = pathUtils.getRootPath();
	const subDirResult = checkSubDir(repoPath);
	vscode.commands.executeCommand('setContext', 'showLogIn', showLogIn());
	vscode.commands.executeCommand('setContext', 'showConnectRepoView', showConnectRepoView(repoPath));
	vscode.commands.executeCommand('setContext', 'isSubDir', subDirResult.isSubDir);
	vscode.commands.executeCommand('setContext', 'isSyncIgnored', subDirResult.isSyncIgnored);
	vscode.commands.executeCommand('setContext', 'CodeSyncActivated', true);
	vscode.commands.executeCommand('setContext', 'upgradePricingPlan', false);
};

export const registerCommands = (context: vscode.ExtensionContext) => {
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerSignUp, SignUpHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerLogout, logout));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerSync, SyncHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerDisconnectRepo, disconnectRepoHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.trackRepo, trackRepoHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.trackFile, trackFileHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.openSyncIgnore, openSyncIgnoreHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.upgradePlan, upgradePlanHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.viewDashboard, viewDashboardHandler));
};

export const createStatusBarItem = (context: vscode.ExtensionContext) => {
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.command = COMMAND.triggerDisconnectRepo;
	context.subscriptions.push(statusBarItem);
	return statusBarItem;
};