import fs from 'fs';
import path from "path";
import yaml from 'js-yaml';
import dateFormat from "dateformat";
import getBranchName from "current-git-branch";

import {
	DATETIME_FORMAT,
	DEFAULT_BRANCH,
	IGNORABLE_DIRECTORIES,
	SYNCIGNORE
} from "../constants";
import { IUserProfile } from "../interface";
import { generateSettings } from "../settings";
import { shouldIgnorePath } from '../events/utils';


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
	let config;
	try {
		config = readYML(configPath);
	} catch (e) {
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
