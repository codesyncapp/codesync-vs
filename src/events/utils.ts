import fs from 'fs';
import path from "path";
import { IGNORABLE_DIRECTORIES, SYNCIGNORE } from "../constants";
import { checkSubDir, getBranch, isRepoActive, isIgnoreAblePath, isUserActive, readYML, getSyncIgnoreItems } from '../utils/common';
import { generateSettings } from "../settings";
import { CodeSyncLogger } from '../logger';

export function shouldIgnorePath(repoPath: string, relPath: string) {
	const isIgnorableDir = isIgnoreAblePath(relPath, IGNORABLE_DIRECTORIES);
	if (isIgnorableDir) return true;
	// Allow file sync if there is no .syncignore
	const syncIgnorePath = path.join(repoPath, SYNCIGNORE);
	if (!fs.existsSync(syncIgnorePath)) return false;
	const syncIgnoreItems = getSyncIgnoreItems(repoPath);
	// Allow file sync if there .syncignore is empty
	if (!syncIgnoreItems.length) return false;
	const shouldIgnore = isIgnoreAblePath(relPath, syncIgnoreItems);
	return shouldIgnore;
}

export const isRepoSynced = (repoPath: string, checkFileIds=true) => {
	if (!repoPath) return false;
	const settings = generateSettings();
	const configPath = settings.CONFIG_PATH;
	// If config.yml does not exist, return
	if (!fs.existsSync(configPath)) return false;
	try {
		const config = readYML(configPath);
		const result = checkSubDir(repoPath);
		if (result.isSubDir) {
			if (result.isSyncIgnored) return false;
			repoPath = result.parentRepo;
		}
		if (!isRepoActive(config, repoPath)) return false;
		if (!isAccountActive(config.repos[repoPath].email)) return false;
		if (checkFileIds) {
			const branch = getBranch(repoPath);
			const configRepo = config.repos[repoPath];
			// If branch is not synced, daemon will take care of that
			if (!(branch in configRepo.branches)) return true;
			const configFiles = configRepo.branches[branch];
			const invalidFiles = Object.keys(configFiles).filter(relPath => configFiles[relPath] === null);
			const hasNullIds = invalidFiles.length && invalidFiles.length === Object.keys(configFiles).length;
			if (hasNullIds) return false;
		}
		return true;
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		CodeSyncLogger.critical("Failed to check isRepoSynced", e.stack);
		return false;
	}
};

export const isAccountActive = (email: string) => {
	const settings = generateSettings();
	if (!fs.existsSync(settings.USER_PATH)) return false;
	// Return if user hasn't synced the repo
	const users = readYML(settings.USER_PATH) || {};
	const user = users[email];
	return isUserActive(user);
};
