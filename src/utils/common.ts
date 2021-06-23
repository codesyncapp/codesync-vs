import * as fs from 'fs';
import * as yaml from 'js-yaml';
import fetch from "node-fetch";

import { CODESYNC_ROOT, SHADOW_REPO, DIFFS_REPO, ORIGINALS_REPO, 
	DELETED_REPO, API_HEALTHCHECK, CONNECTION_ERROR_MESSAGE, USER_PATH, Auth0URLs } from "../constants";
import { putLogEvent } from '../logger';
import { repoIsNotSynced } from './event_utils';
import { initExpressServer, isPortAvailable } from './login_utils';
import { showConnectRepo, showSignUpButtons } from './notifications';


export const readYML = (filePath: string) => {
	try {
		return yaml.load(fs.readFileSync(filePath, "utf8"));
	} catch (e) {
		return;
	}
};

export const initCodeSync = async (repoPath: string) => {
	// Create system directories
	const paths = [CODESYNC_ROOT, DIFFS_REPO, ORIGINALS_REPO, SHADOW_REPO, DELETED_REPO ];
	paths.forEach((path) => {
		if (!fs.existsSync(path)) {
			// Add file in originals repo
			fs.mkdirSync(path, { recursive: true });
		}
	});
	
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
	}

	// Check if access token is present against users
	const users = readYML(USER_PATH);
	const validUsers: string[] = [];
	Object.keys(users).forEach(key => {
		const user = users[key];
		if (user.access_token) {
			validUsers.push(user.email);
		}
	});

	if (validUsers.length === 0) {
		showSignUpButtons(port);
	}

	// If repo is synced, do not go for Login
	if (!repoIsNotSynced(repoPath)) { return; }
	// Show notification to user to Sync the repo
	showConnectRepo();
};


export const checkServerDown = async () => {
	let isDown = false;
	const response = await fetch(API_HEALTHCHECK)
	.then(res => res.json())
    .then(json => json)
	.catch(err => {
		isDown = true;
		putLogEvent(CONNECTION_ERROR_MESSAGE);
	});
	return isDown || !response.status;
};
