import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

import { readYML } from '../utils/common';

import { generateSettings } from "../settings";
import { uuidv4 } from '../utils/setup_utils';
import { removeFile } from '../utils/file_utils';


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
		// Process file
		for (const key of this.config.repos) {
			repoConfig = this.config.repos[key];
			repoConfig = repoConfig.id === content.repo_id && !repoConfig.is_disconnected ? repoConfig : null;
		}
		// Remove file if repoConfig is not found
		if (!repoConfig) return removeFile(filePath, "s3Uploader.process");

	}

	static run () {
		// 
	}
}