import * as vscode from 'vscode';
import { NOTIFICATION } from './constants';
import { repoIsNotSynced } from './utils/event_utils';
import { initUtils } from './utils/init_utils';
import { redirectToBrowser } from "./utils/login_utils";
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
