import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import vscode from 'vscode';
import { isBinaryFileSync } from 'isbinaryfile';
import { diff_match_patch } from 'diff-match-patch';

import { IDiff } from "../interface";
import {
	COMMAND,
	DIFF_SIZE_LIMIT,
	HTTP_STATUS_CODES,
	REQUIRED_DIFF_KEYS,
	REQUIRED_DIR_RENAME_DIFF_KEYS,
	REQUIRED_FILE_RENAME_DIFF_KEYS,
	STATUS_BAR_MSGS
} from "../constants";
import { uploadFileToServer } from '../utils/upload_utils';
import { CodeSyncLogger } from '../logger';
import { generateSettings } from "../settings";
import { pathUtils } from "../utils/path_utils";
import { checkSubDir, getActiveUsers, isRepoActive, readFile, readYML } from '../utils/common';
import { getPlanLimitReached } from '../utils/pricing_utils';
import { CodeSyncState, CODESYNC_STATES } from '../utils/state_utils';
import { removeFile } from '../utils/file_utils';


export const isValidDiff = (diffData: IDiff) => {
	const missingKeys = REQUIRED_DIFF_KEYS.filter(key => !(key in diffData));
	if (missingKeys.length) return false;
	const isRename = diffData.is_rename;
	const isDirRename = diffData.is_dir_rename;
	const diff = diffData.diff;
	if (diff && diff.length > DIFF_SIZE_LIMIT) return false;
	if (isRename || isDirRename) {
		if (!diff) return false;
		let diffJSON = {};
		diffJSON = yaml.load(diff);
		if (typeof diffJSON !== "object") return false;
		if (isRename && isDirRename) return false;
		if (isRename) {
			const missingRenameKeys = REQUIRED_FILE_RENAME_DIFF_KEYS.filter(key => !(key in diffJSON));
			if (missingRenameKeys.length) return false;
		}
		if (isDirRename) {
			const missingDirRenameKeys = REQUIRED_DIR_RENAME_DIFF_KEYS.filter(key => !(key in diffJSON));
			if (missingDirRenameKeys.length) return false;
		}
	}
	return true;
};

export const handleNewFileUpload = async (accessToken: string, repoPath: string, branch: string, addedAt: string,
	relPath: string, repoId: number, configJSON: any, deleteDiff = true) => {
	/*
		Uploads new file to server and adds it in config
		Ignores if file is not present in .originals repo
	*/
	const settings = generateSettings();
	const pathUtilsObj = new pathUtils(repoPath, branch);
	const originalsFilePath = path.join(pathUtilsObj.getOriginalsRepoBranchPath(), relPath);
	if (!fs.existsSync(originalsFilePath)) {
		return {
			uploaded: false,
			deleteDiff: true,
			config: configJSON
		};
	}
	// Check plan limits
	const { planLimitReached, canRetry } = getPlanLimitReached();
	if (planLimitReached && !canRetry) return {
		uploaded: false,
		deleteDiff: false,
		config: configJSON
	};

	const response = await uploadFileToServer(accessToken, repoId, branch, originalsFilePath, relPath, addedAt, repoPath);
	if (response.error) {
		CodeSyncLogger.error(`Error uploading file=${relPath}: ${response.error}`);
		const isClientError = [HTTP_STATUS_CODES.INVALID_USAGE, HTTP_STATUS_CODES.FORBIDDEN, HTTP_STATUS_CODES.NOT_FOUND].includes(response.statusCode);
		return {
			uploaded: false,
			deleteDiff: isClientError,
			config: configJSON
		};
	}
	configJSON.repos[repoPath].branches[branch][relPath] = response.fileId;
	// write file id to config.yml
	fs.writeFileSync(settings.CONFIG_PATH, yaml.dump(configJSON));

	return {
		uploaded: true,
		deleteDiff: deleteDiff,
		config: configJSON
	};
};

export const cleanUpDeleteDiff = (repoPath: string, branch: string, relPath: string, configJSON: any) => {
	const settings = generateSettings();
	const pathUtilsObj = new pathUtils(repoPath, branch);
	const shadowPath = path.join(pathUtilsObj.getShadowRepoBranchPath(), relPath);
	const originalsPath = path.join(pathUtilsObj.getOriginalsRepoBranchPath(), relPath);
	const cacheFilePath = path.join(pathUtilsObj.getDeletedRepoBranchPath(), relPath);
	[shadowPath, originalsPath, cacheFilePath].forEach((path) => {
		if (!fs.existsSync(path)) return;
		removeFile(path, "cleanUpDeleteDiff");
	});
	delete configJSON.repos[repoPath].branches[branch][relPath];
	// write file id to config.yml
	fs.writeFileSync(settings.CONFIG_PATH, yaml.dump(configJSON));
};

export const getDIffForDeletedFile = (repoPath: string, branch: string, relPath: string, configJSON: any) => {
	let diff = "";
	const pathUtilsObj = new pathUtils(repoPath, branch);
	const shadowPath = path.join(pathUtilsObj.getShadowRepoBranchPath(), relPath);
	if (!fs.existsSync(shadowPath)) {
		cleanUpDeleteDiff(repoPath, branch, relPath, configJSON);
		return diff;
	}
	let isBinary = false;
	// See if shadow file can be read
	try {
		isBinary = isBinaryFileSync(shadowPath);
	} catch (e) {
		CodeSyncLogger.error(`getDIffForDeletedFile: isBinaryFileSync failed on ${shadowPath}`);
	}
	if (isBinary) {
		cleanUpDeleteDiff(repoPath, branch, relPath, configJSON);
		return diff;
	}
	const shadowText = readFile(shadowPath);
	const dmp = new diff_match_patch();
	const patches = dmp.patch_make(shadowText, "");
	diff = dmp.patch_toText(patches);
	cleanUpDeleteDiff(repoPath, branch, relPath, configJSON);
	return diff;
};


export class statusBarMsgs {
	/*
		Handles status bar msgs from daemon
	*/
	statusBarItem: vscode.StatusBarItem
	settings: any;
	configJSON: any;

	constructor(statusBarItem: vscode.StatusBarItem) {
		this.statusBarItem = statusBarItem;
		this.settings = generateSettings();
		this.configJSON = readYML(this.settings.CONFIG_PATH);
	}

	update = (text: string) => {
		try {
			let command = undefined;
			switch (text) {
				case STATUS_BAR_MSGS.AUTHENTICATION_FAILED:
					command = COMMAND.triggerSignUp;
					break;
				case STATUS_BAR_MSGS.ACCOUNT_DEACTIVATED:
					command = COMMAND.reactivateAccount;
					break;
				case STATUS_BAR_MSGS.CONNECT_REPO:
					command = COMMAND.triggerSync;
					break;
				case STATUS_BAR_MSGS.UPGRADE_PRICING_PLAN:
					command = COMMAND.upgradePlan;
					break;
				case STATUS_BAR_MSGS.USER_ACTIVITY_ALERT:
					command = COMMAND.viewActivity;
					break;
				case STATUS_BAR_MSGS.TEAM_ACTIVITY_ALERT:
					command = COMMAND.viewActivity;
					break;
				default:
					break;
			}
			this.statusBarItem.command = command;
			this.statusBarItem.text = text;
			this.statusBarItem.show();
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			CodeSyncLogger.error("Error updating statusBar message", e.stack);
		}
	};

	getMsg = () => {
		if (!fs.existsSync(this.settings.CONFIG_PATH)) return STATUS_BAR_MSGS.NO_CONFIG;
		const repoPath = pathUtils.getRootPath();
		const activeUsers = getActiveUsers();
		const daemonError = CodeSyncState.get(CODESYNC_STATES.DAEMON_ERROR);
		// No Valid account found
		if (!activeUsers.length) return STATUS_BAR_MSGS.AUTHENTICATION_FAILED;
		const isDeactivated = CodeSyncState.get(CODESYNC_STATES.ACCOUNT_DEACTIVATED);
		if (isDeactivated) return STATUS_BAR_MSGS.ACCOUNT_DEACTIVATED;
		// Check plan limits
		const { planLimitReached } = getPlanLimitReached();
		if (planLimitReached) {
			const canAvailTrial = CodeSyncState.get(CODESYNC_STATES.CAN_AVAIL_TRIAL);
			return canAvailTrial ? STATUS_BAR_MSGS.UPGRADE_PRICING_PLAN_FOR_FREE : STATUS_BAR_MSGS.UPGRADE_PRICING_PLAN;
		}
		const activityAlertMsg = CodeSyncState.get(CODESYNC_STATES.STATUS_BAR_ACTIVITY_ALERT_MSG);

		// No repo is opened
		if (!repoPath) return activityAlertMsg || STATUS_BAR_MSGS.NO_REPO_OPEN;
		// Branch is being uploaded
		const isSyncingBranch = CodeSyncState.get(CODESYNC_STATES.IS_SYNCING_BRANCH);
		if (isSyncingBranch) return STATUS_BAR_MSGS.UPLOADING_BRANCH;
		// Get default msg
		const defaultMsg = daemonError || activityAlertMsg || STATUS_BAR_MSGS.DEFAULT;
		const subDirResult = checkSubDir(repoPath);
		if (subDirResult.isSubDir) {
			if (subDirResult.isSyncIgnored) {
				return STATUS_BAR_MSGS.IS_SYNCIGNORED_SUB_DIR;
			}
			return defaultMsg;
		}
		// Repo is not synced
		if (!isRepoActive(this.configJSON, repoPath)) return STATUS_BAR_MSGS.CONNECT_REPO;
		return defaultMsg;
	}
}

export const getDiffsBeingProcessed = () => {
	const diffsInState = CodeSyncState.get(CODESYNC_STATES.DIFFS_BEING_PROCESSED);
	return diffsInState || new Set();
};

export const setDiffsBeingProcessed = (diffs: Set<string>) => {
	CodeSyncState.set(CODESYNC_STATES.DIFFS_BEING_PROCESSED, diffs);
};
