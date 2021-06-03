import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { IDiff } from "../interface";
import { CONFIG_PATH, DIFF_SIZE_LIMIT, REQUIRED_DIFF_KEYS, 
	REQUIRED_DIR_RENAME_DIFF_KEYS, REQUIRED_FILE_RENAME_DIFF_KEYS,
	SHADOW_REPO, ORIGINALS_REPO } from "../constants";
import { uploadFileToServer } from './upload_file';


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
	if (response.error) { return; }
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