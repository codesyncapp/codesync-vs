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
	REQUIRED_DIFF_KEYS,
	REQUIRED_DIR_RENAME_DIFF_KEYS,
	REQUIRED_FILE_RENAME_DIFF_KEYS,
	STATUS_BAR_MSGS
} from "../constants";
import { uploadFileToServer } from '../utils/upload_utils';
import { putLogEvent } from '../logger';
import { generateSettings } from "../settings";
import { pathUtils } from "../utils/path_utils";
import { checkSubDir, getActiveUsers, isRepoActive, readYML } from '../utils/common';
import { getPlanLimitReached } from '../utils/pricing_utils';


export const isValidDiff = (diffData: IDiff) => {
	const missingKeys = REQUIRED_DIFF_KEYS.filter(key => !(key in diffData));
	if (missingKeys.length) { return false; }
	const isRename = diffData.is_rename;
	const isDirRename = diffData.is_dir_rename;
	const diff = diffData.diff;
	if (diff && diff.length > DIFF_SIZE_LIMIT) { return false; }
	if (isRename || isDirRename) {
		if (!diff) { return false; }
		let diffJSON = {};
		diffJSON = yaml.load(diff);
		if (typeof diffJSON !== "object") {
			return false;
		}
		if (isRename && isDirRename) {
			return false;
		}
		if (isRename) {
			const missingRenameKeys = REQUIRED_FILE_RENAME_DIFF_KEYS.filter(key => !(key in diffJSON));
			if (missingRenameKeys.length) { return false; }
		}
		if (isDirRename) {
			const missingDirRenameKeys = REQUIRED_DIR_RENAME_DIFF_KEYS.filter(key => !(key in diffJSON));
			if (missingDirRenameKeys.length) { return false; }
		}
	}
	return true;
};

export const handleNewFileUpload = async (accessToken: string, repoPath: string, branch: string, createdAt: string,
											relPath: string, repoId: number, configJSON: any) => {
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
			config: configJSON
		};
	}
	// Check plan limits
	const {planLimitReached, canRetry } = getPlanLimitReached();
	if (planLimitReached && !canRetry) return {
		uploaded: false,
		config: configJSON
	};

	const response = await uploadFileToServer(accessToken, repoId, branch, originalsFilePath, relPath, createdAt);
	if (response.error) {
		putLogEvent(`Error uploading file to server: ${response.error}`);
		return {
			uploaded: false,
			config: configJSON
		};
	}
	configJSON.repos[repoPath].branches[branch][relPath] = response.fileId;
	// write file id to config.yml
	fs.writeFileSync(settings.CONFIG_PATH, yaml.safeDump(configJSON));

	// Delete file from .originals
	if (fs.existsSync(originalsFilePath)) {
		fs.unlinkSync(originalsFilePath);
	}

	return {
		uploaded: true,
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
		if (fs.existsSync(path)) {
			fs.unlinkSync(path);
		}
	});
	delete configJSON.repos[repoPath].branches[branch][relPath];
	// write file id to config.yml
	fs.writeFileSync(settings.CONFIG_PATH, yaml.safeDump(configJSON));
};

export const getDIffForDeletedFile = (repoPath: string, branch: string, relPath: string, configJSON: any) => {
	let diff = "";
	const pathUtilsObj = new pathUtils(repoPath, branch);
	const shadowPath = path.join(pathUtilsObj.getShadowRepoBranchPath(), relPath);
	if (!fs.existsSync(shadowPath)) {
		cleanUpDeleteDiff(repoPath, branch, relPath, configJSON);
		return diff;
	}
	// See if shadow file can be read
	const isBinary = isBinaryFileSync(shadowPath);
	if (isBinary) {
		cleanUpDeleteDiff(repoPath, branch, relPath, configJSON);
		return diff;
	}
	const shadowText = fs.readFileSync(shadowPath, "utf8");
	const dmp = new diff_match_patch();
	const patches = dmp.patch_make(shadowText, "");
	diff = dmp.patch_toText(patches);
	cleanUpDeleteDiff(repoPath, branch, relPath, configJSON);
	return diff;
};

export const similarity = (s1: string, s2: string) => {
	let longer = s1;
	let shorter = s2;
	if (s1.length < s2.length) {
		longer = s2;
		shorter = s1;
	}
	const longerLength = longer.length;
	if (longerLength == 0) {
		return 1.0;
	}
	return (longerLength - editDistance(longer, shorter)) / longerLength;
};

const editDistance = (s1: string, s2: string) => {
	s1 = s1.toLowerCase();
	s2 = s2.toLowerCase();

	const costs: number[] = [];
	for (let i = 0; i <= s1.length; i++) {
		let lastValue = i;
		for (let j = 0; j <= s2.length; j++) {
			if (i == 0)
				costs[j] = j;
			else {
				if (j > 0) {
					let newValue = costs[j - 1];
					if (s1.charAt(i - 1) != s2.charAt(j - 1))
						newValue = Math.min(Math.min(newValue, lastValue),
							costs[j]) + 1;
					costs[j - 1] = lastValue;
					lastValue = newValue;
				}
			}
		}
		if (i > 0)
			costs[s2.length] = lastValue;
	}
	return costs[s2.length];
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
			if (text === STATUS_BAR_MSGS.AUTHENTICATION_FAILED) {
				this.statusBarItem.command = COMMAND.triggerSignUp;
			} else if (text === STATUS_BAR_MSGS.CONNECT_REPO) {
				this.statusBarItem.command = COMMAND.triggerSync;
			} else if (text === STATUS_BAR_MSGS.UPGRADE_PLAN) {
				this.statusBarItem.command = COMMAND.upgradePlan;
			} else {
				this.statusBarItem.command = undefined;
			}
			this.statusBarItem.text = text;
			this.statusBarItem.show();
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			putLogEvent(e.stack);
		}	
	};

	getMsg = () => {
		if (!fs.existsSync(this.settings.CONFIG_PATH)) return STATUS_BAR_MSGS.NO_CONFIG;
		const repoPath = pathUtils.getRootPath();
		const activeUsers = getActiveUsers();
		// No Valid account found
		if (!activeUsers.length) return STATUS_BAR_MSGS.AUTHENTICATION_FAILED;
		// No repo is opened
		if (!repoPath) return STATUS_BAR_MSGS.NO_REPO_OPEN;
		const subDirResult = checkSubDir(repoPath);
		if (subDirResult.isSubDir) {
			if (subDirResult.isSyncIgnored) {
				return STATUS_BAR_MSGS.IS_SYNCIGNORED_SUB_DIR;
			}
			return STATUS_BAR_MSGS.DEFAULT;	
		}
		// Repo is not synced
		if (!isRepoActive(this.configJSON, repoPath)) return STATUS_BAR_MSGS.CONNECT_REPO;
		const { planLimitReached } = getPlanLimitReached();
		return planLimitReached ? STATUS_BAR_MSGS.UPGRADE_PLAN : STATUS_BAR_MSGS.DEFAULT;
	}
}
