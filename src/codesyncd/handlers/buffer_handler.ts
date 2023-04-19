import fs from 'fs';
import path from 'path';
import vscode from "vscode";

import {isValidDiff} from '../utils';
import {CodeSyncLogger} from '../../logger';
import {IFileToDiff, IRepoDiffs} from '../../interface';
import {DAY, DIFF_FILES_PER_ITERATION, DIFF_SIZE_LIMIT} from "../../constants";
import {recallDaemon} from "../codesyncd";
import {generateSettings} from "../../settings";
import {getActiveUsers, readYML} from '../../utils/common';
import {SocketClient} from "../websocket/socket_client";
import { getPlanLimitReached } from '../../utils/pricing_utils';



export class bufferHandler {
	/*
	 * Each file in .diffs directory contains data something like

        repo_path: /Users/basit/projects/codesync/codesync
        branch: plugins
        path: codesync/init.py
        diff: |
         @@ -14070,8 +14070,10 @@
             pass%0A
         +#
        created_at: '2021-01-01 11:49:36.121'

	Steps:
		- Get list of diffs (only .yml files)
		- If there are diffs founds
		- Check if server is up
			- Do not continue if server is down
		- Validate structure of JSON in diff file
			- Skip invalid diff files
		- Group diffs by repo path to send multiple in 1 iteration
		- For each diff group
			- Authenticate from server for repo token
				- Do not continue if token is invalid
		- For each diff in diffs-group
			- Check if file_relative_path in diff file is syncable,
				- Skip the diff-file if it is for non-syncable file
			- If diff is for changes for existing file
				- Push changes to server
			- If diff is for new file
				- Upload file to server & then on s3
				- Updated config.yml with new file ID
			- If diff is for rename file
				- Push rename-diff to server
			- If diff is for directory rename
				- Repeat file rename for every nested item
			- If diff is for is_deleted
				- Get the diff with shadow file
				- Remove the shadow file
			- Remove the diff file if data is successfully uploaded
	*/
	statusBarItem: vscode.StatusBarItem;
	settings: any;
	configJSON: any;

	constructor(statusBarItem: vscode.StatusBarItem) {
		this.statusBarItem = statusBarItem;
		this.settings = generateSettings();
		this.configJSON = readYML(this.settings.CONFIG_PATH);
	}
	getRandomIndex = (length: number) => Math.floor( Math.random() * length );

	getDiffFiles = () => {
		const diffsDir = fs.readdirSync(this.settings.DIFFS_REPO);
		let randomDiffFiles = [];
		const usedIndices = <any>[];
		let randomIndex = undefined;
		for (let index = 0; index < Math.min(DIFF_FILES_PER_ITERATION, diffsDir.length); index++) {
			do {
				randomIndex = this.getRandomIndex( diffsDir.length );
			}
			while ( usedIndices.includes( randomIndex ) );
			usedIndices.push(randomIndex);
			randomDiffFiles.push(diffsDir[randomIndex]);
		}
		let diffsSize = 0;
		// Filter valid diff files
		randomDiffFiles = randomDiffFiles.filter((diffFile) => {
			const filePath = path.join(this.settings.DIFFS_REPO, diffFile);
			// Websocket can only accept data upto 16MB, for above than that, we are reducing number of diffs per iteration to remain under limit.
			if (diffsSize > DIFF_SIZE_LIMIT) return false;
			// Pick only yml files
			if (!diffFile.endsWith('.yml')) {
				fs.unlinkSync(filePath);
				return false;
			}
			const diffData = readYML(filePath);
			if (!diffData || !isValidDiff(diffData)) {
				CodeSyncLogger.info(`Removing diff: Skipping invalid diff: ${diffFile}`, "", diffData);
				fs.unlinkSync(filePath);
				return false;
			}
			
			const diffSize = diffData.diff.length;
			diffsSize += diffSize;

			if (!(diffData.repo_path in this.configJSON.repos)) {
				CodeSyncLogger.error(`Removing diff: Repo ${diffData.repo_path} is not in config.yml`);
				fs.unlinkSync(filePath);
				return false;
			}
			if (this.configJSON.repos[diffData.repo_path].is_disconnected) {
				CodeSyncLogger.error(`Removing diff: Repo ${diffData.repo_path} is disconnected`);
				fs.unlinkSync(filePath);
				return false;
			}
			const configRepo = this.configJSON.repos[diffData.repo_path];

			if (!(diffData.branch in configRepo.branches)) {
				// TODO: Look into syncing offline branch
				fs.lstatSync(filePath);
				// Removing diffs of non-synced branch if diff was created 5 days ago and plan limit is not reached
				// We want to keep data in case plan limit is reached so that user can access it when plan is upgraded
				const fileInfo = fs.lstatSync(filePath);
				if (new Date().getTime() - fileInfo.ctimeMs > (DAY * 5)) {
					const { planLimitReached } = getPlanLimitReached();
					if (planLimitReached) {
						CodeSyncLogger.error(
							`Keeping diff: Branch=${diffData.branch} is not synced. Repo=${diffData.repo_path}`,
							"", 
							configRepo.email
						);
					} else {
						CodeSyncLogger.error(
							`Removing diff: Branch=${diffData.branch} is not synced. Repo=${diffData.repo_path}`,
							"", 
							configRepo.email
						);	
						fs.unlinkSync(filePath);
					}
				}
				return false;
			}
			return true;
		});

		if (diffsSize > DIFF_SIZE_LIMIT) {
			CodeSyncLogger.error("Diffs size increasing limit");
		} 
		return randomDiffFiles;
	}

	groupRepoDiffs = (diffFiles: string[]) => {
		const repoDiffs: IRepoDiffs[] = [];
		for (const diffFile of diffFiles) {
			const filePath = path.join(this.settings.DIFFS_REPO, diffFile);
			const diffData = readYML(filePath);
			const fileToDiff = <IFileToDiff>{};
			fileToDiff.file_path = filePath;
			fileToDiff.diff = diffData;
			// Group diffs by repo_path
			const index = repoDiffs.findIndex((repoDiff) => repoDiff.repoPath === diffData.repo_path);
			if (index > -1) {
				repoDiffs[index].file_to_diff.push(fileToDiff);
			} else {
				const newRepoDiff = <IRepoDiffs>{};
				newRepoDiff.repoPath = diffData.repo_path;
				newRepoDiff.file_to_diff = [fileToDiff];
				repoDiffs.push(newRepoDiff);
			}
		}
		return repoDiffs;
	};

	async run(canSendDiffs: boolean) {
		try {
			const diffFiles = this.getDiffFiles();
			if (!diffFiles.length) return recallDaemon(this.statusBarItem);
			const repoDiffs = this.groupRepoDiffs(diffFiles);
			// Check if we have an active user
			const activeUser = getActiveUsers()[0];
			if (!activeUser) return recallDaemon(this.statusBarItem);
			// Create Websocket client
			const webSocketClient = new SocketClient(this.statusBarItem, activeUser.access_token, repoDiffs);
			webSocketClient.connect(canSendDiffs);
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			CodeSyncLogger.critical("Daemon failed to run", e.stack);
			// recall daemon
			return recallDaemon(this.statusBarItem);
		}
	}
}
