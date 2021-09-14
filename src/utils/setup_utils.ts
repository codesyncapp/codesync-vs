import fs from 'fs';
import yaml from 'js-yaml';
import vscode from 'vscode';
import {
	Auth0URLs,
	NOTIFICATION
} from "../constants";
import { repoIsNotSynced } from '../events/utils';
import { initExpressServer, isPortAvailable } from './auth_utils';
import { showConnectRepo, showSignUpButtons } from './notifications';
import { readYML } from './common';
import { initUtils } from '../init/utils';
import { trackRepoHandler, unSyncHandler } from '../handlers/commands_handler';
import { generateSettings } from "../settings";


export const createSystemDirectories = () => {
	const settings = generateSettings();
	// Create system directories
	const paths = [
		settings.CODESYNC_ROOT,
		settings.DIFFS_REPO,
		settings.ORIGINALS_REPO,
		settings.SHADOW_REPO,
		settings.DELETED_REPO,
	];

	paths.forEach((path) => {
		if (!fs.existsSync(path)) {
			// Add file in originals repo
			fs.mkdirSync(path, { recursive: true });
		}
	});
	const configPath = settings.CONFIG_PATH;
	const sequenceTokenPath = settings.SEQUENCE_TOKEN_PATH;
	// Create config.yml if does not exist
	const configExists = fs.existsSync(configPath);
	if (!configExists) {
		fs.writeFileSync(configPath, yaml.safeDump({ repos: {} }));
	}

	// Create sequence_token.yml if does not exist
	const sequenceTokenExists = fs.existsSync(sequenceTokenPath);
	if (!sequenceTokenExists) {
		fs.writeFileSync(sequenceTokenPath, yaml.safeDump({}));
	}
	return settings;
};


export const setupCodeSync = async (repoPath: string) => {
	const settings = createSystemDirectories();
	const userFilePath = settings.USER_PATH;
	let port = 0;
	for (const _port of Auth0URLs.PORTS) {
		const isAvailable = await isPortAvailable(_port);
		if (isAvailable) {
			port = _port;
			break;
		}
	}

	// Set port to global variable
	(global as any).port = port;

	initExpressServer();

	if (!fs.existsSync(userFilePath)) {
		showSignUpButtons();
		return port;
	}

	// Check if access token is present against users
	const users = readYML(userFilePath) || {};
	const validUsers: string[] = [];
	Object.keys(users).forEach(email => {
		const user = users[email];
		if (user.access_token) {
			validUsers.push(email);
		}
	});

	if (validUsers.length === 0) {
		showSignUpButtons();
		return port;
	}

	if (repoIsNotSynced(repoPath) || !new initUtils(repoPath).successfullySynced()) {
		// Show notification to user to Sync the repo
		showConnectRepo(repoPath, "", "");
		return port;
	}

	// Show notification that repo is in sync
	vscode.window.showInformationMessage(NOTIFICATION.REPO_IN_SYNC, ...[
		NOTIFICATION.TRACK_IT,
		NOTIFICATION.UNSYNC_REPO
	]).then(selection => {
		if (!selection) { return; }
		if (selection === NOTIFICATION.TRACK_IT) {
			trackRepoHandler();
		}
		if (selection === NOTIFICATION.UNSYNC_REPO) {
			unSyncHandler();
		}
	});
};

export const showLogIn = () => {
	const settings = generateSettings();

	if (!fs.existsSync(settings.USER_PATH)) {
		return true;
	}

	// Check if access token is present against users
	const users = readYML(settings.USER_PATH) || {};
	const validUsers: string[] = [];
	Object.keys(users).forEach(email => {
		const user = users[email];
		if (user.access_token) {
			validUsers.push(email);
		}
	});

	return validUsers.length === 0;
};

export const showConnectRepoView = (repoPath: string) => {
	return repoIsNotSynced(repoPath) || !new initUtils(repoPath).successfullySynced();
};
