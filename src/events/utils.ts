import fs from 'fs';
import path from "path";
import ignore from 'ignore';
import { GIT_REPO } from "../constants";
import { isRepoActive, readYML } from '../utils/common';
import { generateSettings } from "../settings";

export function isGitFile(path: string) {
	return path.startsWith(GIT_REPO);
}

export function shouldIgnoreFile(repoPath: string, relPath: string) {
	// Allow file sync if it is not there is no .syncignore
	// Always ignore .git/
	if (isGitFile(relPath)) { return true; }
	const syncIgnorePath = path.join(repoPath, ".syncignore");
	if (!fs.existsSync(syncIgnorePath)) return false;
	const syncignorePaths = fs.readFileSync(syncIgnorePath, "utf8");
	const splitLines = syncignorePaths.split("\n");
	const ig = ignore().add(splitLines);
	const shouldIgnore = ig.ignores(relPath);
	if (shouldIgnore) { console.log(`Skipping syncignored file: ${relPath}`); }
	return shouldIgnore;
}

export const repoIsNotSynced = (repoPath: string) => {
	if (!repoPath) return true;
	// TODO: Show some alert to user
	// If config.yml does not exists, return
	const settings = generateSettings();
	const configPath = settings.CONFIG_PATH;
	const configExists = fs.existsSync(configPath);
	if (!configExists) return true;
	// Return if user hasn't synced the repo
	try {
		const config = readYML(configPath);
		return !isRepoActive(config, repoPath);
	} catch (e) {
		return true;
	}
};
