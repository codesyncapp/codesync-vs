import fs from "fs";
import path from "path";
import vscode from 'vscode';
import yaml from "js-yaml";

import {
	getRepoInSyncMsg,
	NOTIFICATION,
	SYNCIGNORE
} from '../constants';
import { checkSubDir, getBranch, isRepoActive, readYML } from '../utils/common';
import { isRepoSynced } from '../events/utils';
import { redirectToBrowser } from "../utils/auth_utils";
import { showChooseAccount } from "../utils/notifications";
import { updateRepo } from '../utils/sync_repo_utils';
import { generateSettings, WEB_APP_URL } from "../settings";
import { pathUtils } from "../utils/path_utils";
import { showRepoStatusMsg } from "../utils/setup_utils";

export const SignUpHandler = () => {
	redirectToBrowser();
};

export const SyncHandler = async () => {
	const repoPath = pathUtils.getRootPath();
	if (!repoPath) { return; }
	if (isRepoSynced(repoPath)) {
		// Show notification that repo is in sync
		vscode.window.showInformationMessage(getRepoInSyncMsg(repoPath));
		return;
	}
	// Show notification to user to choose account
	await showChooseAccount(repoPath);
	return;
};

export const unSyncHandler = async () => {
	let repoPath = pathUtils.getRootPath();
	if (!repoPath) { return; }
	let msg = NOTIFICATION.REPO_UNSYNC_CONFIRMATION;
	const result = checkSubDir(repoPath);
	if (result.isSubDir) {
		repoPath = result.parentRepo;
		msg = NOTIFICATION.REPO_UNSYNC_PARENT_CONFIRMATION;
	}
	vscode.window.showWarningMessage(msg, NOTIFICATION.YES, NOTIFICATION.CANCEL)
	.then(async selection => {
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
	const configRepo = config.repos[repoPath];
	const users = readYML(settings.USER_PATH);
	const accessToken = users[configRepo.email].access_token;
	const json = await updateRepo(accessToken, configRepo.id, { is_in_sync: false });
	if (json.error) {
		vscode.window.showErrorMessage(NOTIFICATION.REPO_UNSYNC_FAILED);
		return;
	}
	// Show notification that repo is not in sync
	configRepo.is_disconnected = true;
	fs.writeFileSync(settings.CONFIG_PATH, yaml.safeDump(config));
	// TODO: Maybe should delete repo from .shadow and .originals,
	vscode.commands.executeCommand('setContext', 'showConnectRepoView', true);
	vscode.commands.executeCommand('setContext', 'isSubDir', false);
	vscode.commands.executeCommand('setContext', 'isSyncIgnored', false);
	vscode.window.showInformationMessage(NOTIFICATION.REPO_UNSYNCED);
};

export const trackRepoHandler = () => {
	let repoPath = pathUtils.getRootPath();
	if (!repoPath) { return; }
	const settings = generateSettings();
	const config = readYML(settings.CONFIG_PATH);
	const result = checkSubDir(repoPath);
	if (result.isSubDir) {
		repoPath = result.parentRepo;
	}
	const configRepo = config.repos[repoPath];
	// Show notification that repo is in sync
	const playbackLink = `${WEB_APP_URL}/repos/${configRepo.id}/playback`;
	vscode.env.openExternal(vscode.Uri.parse(playbackLink));
	return playbackLink;
};


export const trackFileHandler = () => {
	let repoPath = pathUtils.getRootPath();
	if (!repoPath) return;
	const result = checkSubDir(repoPath);
	if (result.isSubDir) {
		repoPath = result.parentRepo;
	}
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;
	let filePath = editor?.document.fileName;
	if (!filePath) return;
	filePath = pathUtils.normalizePath(filePath);
	const settings = generateSettings();
	const config = readYML(settings.CONFIG_PATH);
	const configRepo = config.repos[repoPath];
	const branch = getBranch(repoPath);
	const configFiles = configRepo.branches[branch];
	const relPath = filePath.split(path.join(repoPath, path.sep))[1];
	if (!(relPath in configFiles)) { return; }
	const fileId = configFiles[relPath];
	// Show notification that repo is in sync
	const playbackLink = `${WEB_APP_URL}/files/${fileId}/history`;
	vscode.env.openExternal(vscode.Uri.parse(playbackLink));
};

export const openSyncIgnoreHandler = async () => {
	const repoPath = pathUtils.getRootPath();
	if (!repoPath) return;
	const subDirResult = checkSubDir(repoPath);
	if (!subDirResult.isSubDir || !subDirResult.isSyncIgnored) return;
	const syncignorePath = path.join(subDirResult.parentRepo, SYNCIGNORE);
	const setting: vscode.Uri = vscode.Uri.parse("file:" + syncignorePath);
	// Opening .syncignore
	await vscode.workspace.openTextDocument(setting).then(async (a: vscode.TextDocument) => {
		await vscode.window.showTextDocument(a, 1, false).then(async e => {
			// 
		});
	});
};
