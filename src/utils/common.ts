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
		return <any>yaml.load(readFile(filePath));
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		CodeSyncLogger.error(`Exception reading yml file: ${filePath}`, e);
		return null;
	}
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
	return Boolean(isActive && "access_token" in user && user.access_token !== "");
};

export const ErrorCodes  = {
    PRIVATE_REPO_COUNT_LIMIT_REACHED: 4006
};
