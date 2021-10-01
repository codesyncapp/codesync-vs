import fs from 'fs';
import path from "path";
import ignore from 'ignore';
import { IGNORABLE_DIRECTORIES } from "../constants";
import { isRepoActive, readYML } from '../utils/common';
import { generateSettings } from "../settings";

export function shouldIgnoreFile(repoPath: string, relPath: string) {
	// Allow file sync if it is not there is no .syncignore
	const ignorableDirs = ignore().add(IGNORABLE_DIRECTORIES);
	const isIgnorableDir = ignorableDirs.ignores(relPath);
	if (isIgnorableDir) return true;
	const syncIgnorePath = path.join(repoPath, ".syncignore");
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
	// TODO: Show some alert to user
	// If config.yml does not exists, return
	const settings = generateSettings();
	const configPath = settings.CONFIG_PATH;
	const configExists = fs.existsSync(configPath);
	if (!configExists) return false;
	// Return if user hasn't synced the repo
	try {
		const config = readYML(configPath);
		return isRepoActive(config, repoPath);
	} catch (e) {
		return false;
	}
};
