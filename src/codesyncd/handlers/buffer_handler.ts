import fs from 'fs';
import path from 'path';
import vscode from "vscode";
import { glob } from 'glob';

import {getDiffsBeingProcessed, isValidDiff} from '../utils';
import {CodeSyncLogger} from '../../logger';
import {IFileToDiff, IRepoDiffs} from '../../interface';
import {DAY, DIFF_FILES_PER_ITERATION, RETRY_WEBSOCKET_CONNECTION_AFTER} from "../../constants";
import {generateSettings} from "../../settings";
import {getActiveUsers, getDefaultIgnorePatterns, readYML, shouldIgnorePath} from '../../utils/common';
import {SocketClient} from "../websocket/socket_client";
import { getPlanLimitReached } from '../../utils/pricing_utils';
import { removeFile } from '../../utils/file_utils';
import { CODESYNC_STATES, CodeSyncState } from '../../utils/state_utils';



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
	defaultIgnorePatterns: string[];
	instanceUUID: string;
	// Log run msg after 2 minutes
	LOG_BUFFER_HANDLER_RUN_AFTER = 2 * 60 * 1000;

	constructor(statusBarItem: vscode.StatusBarItem) {
		this.statusBarItem = statusBarItem;
		this.settings = generateSettings();
		this.configJSON = readYML(this.settings.CONFIG_PATH);
        this.defaultIgnorePatterns = getDefaultIgnorePatterns();
		this.instanceUUID = CodeSyncState.get(CODESYNC_STATES.INSTANCE_UUID);
	}

	getRandomIndex = (length: number) => Math.floor( Math.random() * length );

	getDiffFiles = async () => {
		const diffsBeingProcessed = getDiffsBeingProcessed();

        const invalidDiffFiles = await glob("**", { 
			ignore: "*.yml",
			nodir: true,
			dot: true,
            cwd: this.settings.DIFFS_REPO
        });
		
		// Clean invalid diff Files
		invalidDiffFiles.forEach(invalidDiffFile => {
			const filePath = path.join(this.settings.DIFFS_REPO, invalidDiffFile);
			removeFile(filePath, "cleaningInvalidDiffFiles");
		});

        const diffs = await glob("*.yml", { 
            cwd: this.settings.DIFFS_REPO,
			maxDepth: 1,
			nodir: true,
			dot: true,
		});

		let randomDiffFiles = [];
		const usedIndices = <any>[];
		let randomIndex = undefined;
		for (let index = 0; index < Math.min(DIFF_FILES_PER_ITERATION, diffs.length); index++) {
			do {
				randomIndex = this.getRandomIndex( diffs.length );
			}
			while ( usedIndices.includes( randomIndex ) );
			usedIndices.push(randomIndex);
			randomDiffFiles.push(diffs[randomIndex]);
		}
		// Filter valid diff files
		randomDiffFiles = randomDiffFiles.filter((diffFile) => {
			const filePath = path.join(this.settings.DIFFS_REPO, diffFile);
			const diffData = readYML(filePath);
			if (!diffData || !isValidDiff(diffData)) {
				CodeSyncLogger.info(`Removing diff: Skipping invalid diff: ${diffFile}`, "", diffData);
				removeFile(filePath, "getDiffFiles");
				return false;
			}

			if (!(diffData.repo_path in this.configJSON.repos)) {
				CodeSyncLogger.error(`Removing diff: Repo ${diffData.repo_path} is not in config.yml`);
				removeFile(filePath, "getDiffFiles");
				return false;
			}
			if (this.configJSON.repos[diffData.repo_path].is_disconnected) {
				CodeSyncLogger.error(`Removing diff: Repo ${diffData.repo_path} is disconnected`);
				removeFile(filePath, "getDiffFiles");
				return false;
			}
			// Skip diffs that are already being iterated
			if (diffsBeingProcessed.has(filePath)) return false;

			// If rel_path is ignoreable, only delete event should be allowed for that
			const isIgnorablePath = shouldIgnorePath(diffData.file_relative_path, this.defaultIgnorePatterns, []);
			if (isIgnorablePath && !diffData.is_deleted) {
				CodeSyncLogger.debug(`Removing diff with ignoreable path=${diffData.file_relative_path}, is_new_file=${diffData.is_new_file}`);
				removeFile(filePath, "getDiffFiles");
				return false;
			}
			
			const configRepo = this.configJSON.repos[diffData.repo_path];

			if (!(diffData.branch in configRepo.branches)) {
				// TODO: Look into syncing offline branch
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
						removeFile(filePath, "getDiffFiles");
					}
				}
				return false;
			}
			return true;
		});

		return {
			files: randomDiffFiles,
			count: diffs.length
		};
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
		const isRunning = CodeSyncState.get(CODESYNC_STATES.BUFFER_HANDLER_RUNNING);
		const skipLog = CodeSyncState.canSkipRun(CODESYNC_STATES.BUFFER_HANDLER_LOGGED_AT, this.LOG_BUFFER_HANDLER_RUN_AFTER);
		if (!skipLog) {
			CodeSyncLogger.debug(`bufferHandler:run, uuid=${this.instanceUUID}`);
			CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_LOGGED_AT, new Date().getTime());
		}
		if (isRunning) return;
		
		const errorOccurredAt = CodeSyncState.get(CODESYNC_STATES.WEBSOCKET_ERROR_OCCURRED_AT);
		const canConnect = !errorOccurredAt || (new Date().getTime() - errorOccurredAt) > RETRY_WEBSOCKET_CONNECTION_AFTER;
		if (!canConnect) {
			return CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_RUNNING, false);
		}

		CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_RUNNING, true);
		
		try {
			const diffs = await this.getDiffFiles();
			if (!diffs.files.length) return CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_RUNNING, false);
			if (canSendDiffs) CodeSyncLogger.debug(`Processing ${diffs.files.length}/${diffs.count} diffs, uuid=${this.instanceUUID}`);
			const repoDiffs = this.groupRepoDiffs(diffs.files);
			// Check if we have an active user
			const activeUser = getActiveUsers()[0];
			if (!activeUser) return CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_RUNNING, false);
			// Create Websocket client
			const webSocketClient = new SocketClient(this.statusBarItem, activeUser.access_token, repoDiffs);
			webSocketClient.connect(canSendDiffs);
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			CodeSyncLogger.critical("bufferHandler exited", e.stack);
			// recall daemon
			return CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_RUNNING, false);
		}
	}
}
