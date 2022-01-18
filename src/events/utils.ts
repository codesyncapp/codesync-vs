import fs from 'fs';
import path from "path";
import ignore from 'ignore';
import { IGNORABLE_DIRECTORIES, SYNCIGNORE } from "../constants";
import { checkSubDir, isRepoActive, isUserActive, readYML } from '../utils/common';
import { generateSettings } from "../settings";

export function shouldIgnoreFile(repoPath: string, relPath: string) {
	// Allow file sync if it is not there is no .syncignore
	const ignorableDirs = ignore().add(IGNORABLE_DIRECTORIES);
	const isIgnorableDir = ignorableDirs.ignores(relPath);
	if (isIgnorableDir) return true;
	const syncIgnorePath = path.join(repoPath, SYNCIGNORE);
	if (!fs.existsSync(syncIgnorePath)) return false;
	const syncignorePaths = fs.readFileSync(syncIgnorePath, "utf8");
	const splitLines = syncignorePaths.split("\n");
	const ig = ignore().add(splitLines);
	const shouldIgnore = ig.ignores(relPath);
	if (shouldIgnore) { console.log(`Skipping syncignored file: ${relPath}`); }
	return shouldIgnore;
}

export const isRepoSynced = (repoPath: string) => {
	if (!repoPath) return false;
	const settings = generateSettings();
	const configPath = settings.CONFIG_PATH;
	// If config.yml does not exist, return
	if (!fs.existsSync(configPath)) return false;
	try {
		const config = readYML(configPath);
		const result = checkSubDir(repoPath);
		if (result.isSubDir) {
			repoPath = result.parentRepo;
		}
		if (!isRepoActive(config, repoPath)) return false;
		return isAccountActive(config.repos[repoPath].email);
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
