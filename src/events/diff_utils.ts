import fs from 'fs';
import walk from 'walk';
import yaml from 'js-yaml';
import path from 'path';
import dateFormat from "dateformat";
import { IDiff } from "../interface";
import {
	DIFFS_REPO, DIFF_SOURCE,
	DATETIME_FORMAT,
	SHADOW_REPO,
	DELETED_REPO
} from "../constants";


export function manageDiff(repoPath: string, branch: string, fileRelPath: string, diff: string,
							isNewFile?: boolean, isRename?: boolean, isDeleted?: boolean, createdAt?: string,
							diffsRepo=DIFFS_REPO) {
	// Skip empty diffs
	if (!diff && !isNewFile && !isDeleted) {
		console.log(`Skipping: Empty diffs`);
		return;
	}
	if (!createdAt) {
		createdAt = dateFormat(new Date(), DATETIME_FORMAT);
	}

	// Add new diff in the buffer
	const newDiff = <IDiff>{};
	newDiff.source = DIFF_SOURCE;
	newDiff.created_at = createdAt;
	newDiff.diff = diff;
	newDiff.repo_path = repoPath;
	newDiff.branch = branch;
	newDiff.file_relative_path = fileRelPath;

	if (isNewFile) {
		newDiff.is_new_file = true;
	}
	else if (isRename) {
		newDiff.is_rename = true;
	}
	else if (isDeleted) {
		newDiff.is_deleted = true;
	}
	// Append new diff in the buffer
	fs.writeFileSync(`${diffsRepo}/${new Date().getTime()}.yml`, yaml.safeDump(newDiff));
}


export const handleDirectoryRenameDiffs = async (repoPath: string, branch: string, diff: string,
												diffsRepo=DIFFS_REPO) => {
	const diffJSON = JSON.parse(diff);
	// No need to skip repos here as it is for specific repo
	const walker = walk.walk(diffJSON.new_path);
	walker.on("file", function (root, fileStats, next) {
		const newFilePath = `${root}/${fileStats.name}`;
		const oldFilePath = newFilePath.replace(diffJSON.new_path, diffJSON.old_path);
		const oldRelPath = oldFilePath.split(`${repoPath}/`)[1];
		const newRelPath = newFilePath.split(`${repoPath}/`)[1];
		const diff = JSON.stringify({
			'old_rel_path': oldRelPath,
			'new_rel_path': newRelPath,
			'old_abs_path': oldFilePath,
			'new_abs_path': newFilePath
		});
		manageDiff(repoPath, branch, newRelPath, diff, false, true, false,
			"", diffsRepo);
		next();
	});
};

export const handleDirectoryDeleteDiffs = async (
	repoPath: string, branch: string, relPath: string,
	shadowRepo=SHADOW_REPO, cacheRepo = DELETED_REPO,
	diffsRepo = DIFFS_REPO) => {
	const shadowPath = path.join(shadowRepo, `${repoPath}/${branch}/${relPath}`);
	// No need to skip repos here as it is for specific repo
	const walker = walk.walk(shadowPath);
	walker.on("file", function (root, fileStats, next) {
		const filePath = `${root}/${fileStats.name}`;
		const relPath = filePath.split(`${repoPath}/${branch}/`)[1];
		const destDeleted = path.join(cacheRepo, `${repoPath}/${branch}/${relPath}`);
		const destDeletedPathSplit = destDeleted.split("/");
		const destDeletedBasePath = destDeletedPathSplit.slice(0, destDeletedPathSplit.length-1).join("/");

		if (fs.existsSync(destDeleted)) { return; }
		// Create directories
		if (!fs.existsSync(destDeletedBasePath)) {
			// Add file in .deleted repo
			fs.mkdirSync(destDeletedBasePath, { recursive: true });
		}
		// File destination will be created or overwritten by default.
		fs.copyFileSync(filePath, destDeleted);
		manageDiff(repoPath, branch, relPath, "", false, false, true,
			"", diffsRepo);
		next();
	});
};
