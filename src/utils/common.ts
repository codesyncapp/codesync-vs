import fs from 'fs';
import os from 'os';
import path from "path";
import yaml from 'js-yaml';
import ignore from 'ignore';

import getBranchName from "current-git-branch";
import dateFormat from 'dateformat';

import {
	DATETIME_FORMAT,
	DEFAULT_BRANCH,
	SYNCIGNORE
} from "../constants";
import { IUserProfile } from "../interface";
import { generateSettings } from "../settings";
import { CodeSyncLogger } from '../logger';


export const readFile = (filePath: string) => {
	return fs.readFileSync(filePath, "utf8");
};

export const readYML = (filePath: string) => {
	try {
		return yaml.load(readFile(filePath));
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		CodeSyncLogger.error(`Exception reading yml file: ${filePath}`, e);
		return null;
	}
};

export const isRepoActive = (config: any, repoPath: string) => {
	return repoPath in config.repos && !config.repos[repoPath].is_disconnected &&
		!isEmpty(config.repos[repoPath].branches) && Boolean(config.repos[repoPath].email);
};

export const checkSubDir = (currentRepoPath: string) => {
	const settings = generateSettings();
	const configPath = settings.CONFIG_PATH;
	let isSyncIgnored = false;
	// If config.yml does not exist, return
	if (!fs.existsSync(configPath)) return {
		isSubDir: false,
		parentRepo: "",
		isSyncIgnored
	};
	const config = readYML(configPath);
	if (!config) {
		return {
			isSubDir: false,
			parentRepo: "",
			isSyncIgnored
		};
	}

	const repoPaths = Object.keys(config.repos);
	const defaultIgnorePatterns = getDefaultIgnorePatterns();

	let parentRepo = "";
	for (const _repoPath of repoPaths) {
		const configRepo = config.repos[_repoPath];
		// Skip disconnected repos
		if (configRepo.is_disconnected) continue;
		const relative = path.relative(_repoPath, currentRepoPath);
		const isSubdir = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
		if (isSubdir) {
			parentRepo = _repoPath;
			const relPath = currentRepoPath.split(path.join(_repoPath, path.sep))[1];
			const syncIgnoreItems = getSyncIgnoreItems(_repoPath);
			isSyncIgnored = relPath ? shouldIgnorePath(relPath, defaultIgnorePatterns, syncIgnoreItems) : false;
			break;
		}
	}
	
	return {
		isSubDir: !!parentRepo,
		parentRepo,
		isSyncIgnored
	};
};

export const getSyncIgnoreItems = (repoPath: string) => {
	const syncIgnorePath = path.join(repoPath, SYNCIGNORE);
	const syncIgnoreExists = fs.existsSync(syncIgnorePath);
	if (!syncIgnoreExists) return [];
	const syncIgnoreData = readFile(syncIgnorePath);
	const syncIgnoreItems = syncIgnoreData.split("\n");
	return syncIgnoreItems.filter(item => item && !item.startsWith("#"));
};

export const getDefaultIgnorePatterns = () => {
	const settings = generateSettings();
	if (!fs.existsSync(settings.SYNCIGNORE_PATH)) return [];
	const syncignoreYML = readYML(settings.SYNCIGNORE_PATH);
	const defaultSyncignoreData = syncignoreYML.content.split("\n");
	return defaultSyncignoreData.filter((pattern: string) => pattern && !pattern.startsWith("#"));
};

export const getGlobIgnorePatterns = (repoPath: string, syncignoreItems: string[]) => {
	/*
	Output of this is used by glob to ignore given directories
	That's why appending /**  at the end of each directory path
	*/
	if (os.platform() === 'win32') {
		repoPath = repoPath.replace(/\\/g, "/");
	}
	
	const defaultIgnorePatterns = getDefaultIgnorePatterns();
	// For glob, skipping only directory paths
	const skipPatterns = defaultIgnorePatterns.map((pattern: string) => {
		if (pattern.endsWith("/")) {
			return `**/${pattern}**`;
		}
		return `**/${pattern}`;
	});
	syncignoreItems.forEach((pattern) => {
		// Removing any terminator as we need to check path in the code below 
		for (const terminator of ["/", "/*", "/**"]) {
			if (pattern.endsWith(terminator)) {
				const splitPath = pattern.split(terminator);
				pattern = splitPath.slice(0, splitPath.length-1).join("");
				break;				
			}
		}
		const itemPath = path.join(repoPath, pattern);
		// Only need to append /** for directories
		if (!fs.existsSync(itemPath) || !fs.lstatSync(itemPath).isDirectory()) return;
		const _pattern = `**/${pattern}/**`;
		// Make sure there are no duplicates
		if (skipPatterns.includes(_pattern)) return;
		skipPatterns.push(_pattern);
	});
	return skipPatterns;
};

export const isIgnorablePath = (relPath: string, paths: string[]) => {
	const ig = ignore().add(paths);
	return ig.ignores(relPath);
};

export function shouldIgnorePath(relPath: string, defaultIgnorePatterns: string[], syncIgnorePatterns: string[]) {
	const isIgnorableByDefault = isIgnorablePath(relPath, defaultIgnorePatterns);
	if (isIgnorableByDefault) return true;
	if (!syncIgnorePatterns.length) return false;
	const shouldIgnore = isIgnorablePath(relPath, syncIgnorePatterns);
	return shouldIgnore;
}

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


// TODO: For now they are same, will be different in upcoming version
export const ErrorCodes  = {
    REPO_SIZE_LIMIT_REACHED: 402,
    DIFFS_LIMIT_REACHED: 402
};
