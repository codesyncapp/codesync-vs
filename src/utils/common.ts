import fs from 'fs';
import path from "path";
import yaml from 'js-yaml';
import ignore from 'ignore';

import getBranchName from "current-git-branch";
import dateFormat from 'dateformat';

import {
	DATETIME_FORMAT,
	DEFAULT_BRANCH,
	IGNORABLE_DIRECTORIES,
	SYNCIGNORE
} from "../constants";
import { IUserProfile } from "../interface";
import { generateSettings } from "../settings";
import { shouldIgnorePath } from '../events/utils';
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
			isSyncIgnored = relPath ? shouldIgnorePath(_repoPath, relPath) : false;
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
	return syncIgnoreItems.filter(item => item && !item.startsWith("!"));
};

export const getSkipPaths = (repoPath: string, syncignoreItems: string[]) => {
	/*
	Output of this is used by globSync to ignore given directories
	That's why appending /**  at the end of each directory path
	*/
	const skipPaths = [...IGNORABLE_DIRECTORIES.map(ignoreDir => `${repoPath}/**/${ignoreDir}/**`)];
	syncignoreItems.forEach((pattern) => {
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
		const _pattern = `${repoPath}/${pattern}/**`;
		// Make sure there are no duplicates
		if (skipPaths.includes(_pattern )) return;
		skipPaths.push(_pattern);
	});
	return skipPaths;
};

export const isIgnoreAblePath = (relPath: string, paths: string[]) => {
	const ig = ignore().add(paths);
	return ig.ignores(relPath);
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


// TODO: For now they are same, will be different in upcoming version
export const ErrorCodes  = {
    REPO_SIZE_LIMIT_REACHED: 402,
    DIFFS_LIMIT_REACHED: 402
};
