import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { glob } from 'glob';
import isOnline from 'is-online';
import parallel from "run-parallel";

import { isEmpty, readYML } from '../utils/common';

import { generateSettings } from "../settings";
import { uuidv4 } from '../utils/setup_utils';
import { removeFile } from '../utils/file_utils';
import { pathUtils } from '../utils/path_utils';
import { uploadFileTos3 } from '../utils/upload_utils';
import { CodeSyncLogger } from '../logger';
import { CODESYNC_STATES, CodeSyncState } from '../utils/state_utils';
import { IS3UploaderFile, IS3UploaderPreProcess } from '../interface';
import { S3_UPLOADR_RETRY_AFTER } from '../constants';


export class s3UploaderUtils {

	uuid: string;
	settings: any;
	instanceUUID: string;
	now: number;
	config: any;

	constructor() {
		this.uuid = uuidv4();
		this.now = new Date().getTime();
		this.settings = generateSettings();
		this.instanceUUID = CodeSyncState.get(CODESYNC_STATES.INSTANCE_UUID);
		this.config = readYML(this.settings.CONFIG_PATH);
	}

	getFilesBeingProcessed = () => {
		const filesInState = CodeSyncState.get(CODESYNC_STATES.S3_UPLOADER_FILES_BEING_PROCESSED);
		return filesInState || new Set();
	};
	
	setFilesBeingProcessed = (files: Set<string>) => {
		CodeSyncState.set(CODESYNC_STATES.S3_UPLOADER_FILES_BEING_PROCESSED, files);
	};

	saveURLs = (repoPath: string, branch: string, filePathsAndURLs: any, runCount = 0) => {
		/*
			Once we receive the response of /v1/init from server, we save presigned URLs inside .s3_uploader/
		*/
		const data: IS3UploaderFile = {
			repo_path: repoPath,
			branch: branch,
			file_path_and_urls: filePathsAndURLs,
			run_count: runCount
		};
		const fileName = `${this.now}.yml`;
		const filePath = path.join(this.settings.S3_UPLOADER, fileName);
		fs.writeFileSync(filePath, yaml.dump(data));
		return fileName;
	}

	shouldProceed = async () => {
		const canSkip = CodeSyncState.canSkipRun(CODESYNC_STATES.INTERNET_DOWN_AT, S3_UPLOADR_RETRY_AFTER);
		if (canSkip) return false;
		const internetWorking = await isOnline();
		if (internetWorking) return true;
		CodeSyncState.set(CODESYNC_STATES.INTERNET_DOWN_AT, this.now);
		CodeSyncLogger.warning("s3Uploader: Internet is down");
		return false;
	}

	runUploader = async () => {
		CodeSyncState.set(CODESYNC_STATES.UPLOADING_TO_S3, this.now);
		const files = await glob("*.yml", {
			cwd: this.settings.S3_UPLOADER,
			maxDepth: 1,
			nodir: true,
			dot: true
		});
		const filesCount = files.length;
		if (!filesCount) return this.exit();
		// Check if internet is up
		const shouldProceed = await this.shouldProceed();
		if (!shouldProceed) return this.exit();

		for (const fileName of files) {
			try {
				const filesBeingProcessed = this.getFilesBeingProcessed();
				console.log(`s3uploader: filesBeingProcessed=${filesBeingProcessed.size}`);
				if (filesBeingProcessed.has(fileName)) continue;
				if (filesBeingProcessed.size) {
					const updatedFilesBeingProcessed = new Set([...filesBeingProcessed, fileName]);
					this.setFilesBeingProcessed(updatedFilesBeingProcessed);
				} else {
					this.setFilesBeingProcessed(new Set([fileName]));
				}
				const uploader = new s3Uploader(fileName);
				await uploader.process();
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.critical("s3Uploaded failed to run", e.stack);
			}
		}
	};

	exit = () => {
		CodeSyncState.set(CODESYNC_STATES.UPLOADING_TO_S3, "");
	};

	removeProperties = (objA: any, objB: string[]) => {
		const result = { ...objA }; // Create a shallow copy of objA
		for (const key of objB) {
			delete result[key];
		}
		return result;
	}
}

class s3Uploader extends s3UploaderUtils {
	/*
	.codesync/
		.s3_uploader/
	
	We'll have YML files in .s3_uploader.
	Each file will look like

		repo_path: /Users/dev/codesync/codesync-vs
		branch: master
		file_path_and_urls:
			file_path_1: url_1
			file_path_2: url_2
			...
		run_count: 0
		locked_by: uuid
		locked_at: timestamp
	
	Flow:
		- For valid paths and URLs, we create tasks to upload each file to s3.
		- We then iterate chunks of those tasks to slow the upload process a bit. 
		  e.g. we have 450 files then with default chunk size of 100, we will have 5 chunks.
	
	Error Handling:
		- If some chunk is failed to upload successfully somehow, we save that chunk in a separate file to retry later.
		- To retry a failed chunk, we reduce the chunk size to 50 to try with less concurrent uploads.
		- We repeat this process 10 times, finally with the chunk size of 100/8 = 13.
		- If run_count becomes 10 for a file, we ignore that file but keep it for now.
	
	Internet Outage:
		- If internet is offline, it retires after 5 minutes.
	*/

	REQUIRED_KEYS = ['repo_path', 'branch', 'file_path_and_urls']
	DEFAULT_CHUNK_SIZE = 100;
	MAX_RETRIES = 10;
	tasks: any[] = [];
	repoPath = "";
	branch = "";
	filePath = "";
	fileName = "";
	originalsRepoBranchPath = "";
	filePathAndURLs = <any>{};
	runCount = 0;
	chunkSize = this.DEFAULT_CHUNK_SIZE;
	chunkFailed = false;

	constructor(fileName: string) {
		super();
		this.fileName = fileName;
	}

	isInvalidFile = (content: IS3UploaderFile) => {
		if (!content) return true;
		const missingKeys = this.REQUIRED_KEYS.filter(key => !(key in content));
		return missingKeys.length;
	}

	hasFilesData = (content: IS3UploaderFile) => {
		if (!content) return false;
		return !isEmpty(content.file_path_and_urls);
	}

	setChunkSize = () => {
		switch (this.runCount) {
			case 0:
				this.chunkSize = this.DEFAULT_CHUNK_SIZE;
				break;
			case 1:
				this.chunkSize = this.DEFAULT_CHUNK_SIZE / 2;
				break;
			case 2:
				this.chunkSize = this.DEFAULT_CHUNK_SIZE / 4;
				break;
			default:
				this.chunkSize = Math.round(this.DEFAULT_CHUNK_SIZE / 8);
				break;
		}
	}

	preProcess = () => {
		/* 
			Validates that the file exist and has valid data in it.
			If a file is locked by some other instance, it ignores that file
		*/
		const filePath = path.join(this.settings.S3_UPLOADER, this.fileName);
		this.filePath = filePath;
		this.fileName;
		let content = <IS3UploaderFile>{};
		content = readYML(filePath);
		if (this.isInvalidFile(content)) {
			CodeSyncLogger.error(`s3Uploader.preProcess, Invalid File=${this.fileName}`);
			return {
				deleteFile: true,
				skip: false,
				content
			};
		}
		if (!this.hasFilesData(content)) return {
			deleteFile: true,
			skip: false,
			content
		};	
		this.repoPath = content.repo_path;
		this.branch = content.branch;
		this.runCount = content.run_count;
		CodeSyncLogger.debug(`s3Uploader.preProcess, run_count=${this.runCount}, file=${this.fileName}`);
		// if failed_count is 5, skip the file but do not delete it for now
		if (this.runCount === this.MAX_RETRIES) {
			return {
				deleteFile: false,
				skip: true,
				content
			};
		}
		this.setChunkSize();
		// if some other instance of s3Uploader is processing this file, skip it if it was locked 5 minutes ago
		if (content.locked_by && content.locked_at && content.locked_by !== this.uuid) {
			const lockedAgo = this.now - content.locked_at;
			CodeSyncLogger.debug(`s3Uploader.preProcess file=${this.fileName} was locked ${lockedAgo/1000}s ago by instance=${content.locked_by}, uuid=${this.uuid}`);
			return {
				deleteFile: false,
				skip: lockedAgo < S3_UPLOADR_RETRY_AFTER,
				content
			};
		}
		// Get repoConfig for given repoID
		const repoConfig = this.config.repos[this.repoPath];
		// Remove file if repoConfig is not found
		return {
			deleteFile: !repoConfig || repoConfig.is_disconnected,
			skip: false,
			content
		};
	}

	process = async () => {
		const shouldProceed = await this.shouldProceed();
		if (!shouldProceed) return;
		CodeSyncLogger.debug(`s3Uploader: Processing=${this.fileName}, uuid=${this.uuid}`);
		const json: IS3UploaderPreProcess = this.preProcess();
		if (json.deleteFile) {
			removeFile(this.filePath, "s3Uploader.deleting-file");
			return this.gracefulExit();
		}
		if (json.skip) return this.gracefulExit();
		await this.createTasks(json.content);
		CodeSyncLogger.debug(`s3Uploader.process: tasksCount=${this.tasks.length}, file=${this.fileName}`);
		if (!this.tasks.length) {
			removeFile(this.filePath, "s3Uploader.deleting-file");
			return this.gracefulExit();
		}
		return await this.processTasks(0);
	}

	createTasks = async (content: IS3UploaderFile) => {
		// Proceess the given file and create parallelTasks
		const pathUtils_ = new pathUtils(this.repoPath, content.branch);
		this.originalsRepoBranchPath = pathUtils_.getOriginalsRepoBranchPath();
		const fileRelPaths = Object.keys(content.file_path_and_urls);
		if (!fileRelPaths || isEmpty(content.file_path_and_urls)) return;
		this.filePathAndURLs = <any>{};
		// Skip files which don't exist in .originals or don't have URL
		fileRelPaths.sort().forEach(fileRelPath => {
			const originalsFilePath = path.join(this.originalsRepoBranchPath, fileRelPath);
			if (!fs.existsSync(originalsFilePath)) return;
			const presignedURL = content.file_path_and_urls[fileRelPath];
			if (!presignedURL) return removeFile(originalsFilePath, "s3Uploader.deleting-originals-file");
			this.filePathAndURLs[fileRelPath] = presignedURL;
			this.tasks.push(async function (callback: any) {
				const json = <any>await uploadFileTos3(originalsFilePath, presignedURL);
				callback(json.error, originalsFilePath);
			});
		});
	}

	processTasks = async (startIndex: number) => {
		if (!await this.shouldProceed()) return;
		if (startIndex === 0) {
			this.runCount += 1;
			this.updateFile(null, this.runCount);
		}
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;
		if (startIndex > this.tasks.length - 1) return this.postProcess();
		let endIndex = startIndex + this.chunkSize;
		endIndex = Math.min(this.tasks.length, endIndex);
		const tasksChunk = this.tasks.slice(startIndex, endIndex);
		CodeSyncLogger.debug(`s3Uploader.processTasks: Uploading ${startIndex}->${endIndex} of ${this.tasks.length} files, file=${this.fileName}`);

		parallel(
			tasksChunk,
			async function (err, results) {
				// Proceeed for next chunk				
				if (!err) {
					const uploadedRelPaths: string[] = [];
					// Deleting .originals files for the chunk that was uploaded successfully
					for (const filePath of results) {
						if (typeof (filePath) !== 'string') continue;
						const fileRelPath = filePath.split(path.join(that.originalsRepoBranchPath, path.sep))[1];
						uploadedRelPaths.push(fileRelPath);
						removeFile(filePath, 's3Uploader.deleting-originals-file in parallel callback');
					}
					that.removeChunkAndUpdateFile(uploadedRelPaths);
					return await that.processTasks(endIndex);
				}
				that.chunkFailed = true;
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error(`s3Uploader.processTasks: ${startIndex}->${endIndex} chunk failed, file=${that.fileName}`, err);
				// Save failed chunk in a separate file
				const failedChunk = <any>{};
				const fileRelPaths = Object.keys(that.filePathAndURLs);
				fileRelPaths.sort().forEach((fileRelPath, index) => {
					if (index < startIndex || index >= endIndex) return;
					failedChunk[fileRelPath] = that.filePathAndURLs[fileRelPath];
				});
				that.saveURLs(that.repoPath, that.branch, failedChunk);
				const failedRelPaths = Object.keys(failedChunk);
				that.removeChunkAndUpdateFile(failedRelPaths);
				// Proceeed for next chunk
				await that.processTasks(endIndex);
			}
		);
	}

	postProcess = () => {
		const msg = `s3Uploader.postProcess: File=${this.fileName} processed successfully, branch=${this.branch}`;
		CodeSyncLogger.debug(msg);
		if (this.chunkFailed) return this.gracefulExit();
		// Delete file only if no chunk was failed, otherwise keep the file and retry later
		removeFile(this.filePath, "s3Uploader.deleting-file");
		this.gracefulExit();
	}

	removeChunkAndUpdateFile = (fileRelPaths: string[]) => {
		const fileContent = readYML(this.filePath);
		const filePathAndURLs = fileContent.file_path_and_urls;
		const updatedFilePathAndURLs = this.removeProperties(filePathAndURLs, fileRelPaths);
		CodeSyncLogger.debug(`s3Uploader.removeChunkAndUpdateFile: Replacing ${Object.keys(filePathAndURLs).length} keys with ${Object.keys(updatedFilePathAndURLs).length} keys, file=${this.fileName}`);
		this.updateFile(updatedFilePathAndURLs);
	}

	updateFile = (filePathAndURLs = null, runCount = 0) => {
		const fileContent = readYML(this.filePath);
		if (filePathAndURLs) {
			fileContent.file_path_and_urls = filePathAndURLs;
		}
		if (runCount) {
			fileContent.run_count = runCount;
			fileContent.locked_by = this.uuid;
			fileContent.locked_at = this.now;
		}
		fs.writeFileSync(this.filePath, yaml.dump(fileContent));
	}

	gracefulExit = () => {
		// Remove file from filesBeingProcessed
		const filesBeingProcessed = this.getFilesBeingProcessed();
		if (filesBeingProcessed.size) {
			filesBeingProcessed.delete(this.fileName);
		}
		this.setFilesBeingProcessed(filesBeingProcessed);
		if (filesBeingProcessed.size) return;
		CodeSyncLogger.debug("Exiting s3Uploader");
		return this.exit();
	}
}
