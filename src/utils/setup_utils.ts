import fs from 'fs';
import yaml from 'js-yaml';
import vscode from 'vscode';
import {
	getRepoInSyncMsg,
	MAX_PORT,
	MIN_PORT,
	NOTIFICATION
} from "../constants";
import { isRepoSynced } from '../events/utils';
import { isPortAvailable } from './auth_utils';
import { showConnectRepo, showSignUpButtons } from './notifications';
import { isUserActive, readYML } from './common';
import { initUtils } from '../init/utils';
import { trackRepoHandler } from '../handlers/commands_handler';
import { generateSettings } from "../settings";
import { initExpressServer } from "../server/server";


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

	// Check if access token is present against users
	const users = readYML(userFilePath) || {};
	const validUsers: string[] = [];
	Object.keys(users).forEach(email => {
		const user = users[email];
		if (isUserActive(user)) {
			validUsers.push(email);
		}
	});

	if (validUsers.length === 0) {
		showSignUpButtons();
		return port;
	}

	if (showConnectRepoView(repoPath)) {
		// Show notification to user to Sync the repo
		showConnectRepo(repoPath);
		return port;
	}

	if (!repoPath) { return; }

	// Show notification that repo is in sync
	vscode.window.showInformationMessage(getRepoInSyncMsg(repoPath), ...[
		NOTIFICATION.TRACK_IT
	]).then(selection => {
		if (!selection) { return; }
		if (selection === NOTIFICATION.TRACK_IT) {
			trackRepoHandler();
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
		if (isUserActive(user)) {
			validUsers.push(email);
		}
	});

	return validUsers.length === 0;
};

export const showConnectRepoView = (repoPath: string) => {
	if (!repoPath) { return false; }
	return !isRepoSynced(repoPath) || !new initUtils(repoPath).successfullySynced();
};
