import fs from 'fs';
import path from "path";
import ignore from 'ignore';
import { GIT_REPO } from "../constants";
import { handleDirectoryRenameDiffs, manageDiff } from './diff_utils';
import { isRepoActive, readYML } from '../utils/common';
import { generateSettings } from "../settings";
import { pathUtils } from "../utils/path_utils";

export function isGitFile(path: string) {
	return path.startsWith(GIT_REPO);
}

export function shouldIgnoreFile(repoPath: string, relPath: string) {
	// Always ignore .git/
	if (isGitFile(relPath)) { return true; }
	const syncIgnorePath = path.join(repoPath, ".syncignore");
	// TODO: See what to do if syncignore is not there
	if (!fs.existsSync(syncIgnorePath)) { return true; }
	const syncignorePaths = fs.readFileSync(syncIgnorePath, "utf8");
	const splitLines = syncignorePaths.split("\n");
	const ig = ignore().add(splitLines);
	const shouldIgnore = ig.ignores(relPath);
	if (shouldIgnore) { console.log(`Skipping syncignored file: ${relPath}`); }
	return shouldIgnore;
}

export const repoIsNotSynced = (repoPath: string) => {
	// TODO: Show some alert to user
	// If config.yml does not exists, return
	const settings = generateSettings();
	const configPath = settings.CONFIG_PATH;
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

export const handleRename = (repoPath: string, branch: string, oldAbsPath: string,
							newAbsPath: string, isFile: boolean) => {

	const oldRelPath = oldAbsPath.split(path.join(repoPath, path.sep))[1];
	const newRelPath = newAbsPath.split(path.join(repoPath, path.sep))[1];

	const pathUtilsObj = new pathUtils(repoPath, branch);
	const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
	const oldShadowPath = path.join(shadowRepoBranchPath, oldRelPath);
	const newShadowPath = path.join(shadowRepoBranchPath, newRelPath);

	// rename file in shadow repo
	fs.renameSync(oldShadowPath, newShadowPath);

	if (!isFile) {
		console.log(`DirectoryRenamed: ${oldAbsPath} -> ${newAbsPath}`);
		const diff = JSON.stringify({ old_path: oldAbsPath, new_path: newAbsPath });
		handleDirectoryRenameDiffs(repoPath, branch, diff);
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
	manageDiff(repoPath, branch, newRelPath, diff, false, true);
};

export const handleNewFile = (repoPath: string, branch: string, filePath: string) => {
	// Do not continue if file does not exist
	if (!fs.existsSync(filePath)) { return; }
	// Skip directory
	const lstat = fs.lstatSync(filePath);
	if (lstat.isDirectory()) { return; }

	const relPath = filePath.split(path.join(repoPath, path.sep))[1];
	// Skip .git/ and syncignore files
	if (shouldIgnoreFile(repoPath, relPath)) { return; }

	const pathUtilsObj = new pathUtils(repoPath, branch);
	const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
	const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();

	const shadowPath = path.join(shadowRepoBranchPath, relPath);
	const destShadowBasePath = path.dirname(shadowPath);
	const originalsPath = path.join(originalsRepoBranchPath, relPath);
	const destOriginalsBasePath = path.dirname(originalsPath);
	if (fs.existsSync(shadowPath) || fs.existsSync(originalsPath)) { return; }
	console.log(`FileCreated: ${filePath}`);
	// Add file in shadow repo
	fs.mkdirSync(destShadowBasePath, { recursive: true });
	// File destination will be created or overwritten by default.
	fs.copyFileSync(filePath, shadowPath);
	// Add file in originals repo
	fs.mkdirSync(destOriginalsBasePath, { recursive: true });
	// File destination will be created or overwritten by default.
	fs.copyFileSync(filePath, originalsPath);
	// Add new diff in the buffer
	manageDiff(repoPath, branch, relPath, "", true);
};
