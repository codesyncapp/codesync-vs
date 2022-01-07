import fs from 'fs';
import path from "path";
import vscode from 'vscode';
import yaml from 'js-yaml';
import dateFormat from "dateformat";
import getBranchName from "current-git-branch";

import {
	COMMAND,
	DATETIME_FORMAT,
	DEFAULT_BRANCH,
	IGNORABLE_DIRECTORIES, LOG_AFTER_X_TIMES,
	STATUS_BAR_MSGS,
	SYNCIGNORE
} from "../constants";
import { IUserProfile } from "../interface";
import { generateSettings } from "../settings";
import {putLogEvent} from "../logger";


export const readFile = (filePath: string) => {
	return fs.readFileSync(filePath, "utf8");
};

export const readYML = (filePath: string) => {
	try {
		return yaml.load(readFile(filePath));
	} catch (e) {
		return null;
	}
};

export const updateStatusBarItem = (statusBarItem: vscode.StatusBarItem, text: string) => {
	try {
		if (text === STATUS_BAR_MSGS.AUTHENTICATION_FAILED) {
			statusBarItem.command = COMMAND.triggerSignUp;
		} else if (text === STATUS_BAR_MSGS.CONNECT_REPO) {
			statusBarItem.command = COMMAND.triggerSync;
		} else {
			statusBarItem.command = undefined;
		}
		statusBarItem.text = text;
		statusBarItem.show();
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		putLogEvent(e.stack);
	}
};

export const isRepoActive = (config: any, repoPath: string) => {
	return repoPath in config.repos && !config.repos[repoPath].is_disconnected &&
		!isEmpty(config.repos[repoPath].branches) && Boolean(config.repos[repoPath].email);
};

export const getSyncIgnoreItems = (repoPath: string) => {
	const syncIgnorePath = path.join(repoPath, SYNCIGNORE);
	const syncIgnoreExists = fs.existsSync(syncIgnorePath);
	if (!syncIgnoreExists) {
		return [];
	}
	let syncIgnoreData = "";
	syncIgnoreData = readFile(syncIgnorePath);
	const syncIgnoreItems = syncIgnoreData.split("\n");
	return syncIgnoreItems.filter(item =>  item);
};

export const getSkipRepos = (repoPath: string, syncignoreItems: string[]) => {
	const skipRepos = [...IGNORABLE_DIRECTORIES];
	syncignoreItems.forEach((pattern) => {
		const itemPath = path.join(repoPath, pattern);
		if (!fs.existsSync(itemPath)) { return; }
		const lstat = fs.lstatSync(itemPath);
		if (lstat.isDirectory()) {
			skipRepos.push(pattern);
		}
	});
	return skipRepos;
};

export const isEmpty = (obj: any) => {
    return Object.keys(obj).length === 0;
};

export const getBranch = (repoPath: string) => {
	return getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
};

export const formatDatetime = (datetime?: number) => {
	if (datetime) {
		return dateFormat(new Date(datetime), DATETIME_FORMAT);
	}
	return dateFormat(new Date(), DATETIME_FORMAT);
};

export const isUserActive = (user: IUserProfile) => {
	const isActive = 'is_active' in user ? user.is_active : true;
	return isActive && "access_token" in user && user.access_token !== "";
};

export const getActiveUsers = () => {
	const settings = generateSettings();
	const users = readYML(settings.USER_PATH) || {};
	const validUsers: any[] = [];
	Object.keys(users).forEach(email => {
		const user = users[email];
		if (isUserActive(user)) {
			validUsers.push({ email, access_token: user.access_token });
		}
	});
	return validUsers;
};

export const logMsg = (msg: string, errCount: number) => {
	if (errCount === 0 || errCount > LOG_AFTER_X_TIMES) {
		putLogEvent(msg);
	}
	if (errCount > LOG_AFTER_X_TIMES) {
		errCount = 0;
		return errCount;
	}
	errCount += 1;
	return errCount;
};
