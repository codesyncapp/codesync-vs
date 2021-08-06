import * as fs from "fs";
import * as vscode from 'vscode';
import * as yaml from "js-yaml";
import { CONFIG_PATH, NOTIFICATION, USER_PATH, WEB_APP_URL } from './constants';
import {isRepoActive, readYML} from './utils/common';
import { repoIsNotSynced } from './utils/event_utils';
import { initUtils } from './utils/init_utils';
import { redirectToBrowser } from "./utils/auth_utils";
import { showChooseAccount } from "./utils/notifications";
import { updateRepo } from './utils/sync_repo_utils';

export const SignUpHandler = () => {
	redirectToBrowser();
};

export const SyncHandler = () => {
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath) { return; }
	if (repoIsNotSynced(repoPath) || !initUtils.successfullySynced(repoPath)) {
		// Show notification to user to choose account
		showChooseAccount(repoPath);
		return;
	}

	// Show notification that repo is in sync
	vscode.window.showInformationMessage(NOTIFICATION.REPO_IN_SYNC);

};

export const unSyncHandler = async () => {
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath) { return; }
	vscode.window.showWarningMessage(
		NOTIFICATION.REPO_UNSYNC_CONFIRMATION, ...[
		NOTIFICATION.YES,
		NOTIFICATION.CANCEL
	]).then(async selection => {
		if (!selection || selection !== NOTIFICATION.YES) {
			return;
		}
		const config = readYML(CONFIG_PATH);
		if (!isRepoActive(config, repoPath)) { return; }
		const configRepo = config['repos'][repoPath];
		const users = readYML(USER_PATH);
		const accessToken = users[configRepo.email].access_token;
		const json = await updateRepo(accessToken, configRepo.id, { is_in_sync: false });
		if (json.error) {
			vscode.window.showErrorMessage(NOTIFICATION.REPO_UNSYNC_FAILED);
		} else {
			// Show notification that repo is not in sync
			configRepo.is_disconnected = true;
			fs.writeFileSync(CONFIG_PATH, yaml.safeDump(config));
			// TODO: Maybe should delete repo from .shadow and .originals,
			vscode.commands.executeCommand('setContext', 'showConnectRepoView', true);
			vscode.window.showInformationMessage(NOTIFICATION.REPO_UNSYNCED);
		}
	});
};

export const trackRepoHandler = () => {
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath) { return; }
	const config = readYML(CONFIG_PATH);
	const configRepo = config['repos'][repoPath];
	// Show notification that repo is in sync
	const playbackLink = `${WEB_APP_URL}/repos/${configRepo.id}/playback`;
	vscode.env.openExternal(vscode.Uri.parse(playbackLink));
};
