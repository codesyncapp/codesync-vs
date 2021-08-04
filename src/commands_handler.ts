import * as vscode from 'vscode';
import { CONFIG_PATH, NOTIFICATION, WEB_APP_URL } from './constants';
import { readYML } from './utils/common';
import { repoIsNotSynced } from './utils/event_utils';
import { initUtils } from './utils/init_utils';
import { redirectToBrowser } from "./utils/auth_utils";
import { showChooseAccount } from "./utils/notifications";

export const SignUpHandler = () => {
	redirectToBrowser();
};

export const SyncHandler = () => {
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath) { return; }
	if (repoIsNotSynced(repoPath) || !initUtils.successfulySynced(repoPath)) { 
		// Show notification to user to choose account
		showChooseAccount(repoPath);
		return;
	} 

	// Show notification that repo is in sync
	vscode.window.showInformationMessage(NOTIFICATION.REPO_IN_SYNC);

};

export const unSyncHandler = () => {
	console.log("Unsync activated");
};

export const trackRepoHandler = () => {
	const config = readYML(CONFIG_PATH);
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath) { return; }
	const configRepo = config['repos'][repoPath];
	// Show notification that repo is in sync
	const playbackLink = `${WEB_APP_URL}/repos/${configRepo.id}/playback`;
	vscode.env.openExternal(vscode.Uri.parse(playbackLink));
};
