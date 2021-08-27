import fs from 'fs';
import path from "path";
import ignore from 'ignore';
import getBranchName from 'current-git-branch';
import {GIT_REPO, CONFIG_PATH, SHADOW_REPO, DEFAULT_BRANCH, ORIGINALS_REPO, DIFFS_REPO} from "../constants";
import { handleDirectoryRenameDiffs, manageDiff } from './diff_utils';
import {isRepoActive, readYML} from '../utils/common';

export function isGitFile(path: string) {
	return path.startsWith(GIT_REPO);
}

export function shouldIgnoreFile(repoPath: string, relPath: string) {
	// Always ignore .git/
	if (isGitFile(relPath)) { return true; }
	const syncIgnorePath = `${repoPath}/.syncignore`;
	// TODO: See what to do if syncignore is not there
	if (!fs.existsSync(syncIgnorePath)) { return true; }
	const syncignorePaths = fs.readFileSync(syncIgnorePath, "utf8");
	const splitLines = syncignorePaths.split("\n");
	const ig = ignore().add(splitLines);
	const shouldIgnore = ig.ignores(relPath);
	if (shouldIgnore) { console.log(`Skipping syncignored file: ${relPath}`); }
	return shouldIgnore;
}

export const repoIsNotSynced = (repoPath: string, configPath=CONFIG_PATH) => {
	// TODO: Show some alert to user
	// If config.yml does not exists, return
	const configExists = fs.existsSync(configPath);
	if (!configExists) { return true; }
	// Return if user hasn't synced the repo
	try {
		const config = readYML(configPath);
		return !isRepoActive(config, repoPath);
	} catch (e) {
		return true;
	}
};

export const handleRename = (repoPath: string, branch: string, oldAbsPath: string, newAbsPath: string, isFile: boolean,
							shadowRepo: string, diffsRepo: string) => {
	const oldRelPath = oldAbsPath.split(`${repoPath}/`)[1];
	const newRelPath = newAbsPath.split(`${repoPath}/`)[1];
	const oldShadowPath = path.join(shadowRepo, `${repoPath}/${branch}/${oldRelPath}`);
	const newShadowPath = path.join(shadowRepo, `${repoPath}/${branch}/${newRelPath}`);

	// rename file in shadow repo
	fs.renameSync(oldShadowPath, newShadowPath);

	if (!isFile) {
		console.log(`DirectoryRenamed: ${oldAbsPath} -> ${newAbsPath}`);
		const diff = JSON.stringify({ old_path: oldAbsPath, new_path: newAbsPath });
		handleDirectoryRenameDiffs(repoPath, branch, diff, diffsRepo);
		return;
	}

	console.log(`FileRenamed: ${oldAbsPath} -> ${newAbsPath}`);
	// Create diff
	const diff = JSON.stringify({
		old_abs_path: oldAbsPath,
		new_abs_path: newAbsPath,
		old_rel_path: oldRelPath,
		new_rel_path: newRelPath
	});
	manageDiff(repoPath, branch, newRelPath, diff, false, true, false,
		"", diffsRepo);
};

export const handleNewFile = (repoPath: string, branch: string, filePath: string,
								shadowRepo: string, originalsRepo: string, diffsRepo: string) => {
	// Skip for directory
	const lstat = fs.lstatSync(filePath);
	if (lstat.isDirectory()) { return; }
	const relPath = filePath.split(`${repoPath}/`)[1];
	// Skip .git/ and syncignore files
	if (shouldIgnoreFile(repoPath, relPath)) { return; }
	const destShadow = path.join(shadowRepo, `${repoPath}/${branch}/${relPath}`);
	const destShadowPathSplit = destShadow.split("/");
	const destShadowBasePath = destShadowPathSplit.slice(0, destShadowPathSplit.length-1).join("/");
	const destOriginals = path.join(originalsRepo, `${repoPath}/${branch}/${relPath}`);
	const destOriginalsPathSplit = destOriginals.split("/");
	const destOriginalsBasePath = destOriginalsPathSplit.slice(0, destOriginalsPathSplit.length-1).join("/");
	if (fs.existsSync(destShadow) || fs.existsSync(destOriginals)) { return; }
	console.log(`FileCreated: ${filePath}`);
	// Add file in shadow repo
	fs.mkdirSync(destShadowBasePath, { recursive: true });
	// File destination will be created or overwritten by default.
	fs.copyFileSync(filePath, destShadow);
	// Add file in originals repo
	fs.mkdirSync(destOriginalsBasePath, { recursive: true });
	// File destination will be created or overwritten by default.
	fs.copyFileSync(filePath, destOriginals);
	// Add new diff in the buffer
	manageDiff(repoPath, branch, relPath, "", true, false,
		false, "", diffsRepo);
};
