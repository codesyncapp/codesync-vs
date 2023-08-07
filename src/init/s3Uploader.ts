import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import parallel from "run-parallel";

import { readYML } from '../utils/common';

import { generateSettings } from "../settings";
import { uuidv4 } from '../utils/setup_utils';
import { removeFile } from '../utils/file_utils';
import { pathUtils } from '../utils/path_utils';
import { uploadFileTos3 } from '../utils/upload_utils';
import { CodeSyncLogger } from '../logger';


export class s3Uploader {
	/*
	.codesync/
		.s3_uploader/
	
	We'll have YML files in .s3_uploader.
	Each file will look like

		repo_id: 1234
		branch: master
		file_path_and_urls:
			file_path_1: url_1
			file_path_2: url_2
			...
		locked_by: uuid
	
	*/

	settings: any;
	uuid: string;
	config: any;

	constructor() {
		this.settings = generateSettings();
		this.config = readYML(this.settings.CONFIG_PATH);
		this.uuid = uuidv4();
	}

	saveURLs (repoId: string, branch: string, filePathsAndURLs: any) {
		/*
			Once we receive the response of /v1/init from server, we save presigned URLs inside .s3_uploader/
		*/
		const data = {
			repo_id: repoId, 
			branch: branch,
			file_path_and_urls: filePathsAndURLs,
			locked_by: this.uuid
		};

		const fileName = `${new Date().getTime()}.yml`;
		const filePath = path.join(this.settings.S3_UPLOADER, fileName);
		fs.writeFileSync(filePath, yaml.dump(data));
		return filePath;
	}

	async process (filePath: string) {
		if (!fs.existsSync(filePath)) return;
		const content = readYML(filePath);
		// if some other instance of s3Uploader is processing this file, skip it
		if (content.locked_by && content.locked_by !== this.uuid) return;
		let repoConfig = null;
		let repoPath = "";
		const validPaths = {...content.file_path_and_urls};
		// Process file
		for (repoPath of this.config.repos) {
			repoConfig = this.config.repos[repoPath];
			repoConfig = repoConfig.id === content.repo_id && !repoConfig.is_disconnected ? repoConfig : null;
		}
		// Remove file if repoConfig is not found
		if (!repoConfig) return removeFile(filePath, "s3Uploader.deleting-file");

		const tasks: any[] = [];
		const pathUtils_ = new pathUtils(repoPath, content.branch);
        const originalsRepoBranchPath = pathUtils_.getOriginalsRepoBranchPath();
		// Skip files which don't exist in .originals or don't have URL
		for (const fileRelPath of content.file_path_and_urls) {
			const originalsFilePath = path.join(originalsRepoBranchPath, fileRelPath);
			if (!fs.existsSync(originalsFilePath))continue;
			const presignedURL = content.file_path_and_urls[fileRelPath];
			if (!presignedURL) {
				removeFile(originalsFilePath, "s3Uploader.deleting-originals-file");
				continue;
			}
			tasks.push(async function (callback: any) {
				const json = <any> await uploadFileTos3(originalsFilePath, presignedURL);
				callback(json.error, true);
			});
		}
		CodeSyncLogger.debug(`Uploading ${tasks.length} files to s3`);

		s3Uploader.processTasks(tasks, 0);
		

	}

	static processTasks(tasks: any[], startIndex: number) {
		console.log(`Processing tasks startIndex=${startIndex}`);
		const CHUNK_SIZE = 100;
		if (startIndex > tasks.length) return;
		const tasksChunk = tasks.slice(startIndex, startIndex+CHUNK_SIZE);
		const index = startIndex + CHUNK_SIZE;
		parallel(
			tasksChunk,
			function (err, results) {
				s3Uploader.processTasks(tasks, index);
			}
		);
	}

	static run () {
		// 
	}
}