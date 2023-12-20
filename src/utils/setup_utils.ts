import fs from 'fs';
import yaml from 'js-yaml';
import vscode, { Extension } from 'vscode';
import {
	COMMAND,
	contextVariables,
	getDirectoryIsSyncedMsg,
	getRepoInSyncMsg,
	MAX_PORT,
	MIN_PORT,
	NOTIFICATION,
	SYNCIGNORE,
	UPDATE_SYNCIGNORE_AFTER
} from "../constants";
import { isRepoSynced } from '../events/utils';
import { createUser, isPortAvailable, logout } from './auth_utils';
import { showConnectRepo, showSignUpButtons, showSyncIgnoredRepo } from './notifications';
import { checkSubDir, getActiveUsers, readYML } from './common';
import { 
	disconnectRepoHandler, 
	openSyncIgnoreHandler, 
	reactivateAccountHandler, 
	SignUpHandler, 
	SyncHandler, 
	trackFileHandler, 
	trackRepoHandler, 
	upgradePlanHandler, 
	viewActivityHandler, 
	viewDashboardHandler
 } from '../handlers/commands_handler';
import { generateSettings, PLUGIN_USER } from "../settings";
import { initExpressServer } from "../server/server";
import { getPluginUser, getSyncignore } from './s3_utils';
import { pathUtils } from './path_utils';
import { CodeSyncLogger } from '../logger';
import { GitExtension } from '../git';
import { CODESYNC_STATES, CodeSyncState } from './state_utils';

export const createSystemDirectories = () => {
	const settings = generateSettings();
	// Create system directories
	[
		settings.CODESYNC_ROOT,
		settings.DIFFS_REPO,
		settings.ORIGINALS_REPO,
		settings.SHADOW_REPO,
		settings.DELETED_REPO,
		settings.LOCKS_REPO,
		settings.S3_UPLOADER
	].forEach(directoryPath => {
		// Create directory if does not exist
		if (!fs.existsSync(directoryPath)) fs.mkdirSync(directoryPath, { recursive: true });
	});
	
	// Default data for all system files
	const defaultData = <any>{};
	defaultData[settings.CONFIG_PATH] = yaml.dump({ repos: {} });
	defaultData[settings.USER_PATH] = yaml.dump({});
	defaultData[settings.ALERTS] = yaml.dump({ team_activity: {} });
	defaultData[settings.POPULATE_BUFFER_LOCK_FILE] = "";
	defaultData[settings.DIFFS_SEND_LOCK_FILE] = "";
	defaultData[settings.UPGRADE_PLAN_ALERT] = "";
	// Create file if does not exist
	[
		// System Files
		settings.CONFIG_PATH,
		settings.USER_PATH, 
		settings.ALERTS,
		// Lock Files
		settings.POPULATE_BUFFER_LOCK_FILE, 
		settings.DIFFS_SEND_LOCK_FILE, 
		settings.UPGRADE_PLAN_ALERT
	].forEach(filePath => {
		if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, defaultData[filePath]);
	});
	// Reset file if it contains invalid data
	[
		settings.CONFIG_PATH,
		settings.USER_PATH,
		settings.ALERTS
	].forEach(filePath => {
		// Update file if it has invalid data
		const content = readYML(filePath);
		if (!content) fs.writeFileSync(filePath, defaultData[filePath]);
	});
	// Clean content of config.yml
	const config = readYML(settings.CONFIG_PATH);
	if (!config.repos) fs.writeFileSync(settings.CONFIG_PATH, defaultData[settings.CONFIG_PATH]);
	
	// TODO: Remove deprecated files, Not doing until Intellij handles this as well
	// settings.deprecatedFiles.forEach(filePath => {
	// 	if (!fs.existsSync(filePath)) return;
	// 	fs.unlinkSync(filePath);
	// });
	
	return settings;
};

export const createOrUpdateSyncignore = async () => {
	// Create/Update .syncignore
	const settings = generateSettings();
	if (fs.existsSync(settings.SYNCIGNORE_PATH)) {
		const syncingoreYml = readYML(settings.SYNCIGNORE_PATH);
		if (syncingoreYml.last_checked_at && (new Date().getTime() - syncingoreYml.last_checked_at < UPDATE_SYNCIGNORE_AFTER)) return;
	}
	// Get file from s3 and save it on the system
	CodeSyncLogger.debug("Downloading .syncignore from s3");
	const response = await getSyncignore();
	if (response.error) {
		CodeSyncLogger.error(`Couldn't download .syncignore from s3, error=${response.error}`);
		return;
	}
	fs.writeFileSync(settings.SYNCIGNORE_PATH, yaml.dump({ 
		last_checked_at: new Date().getTime(),
		content: response.content
	}));	
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
    fs.writeFileSync(settings.USER_PATH, yaml.dump(users));
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
	await createOrUpdateSyncignore();
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
	const activeUser = getActiveUsers()[0];
	if (!activeUser) {
		showSignUpButtons();
		return port;
	}
	// Check is accessToken is valid 
	const userAccount = await createUser(activeUser.access_token, "");
	if (userAccount.isDeactivated) return;
	// Check if repo is connected
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

const getBuiltInGitApi = async () => {
    try {
        const extension = vscode.extensions.getExtension('vscode.git') as Extension<GitExtension>;
        if (extension !== undefined) {
            const gitExtension = extension.isActive ? extension.exports : await extension.activate();
            return gitExtension.getAPI(1);
        }
    } catch {
		return undefined;
	}
    return undefined;
};

export const registerGitListener = async (repoPath: string) => {
	if (!repoPath) return;
	// Check if the workspace is a Git repository, use the Git extension API to get Git information
	const gitExtension = await getBuiltInGitApi();
	if (!gitExtension) return CodeSyncLogger.debug("gitExtension not found");
	const gitRepository = gitExtension.repositories.find(repo => {
		const normalizedPath = pathUtils.normalizePath(repo.rootUri.fsPath);
		CodeSyncLogger.debug(`gitExtension normalizedPath=${normalizedPath}`);
		return normalizedPath === repoPath;
	});
	if (!gitRepository) return CodeSyncLogger.debug("gitExtension: Not a git repository");
	const currentCommit = gitRepository.state.HEAD?.commit;
	if (!currentCommit) return;
	CodeSyncState.set(CODESYNC_STATES.GIT_COMMIT_HASH, currentCommit);
	CodeSyncLogger.debug(`CommitHash=${currentCommit}`);
	gitRepository.state.onDidChange(() => {
		const gitRepository = gitExtension.repositories.find(repo => pathUtils.normalizePath(repo.rootUri.fsPath) === repoPath);
		if (!gitRepository) return;	
		const newCommitHash = gitRepository.state.HEAD?.commit;
		if (!newCommitHash) return;
		CodeSyncState.set(CODESYNC_STATES.GIT_COMMIT_HASH, newCommitHash);
	});
};

export const setInitialContext = () => {
	const repoPath = pathUtils.getRootPath();
	const subDirResult = checkSubDir(repoPath);
	vscode.commands.executeCommand('setContext', contextVariables.showLogIn, showLogIn());
	vscode.commands.executeCommand('setContext', contextVariables.showConnectRepoView, showConnectRepoView(repoPath));
	vscode.commands.executeCommand('setContext', contextVariables.isSubDir, subDirResult.isSubDir);
	vscode.commands.executeCommand('setContext', contextVariables.isSyncIgnored, subDirResult.isSyncIgnored);
	vscode.commands.executeCommand('setContext', contextVariables.codesyncActivated, true);
	vscode.commands.executeCommand('setContext', contextVariables.upgradePricingPlan, false);
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
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.viewActivity, viewActivityHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.reactivateAccount, reactivateAccountHandler));
};

export const createStatusBarItem = (context: vscode.ExtensionContext) => {
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.command = COMMAND.triggerDisconnectRepo;
	context.subscriptions.push(statusBarItem);
	return statusBarItem;
};

// Ref: https://stackoverflow.com/a/8809472
export const uuidv4 = () => {
	let d = new Date().getTime();//Timestamp
    let d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random() * 16;//random number between 0 and 16
        if(d > 0){//Use timestamp until depleted
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {//Use microseconds since page-load if supported
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
};
