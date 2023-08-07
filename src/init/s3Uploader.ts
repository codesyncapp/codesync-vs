import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
<<<<<<< HEAD
import { glob } from 'glob';
import isOnline from 'is-online';
import parallel from "run-parallel";
=======
>>>>>>> b71df49 (WIP: Saving URLs and processing is WIP)

import { readYML } from '../utils/common';

import { generateSettings } from "../settings";
import { uuidv4 } from '../utils/setup_utils';
import { removeFile } from '../utils/file_utils';
<<<<<<< HEAD
import { pathUtils } from '../utils/path_utils';
import { uploadFileTos3_ } from '../utils/upload_utils';
import { CodeSyncLogger } from '../logger';
import { CODESYNC_STATES, CodeSyncState } from '../utils/state_utils';
import { IS3UploaderFile, IS3UploaderPreProcess } from '../interface';
import { S3_UPLOADR_RETRY_AFTER, S3_UPLOAD_TIMEOUT } from '../constants';
=======
>>>>>>> b71df49 (WIP: Saving URLs and processing is WIP)


export class s3Uploader {
	/*
	.codesync/
		.s3_uploader/
	
	We'll have YML files in .s3_uploader.
	Each file will look like

<<<<<<< HEAD
		repo_path: /Users/dev/codesync/codesync-vs
=======
		repo_id: 1234
>>>>>>> b71df49 (WIP: Saving URLs and processing is WIP)
		branch: master
		file_path_and_urls:
			file_path_1: url_1
			file_path_2: url_2
			...
		locked_by: uuid
<<<<<<< HEAD
		failed_count: 0
	
	Flow:
		= For valid paths and URLs, we create tasks to upload each file to s3.
		- We then iterate chunks of those tasks to slow the upload process a bit. 
		  e.g. we have 450 files then with default chunk size of 100, we will have 5 chunks.
	
	Error Handling:
		- If some chunk is failed to upload successfully somehow, we save that chunk in a separate file to retry later.
		- To retry a failed chunk, we reduce the chunk size to 50 to try with less concurrent uploads.
		- We repeat this process 3 times, finally with the chunk size of 25.
		= If failed count becomes 3 for a file, we ignore that file for now.
	
	Internet Outage:
		- If internet is offline, it retires after 5 minutes.
	*/

	REQUIRED_KEYS = ['repo_path', 'branch', 'file_path_and_urls']
	DEFAULT_CHUNK_SIZE = 100;
	settings: any;
	uuid: string;
	viaDaemon = false;
	config: any;
	tasks: any[] = [];
	repoPath = "";
	branch = "";
	filePath = "";
	originalsRepoBranchPath = "";
	filePathAndURLs = <any>{};
	chunkSize = this.DEFAULT_CHUNK_SIZE;
	failedCount = 0;

	constructor(viaDaemon=false) {
		this.settings = generateSettings();
		this.config = readYML(this.settings.CONFIG_PATH);
		this.uuid = uuidv4();
		this.viaDaemon = viaDaemon;
	}

	saveURLs (repoPath: string, branch: string, filePathsAndURLs: any, lockFile=true) {
		/*
			Once we receive the response of /v1/init from server, we save presigned URLs inside .s3_uploader/
		*/
		const data: IS3UploaderFile = {
			repo_path: repoPath, 
			branch: branch,
			file_path_and_urls: filePathsAndURLs,
			failed_count: this.failedCount
		};
		if (lockFile) data.locked_by = this.uuid;
		const fileName = `${new Date().getTime()}.yml`;
		const filePath = path.join(this.settings.S3_UPLOADER, fileName);
		fs.writeFileSync(filePath, yaml.dump(data));
		return fileName;
	}

	isInvalidFile = (content: IS3UploaderFile) => {
		if (!content) return true;
		const missingKeys = this.REQUIRED_KEYS.filter(key => !(key in content));
		return missingKeys.length;
	}

	setChunkSize() {
		// Only process files with failed_count <= 3
		switch (this.failedCount) {
			case 1:
				this.chunkSize = this.DEFAULT_CHUNK_SIZE / 2;
				break;
			case 2:
				this.chunkSize = this.DEFAULT_CHUNK_SIZE / 4;
				break;	
			case 3:
				// Not processing the file for now, might delete in the future
				return;	
			default:
				this.chunkSize = this.DEFAULT_CHUNK_SIZE;
				break;
		}
	}

	preProcess(fileName: string) {
		/* 
			Validates that the file exist and has valid data in it.
			If a file is locked by some other instance, it ignores that file
		*/
		const filePath = path.join(this.settings.S3_UPLOADER, fileName);
		this.filePath = filePath;
		let content = <IS3UploaderFile>{};
		if (!fs.existsSync(filePath)) return {
			deleteFile: true,
			skip: false,
			content
		};
		content = readYML(filePath);
		if (this.isInvalidFile(content)) return {
			deleteFile: true,
			skip: false,
			content
		};
		this.repoPath = content.repo_path;
		this.branch = content.branch;
		this.failedCount = content.failed_count;
		this.setChunkSize();
		// if some other instance of s3Uploader is processing this file, skip it
		if (content.locked_by && content.locked_by !== this.uuid) return {
			deleteFile: false,
			skip: true,
			content
		};
		// Get repoConfig for given repoID
		const repoConfig = this.config.repos[this.repoPath];
		// Remove file if repoConfig is not found
		return {
			deleteFile: !repoConfig || repoConfig.is_disconnected,
			skip: false,
			content
		};
	}

	async createTasks(content: IS3UploaderFile) {
		// Proceess the given file
		const pathUtils_ = new pathUtils(this.repoPath, content.branch);
        this.originalsRepoBranchPath = pathUtils_.getOriginalsRepoBranchPath();
		this.filePathAndURLs = <any>{};
		// Skip files which don't exist in .originals or don't have URL
		const filePathAndURLs = Object.keys(content.file_path_and_urls);
		if (!filePathAndURLs) return;
		filePathAndURLs.sort().forEach(fileRelPath => {
			const originalsFilePath = path.join(this.originalsRepoBranchPath, fileRelPath);
			if (!fs.existsSync(originalsFilePath)) return;
			const presignedURL = content.file_path_and_urls[fileRelPath];
			if (!presignedURL) {
				return removeFile(originalsFilePath, "s3Uploader.deleting-originals-file");
			}
			this.filePathAndURLs[fileRelPath] = presignedURL;
			this.tasks.push(async function (callback: any) {
				const json = <any> await uploadFileTos3_(originalsFilePath, presignedURL);
				callback(json.error, originalsFilePath);
			});
		});
	}

	async process(fileName: string) {
		const internetWorking = await isOnline();
		if (!internetWorking) {
			CodeSyncState.set(CODESYNC_STATES.INTERNET_DOWN_AT, new Date().getTime());
			CodeSyncLogger.warning("s3Uploader: Internet is down");
			return;
		}
		const json: IS3UploaderPreProcess = this.preProcess(fileName);
		if (json.deleteFile) return removeFile(this.filePath, "s3Uploader.deleting-file");
		if (json.skip) return;
		await this.createTasks(json.content);
		if (!this.tasks.length) return removeFile(this.filePath, "s3Uploader.deleting-file");
		return this.processTasks(0);
	}

	processTasks(startIndex: number) {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;
		if (startIndex > this.tasks.length-1) return this.postProcess();
		CodeSyncState.set(CODESYNC_STATES.UPLOADING_TO_S3, new Date().getTime());
		let endIndex = startIndex + this.chunkSize;
		endIndex = Math.min(this.tasks.length, endIndex);
		const tasksChunk = this.tasks.slice(startIndex, endIndex);
		CodeSyncLogger.debug(`s3Uploader: Uploading ${startIndex}->${endIndex} of ${this.tasks.length} files`);
		
		parallel(
			tasksChunk,
			function (err, results) {
				// Proceeed for next chunk
				if (!err) {
					for (const filePath of results) {
						if (typeof(filePath) !== 'string') continue;
						removeFile(filePath, 'uploadFileTos3');
					}
					return that.processTasks(endIndex);
				
				}
				// Save failed chunk in a separate file
				that.failedCount += 1;
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error(`s3Uploader: upload failed for ${startIndex}->${endIndex}`, err);
				const failedChunk = <any>{};
				const filePathAndURLs = Object.keys(that.filePathAndURLs);
				filePathAndURLs.sort().forEach((fileRelPath, index) => {
					if (index < startIndex || index >= endIndex) return;
					failedChunk[fileRelPath] = that.filePathAndURLs[fileRelPath];
				});
				that.saveURLs(that.repoPath, that.branch, failedChunk, false);
				// Proceeed for next chunk
				that.processTasks(endIndex);
			}
		);
	}

	postProcess() {
		let msg = `s3Uploader: Branch=${this.branch} chunk uploaded successfully`;
		// delete .originals repo
		if (!this.failedCount) {
			if (fs.existsSync(this.originalsRepoBranchPath)) fs.rmSync(this.originalsRepoBranchPath, { recursive: true });
			msg = `s3Uploader: Branch=${this.branch} uploaded successfully`;
		}
		CodeSyncLogger.debug(msg);
		CodeSyncState.set(CODESYNC_STATES.UPLOADING_TO_S3, "");
		return removeFile(this.filePath, "s3Uploader.deleting-file");
	}

	async run () {
		const canSkip = CodeSyncState.canSkipRun(CODESYNC_STATES.INTERNET_DOWN_AT, S3_UPLOADR_RETRY_AFTER);
		if (canSkip) return;
		const files = await glob("*.yml", { 
            cwd: this.settings.S3_UPLOADER,
			maxDepth: 1,
			nodir: true,
			dot: true
		});
		for (const fileName of files) {
			// Processing only 1 file in 1 iteration
			CodeSyncLogger.debug("s3Uploader: Processing", fileName);
			await this.process(fileName);
			return;
		}
	}
}
=======
	
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
>>>>>>> b71df49 (WIP: Saving URLs and processing is WIP)
