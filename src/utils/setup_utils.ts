import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as vscode from 'vscode';
import {
	CODESYNC_ROOT, SHADOW_REPO, DIFFS_REPO, ORIGINALS_REPO,
	DELETED_REPO, USER_PATH, Auth0URLs, CONFIG_PATH, SEQUENCE_TOKEN_PATH, NOTIFICATION, WEB_APP_URL
} from "../constants";
import { repoIsNotSynced } from './event_utils';
import { initExpressServer, isPortAvailable } from './auth_utils';
import { showConnectRepo, showSignUpButtons } from './notifications';
import { readYML } from './common';
import { initUtils } from './init_utils';
import { trackRepoHandler } from '../commands_handler';


const createSystemDirectories = () => {
	// Create system directories
	const paths = [CODESYNC_ROOT, DIFFS_REPO, ORIGINALS_REPO, SHADOW_REPO, DELETED_REPO];
	paths.forEach((path) => {
		if (!fs.existsSync(path)) {
			// Add file in originals repo
			fs.mkdirSync(path, { recursive: true });
		}
	});
	// Create config.yml if does not exist
	const configExists = fs.existsSync(CONFIG_PATH);
	if (!configExists) {
		fs.writeFileSync(CONFIG_PATH, yaml.safeDump({ repos: {} }));
	}

	// Create sequence_token.yml if does not exist
	const sequenceTokenExists = fs.existsSync(SEQUENCE_TOKEN_PATH);
	if (!sequenceTokenExists) {
		fs.writeFileSync(SEQUENCE_TOKEN_PATH, yaml.safeDump({}));
	}	
};


export const setupCodeSync = async (repoPath: string) => {

	createSystemDirectories();

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

	if (!fs.existsSync(USER_PATH)) {
		showSignUpButtons();
		return;
	}

	// Check if access token is present against users
	const users = readYML(USER_PATH) || {};
	const validUsers: string[] = [];
	Object.keys(users).forEach(email => {
		const user = users[email];
		if (user.access_token) {
			validUsers.push(email);
		}
	});

	if (validUsers.length === 0) {
		showSignUpButtons();
		return;
	}

	if (repoIsNotSynced(repoPath) || !initUtils.successfulySynced(repoPath)) { 
		// Show notification to user to Sync the repo
		showConnectRepo(repoPath, "", "");
		return;
	} 

	// Show notification that repo is in sync
	vscode.window.showInformationMessage(NOTIFICATION.REPO_IN_SYNC, ...[
		NOTIFICATION.TRACK_IT
	]).then(selection => {
		if (selection === NOTIFICATION.TRACK_IT) {
			trackRepoHandler();
		}
	});
};

export const showLogIn = () => {
	if (!fs.existsSync(USER_PATH)) {
		return true;
	}

	// Check if access token is present against users
	const users = readYML(USER_PATH) || {};
	const validUsers: string[] = [];
	Object.keys(users).forEach(key => {
		const user = users[key];
		if (user.access_token) {
			validUsers.push(user.email);
		}
	});

	return validUsers.length === 0;
};

export const showConnectRepoView = (repoPath: string) => {
	return repoIsNotSynced(repoPath) || !initUtils.successfulySynced(repoPath);
};