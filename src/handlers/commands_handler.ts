import path from "path";
import vscode from 'vscode';

import {
	getRepoInSyncMsg,
	SYNCIGNORE
} from '../constants';
import { getBranch, readYML } from '../utils/common';
import { showChooseAccount } from "../utils/notifications";
import { generateSettings } from "../settings";
import { pathUtils } from "../utils/path_utils";
import { CodeSyncState, CODESYNC_STATES } from "../utils/state_utils";
import { generateWebUrl } from "../utils/url_utils";
import { RepoState } from "../utils/repo_state_utils";
import { RepoDisconnectHandler, RepoReconnectHandler } from "./repo_commands";


export const connectRepoHandler = async () => {
	const repoPath = pathUtils.getRootPath();
	if (!repoPath) return;
	const repoState = new RepoState(repoPath).get();
	if (repoState.IS_CONNECTED) {
		// Show notification that repo is in sync
		vscode.window.showInformationMessage(getRepoInSyncMsg(repoPath));
		return;
	}
	// Show notification to user to choose account
	await showChooseAccount(repoPath);
	return;
};

export const disconnectRepoHandler = async () => {
	const handler = new RepoDisconnectHandler();
	await handler.run();
};

export const reconnectRepoHandler = async () => {
	const handler = new RepoReconnectHandler();
	await handler.run();
};

export const trackRepoHandler = () => {
	let repoPath = pathUtils.getRootPath();
	if (!repoPath) return;
	const repoState = new RepoState(repoPath);
	const isSubDir = RepoState.isSubDir();
	if (isSubDir) {
		repoPath = RepoState.getParentRepo();
	}
	const repoConfig = repoState.config.repos[repoPath];
	// Show notification that repo is in sync
	const playbackLink = generateWebUrl(`/repos/${repoConfig.id}/playback`);
	vscode.env.openExternal(vscode.Uri.parse(playbackLink));
	return playbackLink;
};


export const trackFileHandler = () => {
	let repoPath = pathUtils.getRootPath();
	if (!repoPath) return;
	const isSubDir = RepoState.isSubDir();
	if (isSubDir) {
		repoPath = RepoState.getParentRepo();
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
	const playbackLink = generateWebUrl(`/files/${fileId}/history`);
	vscode.env.openExternal(vscode.Uri.parse(playbackLink));
};

export const openSyncIgnoreHandler = async () => {
	const repoPath = pathUtils.getRootPath();
	if (!repoPath) return;
	const isSubDir = RepoState.isSubDir();
	const parentRepo = RepoState.getParentRepo();
	const isSyncIgnored = RepoState.isSyncIgnoredSubDir();
	if (!isSubDir || !isSyncIgnored) return;
	const syncignorePath = path.join(parentRepo, SYNCIGNORE);
	const setting: vscode.Uri = vscode.Uri.parse("file:" + syncignorePath);
	// Opening .syncignore
	await vscode.workspace.openTextDocument(setting).then(async (a: vscode.TextDocument) => {
		await vscode.window.showTextDocument(a, 1, false).then(async e => {
			// 
		});
	});
};

export const upgradePlanHandler = () => {
	vscode.env.openExternal(vscode.Uri.parse(CodeSyncState.get(CODESYNC_STATES.PRICING_URL)));
};

export const viewDashboardHandler = () => {
	const url = generateWebUrl();
	vscode.env.openExternal(vscode.Uri.parse(url));
};

export const viewActivityHandler = () => {
	// Hide alert from status bar
	CodeSyncState.set(CODESYNC_STATES.STATUS_BAR_ACTIVITY_ALERT_MSG, "");
	viewDashboardHandler();
};
