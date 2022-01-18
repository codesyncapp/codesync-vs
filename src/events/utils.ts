import fs from 'fs';
import path from "path";
import ignore from 'ignore';
import { IGNORABLE_DIRECTORIES, SYNCIGNORE } from "../constants";
import { checkSubDir, getBranch, isRepoActive, isUserActive, readYML } from '../utils/common';
import { generateSettings } from "../settings";

export function shouldIgnorePath(repoPath: string, relPath: string) {
	// Allow file sync if it is not there is no .syncignore
	const ignorableDirs = ignore().add(IGNORABLE_DIRECTORIES);
	const isIgnorableDir = ignorableDirs.ignores(relPath);
	if (isIgnorableDir) return true;
	const syncIgnorePath = path.join(repoPath, SYNCIGNORE);
	if (!fs.existsSync(syncIgnorePath)) return false;
	const syncignorePaths = fs.readFileSync(syncIgnorePath, "utf8");
	const splitLines = syncignorePaths.split("\n").map(item => {
		if (!item) return item;
		if (item.endsWith("/*")) {
			const splitPath = item.split("/*");
			return splitPath.slice(0, splitPath.length-1).join("");
		} 
		else if (item.endsWith("/")) {
			const splitPath = item.split("/");
			return splitPath.slice(0, splitPath.length-1).join("");
		} 
		return item;
	});
	const ig = ignore().add(splitLines);
	const shouldIgnore = ig.ignores(relPath);
	if (shouldIgnore) { console.log(`Skipping syncignored path: ${relPath}`); }
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
