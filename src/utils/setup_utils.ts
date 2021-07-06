import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as vscode from 'vscode';
import {
	CODESYNC_ROOT, SHADOW_REPO, DIFFS_REPO, ORIGINALS_REPO,
	DELETED_REPO, USER_PATH, Auth0URLs, CONFIG_PATH, SEQUENCE_TOKEN_PATH, NOTIFICATION
} from "../constants";
import { repoIsNotSynced } from './event_utils';
import { initExpressServer, isPortAvailable } from './login_utils';
import { showConnectRepo, showSignUpButtons } from './notifications';
import { readYML } from './common';
import { initUtils } from './init_utils';


export const setupCodeSync = async (repoPath: string) => {
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

	let port = 0;
	for (const _port of Auth0URLs.PORTS) {
		const isAvailable = await isPortAvailable(_port);
		if (isAvailable) {
			port = _port;
			break;
		}
	}

	initExpressServer(port);

	if (!fs.existsSync(USER_PATH)) {
		showSignUpButtons(port);
		return;
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

	if (validUsers.length === 0) {
		showSignUpButtons(port);
		return;
	}

	if (repoIsNotSynced(repoPath) || !initUtils.successfulySynced(repoPath)) { 
		// Show notification to user to Sync the repo
		showConnectRepo(repoPath, "", "", port);
		return;
	} 

	// Show notification that repo is in sync
	vscode.window.showInformationMessage(NOTIFICATION.REPO_IN_SYNC);
};
