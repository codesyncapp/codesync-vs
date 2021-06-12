import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { IDiff } from "../interface";
import { CONFIG_PATH, DIFF_SIZE_LIMIT, REQUIRED_DIFF_KEYS, 
	REQUIRED_DIR_RENAME_DIFF_KEYS, REQUIRED_FILE_RENAME_DIFF_KEYS,
	SHADOW_REPO, ORIGINALS_REPO, DELETED_REPO } from "../constants";
import { uploadFileToServer } from './upload_file';
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
	configJSON: any, diffFilePath: string) => {
	/* 
	Uplaods new file to server and adds it in config
	Ignore if file is not present in .originals repo 
	*/
	const originalsPath = path.join(ORIGINALS_REPO, `${diffData.repo_path}/${diffData.branch}/${relPath}`);
	if (!fs.existsSync(originalsPath)) { return; }
	const response = await uploadFileToServer(access_token, repoId, diffData.branch, originalsPath, relPath, diffData.created_at);
	if (response.error) { 
		putLogEvent(`Error uploading to server: ${response.error}`);
		return;
	}
	configJSON.repos[diffData.repo_path].branches[diffData.branch][relPath] = response.fileId;
	// write file id to config.yml
	fs.writeFileSync(CONFIG_PATH, yaml.safeDump(configJSON));
	fs.unlinkSync(diffFilePath);
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


export const isDirDeleted = (repoPath: string, branch: string, relPath: string) => {
	const shadowPath = path.join(SHADOW_REPO, `${repoPath}/${branch}/${relPath}`);
	return fs.existsSync(shadowPath) && fs.lstatSync(shadowPath).isDirectory;
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
