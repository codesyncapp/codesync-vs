import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import vscode from 'vscode';
import parallel from "run-parallel";

import { readYML } from '../utils/common';

import { generateSettings } from "../settings";
import { uuidv4 } from '../utils/setup_utils';
import { removeFile } from '../utils/file_utils';
import { pathUtils } from '../utils/path_utils';
import { uploadFileTos3_ } from '../utils/upload_utils';
import { CodeSyncLogger } from '../logger';
import { CODESYNC_STATES, CodeSyncState } from '../utils/state_utils';
import { NOTIFICATION } from '../constants';
import { trackRepoHandler } from '../handlers/commands_handler';


export class s3Uploader {
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
		locked_by: uuid
	
	*/

	CHUNK_SIZE = 100;
	settings: any;
	uuid: string;
	viaDaemon = false;
	config: any;
	tasks: any[] = [];
	repoPath = "";
	branch = "";
	filePath = "";
	syncingBranchKey = "";
	originalsRepoBranchPath = "";

	constructor(viaDaemon=false) {
		this.settings = generateSettings();
		this.config = readYML(this.settings.CONFIG_PATH);
		this.uuid = uuidv4();
		this.viaDaemon = viaDaemon;
	}

	saveURLs (repoPath: string, branch: string, filePathsAndURLs: any) {
		/*
			Once we receive the response of /v1/init from server, we save presigned URLs inside .s3_uploader/
		*/
		const data = {
			repo_path: repoPath, 
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
		this.filePath = filePath;
		if (!fs.existsSync(filePath)) return;
		const content = readYML(filePath);
		// if some other instance of s3Uploader is processing this file, skip it
		if (content.locked_by && content.locked_by !== this.uuid) return;
		this.repoPath = content.repo_path;
		this.branch = content.branch;
		// Get repoConfig for given repoID
		let repoConfig = this.config.repos[this.repoPath];
		repoConfig = repoConfig.is_disconnected ? null : repoConfig;
		// Remove file if repoConfig is not found
		if (!repoConfig) return removeFile(filePath, "s3Uploader.deleting-file");
		this.syncingBranchKey = `${CODESYNC_STATES.SYNCING_BRANCH}:${this.repoPath}:${this.branch}`;
		const pathUtils_ = new pathUtils(this.repoPath, content.branch);
        this.originalsRepoBranchPath = pathUtils_.getOriginalsRepoBranchPath();
		// Skip files which don't exist in .originals or don't have URL
		for (const fileRelPath of Object.keys(content.file_path_and_urls)) {
			const originalsFilePath = path.join(this.originalsRepoBranchPath, fileRelPath);
			if (!fs.existsSync(originalsFilePath)) continue;
			const presignedURL = content.file_path_and_urls[fileRelPath];
			if (!presignedURL) {
				removeFile(originalsFilePath, "s3Uploader.deleting-originals-file");
				continue;
			}
			this.tasks.push(async function (callback: any) {
				const json = <any> await uploadFileTos3_(originalsFilePath, presignedURL);
				callback(json.error, true);
			});
		}
		this.processTasks(0);
	}

	processTasks(startIndex: number) {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;
		if (startIndex > this.tasks.length-1) return this.postProcess();
		const tasksChunk = this.tasks.slice(startIndex, startIndex+this.CHUNK_SIZE);
		const endIndex = startIndex + this.CHUNK_SIZE;
		const upperLimit = this.tasks.length - 1 < endIndex ? this.tasks.length - 1 : endIndex;
		CodeSyncLogger.debug(`Uploading ${startIndex}->${upperLimit} of ${this.tasks.length} files to s3`);
		
		parallel(
			tasksChunk,
			function (err, results) {
				if (err) {
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore
					CodeSyncLogger.error("uploadRepoToS3 failed: ", err);
					CodeSyncState.set(that.syncingBranchKey, false);
					CodeSyncState.set(CODESYNC_STATES.IS_SYNCING_BRANCH, false);
					return;	
				}
				that.processTasks(endIndex);
			}
		);
	}

	postProcess() {
		// Hide Connect Repo
		vscode.commands.executeCommand('setContext', 'showConnectRepoView', false);
		CodeSyncState.set(this.syncingBranchKey, false);
		CodeSyncState.set(CODESYNC_STATES.IS_SYNCING_BRANCH, false);
		// delete .originals repo
		if (fs.existsSync(this.originalsRepoBranchPath)) fs.rmSync(this.originalsRepoBranchPath, { recursive: true });
		// Show success notification
		if (!this.viaDaemon) {
			vscode.window.showInformationMessage(NOTIFICATION.REPO_SYNCED, ...[
				NOTIFICATION.TRACK_IT
			]).then(selection => {
				if (!selection) { return; }
				if (selection === NOTIFICATION.TRACK_IT) return trackRepoHandler();
			});
		}
		CodeSyncLogger.debug(`Branch=${this.branch} successfully uploaded to s3`);
		return removeFile(this.filePath, "s3Uploader.deleting-file");
	}

	static run () {
		// 
	}
}