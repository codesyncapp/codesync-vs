import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { IDiff } from "../interface";
import { CONFIG_PATH, DIFF_SIZE_LIMIT, REQUIRED_DIFF_KEYS,
	REQUIRED_DIR_RENAME_DIFF_KEYS, REQUIRED_FILE_RENAME_DIFF_KEYS,
	SHADOW_REPO, ORIGINALS_REPO, DELETED_REPO } from "../constants";
import { uploadFileToServer } from '../utils/upload_utils';
import { isBinaryFileSync } from 'isbinaryfile';
import { diff_match_patch } from 'diff-match-patch';
import { putLogEvent } from '../logger';


export const isValidDiff = (diffData: IDiff) => {
	const missingKeys = REQUIRED_DIFF_KEYS.filter(key => !(key in diffData));
	if (missingKeys.length) { return false; }
	const isRename = diffData.is_rename;
	const isDirRename = diffData.is_dir_rename;
	const diff = diffData.diff;
	if (diff && diff.length > DIFF_SIZE_LIMIT) { return false; }
	if (isRename || isDirRename) {
		if (!diff) { return false; }
		let diffJSON = {};
		try {
			diffJSON = yaml.load(diff);
		} catch (e) {
			return false;
		}
		if (isRename) {
			const missingRenameKeys = REQUIRED_FILE_RENAME_DIFF_KEYS.filter(key => !(key in diffJSON));
			if (missingRenameKeys.length) { return false; }
		}
		if (isDirRename) {
			const missingDirRenameKeys = REQUIRED_DIR_RENAME_DIFF_KEYS.filter(key => !(key in diffJSON));
			if (missingDirRenameKeys.length) { return false; }
		}
	}
	return true;
};

export const handleNewFileUpload = async (access_token: string, diffData: IDiff, relPath: string, repoId: number,
	configJSON: any) => {
	/*
	Uplaods new file to server and adds it in config
	Ignore if file is not present in .originals repo
	*/
	const originalsPath = path.join(ORIGINALS_REPO, `${diffData.repo_path}/${diffData.branch}/${relPath}`);
	if (!fs.existsSync(originalsPath)) {
		return {
			uploaded: false,
			config: configJSON
		};
	}
	const response = await uploadFileToServer(access_token, repoId, diffData.branch, originalsPath, relPath, diffData.created_at);
	if (response.error) {
		putLogEvent(`Error uploading to server: ${response.error}`);
		return {
			uploaded: false,
			config: configJSON
		};
	}
	configJSON.repos[diffData.repo_path].branches[diffData.branch][relPath] = response.fileId;
	// write file id to config.yml
	fs.writeFileSync(CONFIG_PATH, yaml.safeDump(configJSON));
	return {
		uploaded: true,
		config: configJSON
	};
};

export const handleFilesRename = (configJSON: any, repoPath: string, branch: string,
	relPath: string, oldFileId: number, oldRelPath: string) => {

	const oldShadowPath = path.join(SHADOW_REPO, `${repoPath}/${branch}/${oldRelPath}`);
	const newShadowPath = path.join(SHADOW_REPO, `${repoPath}/${branch}/${relPath}`);
	if (fs.existsSync(oldShadowPath)) {
		fs.renameSync(oldShadowPath, newShadowPath);
	}
	configJSON.repos[repoPath].branches[branch][relPath] = oldFileId;
	// write file id to config.yml
	fs.writeFileSync(CONFIG_PATH, yaml.safeDump(configJSON));
};

export const cleanUpDeleteDiff = (repoPath: string, branch: string, relPath: string, configJSON: any) => {
	const shadowPath = path.join(SHADOW_REPO, `${repoPath}/${branch}/${relPath}`);
	const originalsPath = path.join(ORIGINALS_REPO, `${repoPath}/${branch}/${relPath}`);
	const cacheFilePath = path.join(DELETED_REPO, `${repoPath}/${branch}/${relPath}`);
	[shadowPath, originalsPath, cacheFilePath].forEach((path) => {
		if (fs.existsSync(path)) {
			fs.unlinkSync(path);
		}
	});
	delete configJSON.repos[repoPath].branches[branch][relPath];
	// write file id to config.yml
	fs.writeFileSync(CONFIG_PATH, yaml.safeDump(configJSON));
};

export const getDIffForDeletedFile = (repoPath: string, branch: string, relPath: string, configJSON: any) => {
	const shadowPath = path.join(SHADOW_REPO, `${repoPath}/${branch}/${relPath}`);
	let diff = "";
	if (!fs.existsSync(shadowPath)) {
		cleanUpDeleteDiff(repoPath, branch, relPath, configJSON);
		return diff;
	}
	// See if shadow file can be read
	const isBinary = isBinaryFileSync(shadowPath);
	if (isBinary) {
		cleanUpDeleteDiff(repoPath, branch, relPath, configJSON);
		return diff;
	}
	const shadowText = fs.readFileSync(shadowPath, "utf8");
	const dmp = new diff_match_patch();
	const patches = dmp.patch_make(shadowText, "");
	diff = dmp.patch_toText(patches);
	cleanUpDeleteDiff(repoPath, branch, relPath, configJSON);
	return diff;
};

export const similarity = (s1: string, s2: string) => {
	let longer = s1;
	let shorter = s2;
	if (s1.length < s2.length) {
		longer = s2;
		shorter = s1;
	}
	const longerLength = longer.length;
	if (longerLength == 0) {
		return 1.0;
	}
	return (longerLength - editDistance(longer, shorter)) / longerLength;
};

const editDistance = (s1: string, s2: string) => {
	s1 = s1.toLowerCase();
	s2 = s2.toLowerCase();

	const costs: number[] = [];
	for (let i = 0; i <= s1.length; i++) {
		let lastValue = i;
		for (let j = 0; j <= s2.length; j++) {
			if (i == 0)
				costs[j] = j;
			else {
				if (j > 0) {
					let newValue = costs[j - 1];
					if (s1.charAt(i - 1) != s2.charAt(j - 1))
						newValue = Math.min(Math.min(newValue, lastValue),
							costs[j]) + 1;
					costs[j - 1] = lastValue;
					lastValue = newValue;
				}
			}
		}
		if (i > 0)
			costs[s2.length] = lastValue;
	}
	return costs[s2.length];
};
