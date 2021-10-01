import fs from "fs";
import path from "path";
import vscode from 'vscode';
import yaml from "js-yaml";
import getBranchName from 'current-git-branch';

import {
	DEFAULT_BRANCH,
	getRepoInSyncMsg,
	NOTIFICATION
} from '../constants';
import { isRepoActive, readYML } from '../utils/common';
import { isRepoSynced } from '../events/utils';
import { initUtils } from '../init/utils';
import { redirectToBrowser } from "../utils/auth_utils";
import { showChooseAccount } from "../utils/notifications";
import { updateRepo } from '../utils/sync_repo_utils';
import { generateSettings, WEB_APP_URL } from "../settings";
import { pathUtils } from "../utils/path_utils";

export const SignUpHandler = () => {
	redirectToBrowser();
};

export const SyncHandler = async () => {
	const repoPath = pathUtils.getRootPath();
	if (!repoPath) { return; }
	if (!isRepoSynced(repoPath) || !new initUtils(repoPath).successfullySynced()) {
		// Show notification to user to choose account
		await showChooseAccount(repoPath);
		return;
	}
	// Show notification that repo is in sync
	vscode.window.showInformationMessage(getRepoInSyncMsg(repoPath));

};

export const unSyncHandler = async () => {
	const repoPath = pathUtils.getRootPath();
	if (!repoPath) { return; }
	vscode.window.showWarningMessage(
		NOTIFICATION.REPO_UNSYNC_CONFIRMATION, ...[
		NOTIFICATION.YES,
		NOTIFICATION.CANCEL
	]).then(async selection => {
		await postSelectionUnsync(repoPath, selection);
	});
};

export const postSelectionUnsync = async (repoPath: string, selection?: string) => {
	if (!selection || selection !== NOTIFICATION.YES) {
		return;
	}
	const settings = generateSettings();
	const config = readYML(settings.CONFIG_PATH);
	if (!isRepoActive(config, repoPath)) { return; }
	const configRepo = config['repos'][repoPath];
	const users = readYML(settings.USER_PATH);
	const accessToken = users[configRepo.email].access_token;
	const json = await updateRepo(accessToken, configRepo.id, { is_in_sync: false });
	if (json.error) {
		vscode.window.showErrorMessage(NOTIFICATION.REPO_UNSYNC_FAILED);
	} else {
		// Show notification that repo is not in sync
		configRepo.is_disconnected = true;
		fs.writeFileSync(settings.CONFIG_PATH, yaml.safeDump(config));
		// TODO: Maybe should delete repo from .shadow and .originals,
		vscode.commands.executeCommand('setContext', 'showConnectRepoView', true);
		vscode.window.showInformationMessage(NOTIFICATION.REPO_UNSYNCED);
	}
};

export const trackRepoHandler = () => {
	const repoPath = pathUtils.getRootPath();
	if (!repoPath) { return; }
	const settings = generateSettings();
	const config = readYML(settings.CONFIG_PATH);
	const configRepo = config['repos'][repoPath];
	// Show notification that repo is in sync
	const playbackLink = `${WEB_APP_URL}/repos/${configRepo.id}/playback`;
	vscode.env.openExternal(vscode.Uri.parse(playbackLink));
	return playbackLink;
};


export const trackFileHandler = () => {
	const repoPath = pathUtils.getRootPath();
	if (!repoPath) return;
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;
	let filePath = editor?.document.fileName;
	if (!filePath) return;
	filePath = pathUtils.normalizePath(filePath);
	const settings = generateSettings();
	const config = readYML(settings.CONFIG_PATH);
	const configRepo = config['repos'][repoPath];
	const branch = getBranchName({altPath: repoPath}) || DEFAULT_BRANCH;
	const configFiles = configRepo.branches[branch];
	const relPath = filePath.split(path.join(repoPath, path.sep))[1];
	if (!(relPath in configFiles )) { return; }
	const fileId = configFiles[relPath];
	// Show notification that repo is in sync
	const playbackLink = `${WEB_APP_URL}/files/${fileId}/history`;
	vscode.env.openExternal(vscode.Uri.parse(playbackLink));
};
