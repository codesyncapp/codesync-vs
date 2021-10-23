import fs from 'fs';
import path from 'path';
import vscode from "vscode";

import {isValidDiff} from '../utils';
import {putLogEvent} from '../../logger';
import {checkServerDown} from "../../utils/api_utils";
import {IFileToDiff, IRepoDiffs} from '../../interface';
import {
	CONNECTION_ERROR_MESSAGE,
	DIFF_FILES_PER_ITERATION,
	LOG_AFTER_X_TIMES,
	STATUS_BAR_MSGS
} from "../../constants";
import {recallDaemon} from "../codesyncd";
import {generateSettings} from "../../settings";
import {pathUtils} from "../../utils/path_utils";
import {WebSocketClient} from "../websocket/websocket_client";
import {isRepoActive, readYML, updateStatusBarItem} from '../../utils/common';

let errorCount = 0;

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
		- Check if server is up
			- Do not continue if server is down
		- If there are diffs founds
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
	statusBarItem: vscode.StatusBarItem
	settings: any;
	users: any;
	configJSON: any;

	constructor(statusBarItem: vscode.StatusBarItem) {
		this.statusBarItem = statusBarItem;
		this.settings = generateSettings();
		this.users = readYML(this.settings.USER_PATH) || {};
		this.configJSON = readYML(this.settings.CONFIG_PATH);
	}

	updateStatusBarItem = (text: string) => {
		updateStatusBarItem(this.statusBarItem, text);
	};

	getDiffFiles = () => {
		let diffFiles = fs.readdirSync(this.settings.DIFFS_REPO);
		diffFiles = diffFiles.slice(0, DIFF_FILES_PER_ITERATION);
		// Filter valid diff files
		diffFiles = diffFiles.filter((diffFile) => {
			const filePath = path.join(this.settings.DIFFS_REPO, diffFile);
			// Pick only yml files
			if (!diffFile.endsWith('.yml')) {
				fs.unlinkSync(filePath);
				return false;
			}
			const diffData = readYML(filePath);
			if (!diffData || !isValidDiff(diffData)) {
				putLogEvent(`Skipping invalid diff file: ${diffFile}`, "", 0, diffData);
				fs.unlinkSync(filePath);
				return false;
			}
			if (!(diffData.repo_path in this.configJSON.repos)) {
				putLogEvent(`Repo ${diffData.repo_path} is not in config.yml`);
				fs.unlinkSync(filePath);
				return false;
			}
			if (this.configJSON.repos[diffData.repo_path].is_disconnected) {
				putLogEvent(`Repo ${diffData.repo_path} is disconnected`);
				fs.unlinkSync(filePath);
				return false;
			}
			const configRepo = this.configJSON.repos[diffData.repo_path];

			if (!(diffData.branch in configRepo.branches)) {
				putLogEvent(`Branch: ${diffData.branch} is not synced for Repo ${diffData.repo_path}`,
					configRepo.email);
				return false;
			}
			return true;
		});

		return diffFiles;
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

	getStatusBarMsg = () => {
		const repoPath = pathUtils.getRootPath();
		let statusBarMsg = STATUS_BAR_MSGS.DEFAULT;
		if (repoPath) {
			if (!isRepoActive(this.configJSON, repoPath)) {
				statusBarMsg =  STATUS_BAR_MSGS.CONNECT_REPO;
			}
		} else {
			statusBarMsg = STATUS_BAR_MSGS.NO_REPO_OPEN;
		}
		return statusBarMsg;
	}

	handleRepoDiffs = (repoDiffs: IRepoDiffs[]) => {
		const statusBarItem = this.statusBarItem;
		// Iterate repoDiffs and send to server
		repoDiffs.forEach((repoDiff) => {
			// Making a new socket connection per repo
			const webSocketClient = new WebSocketClient(this.statusBarItem, repoDiff);
			webSocketClient.registerEvents();
		});
	}

	async run() {
		// If there is no config file
		if (!fs.existsSync(this.settings.CONFIG_PATH)) {
			this.updateStatusBarItem(STATUS_BAR_MSGS.CONNECT_REPO);
			return recallDaemon(this.statusBarItem);
		}

		try {
			const isServerDown = await checkServerDown();
			if (isServerDown) {
				if (errorCount == 0 || errorCount > LOG_AFTER_X_TIMES) {
					putLogEvent(CONNECTION_ERROR_MESSAGE);
				}
				if (errorCount > LOG_AFTER_X_TIMES) {
					errorCount = 0;
				}
				errorCount += 1;
				this.updateStatusBarItem(STATUS_BAR_MSGS.SERVER_DOWN);
				return recallDaemon(this.statusBarItem);
			}

			errorCount = 0;

			const statusBarMsg = this.getStatusBarMsg();
			this.updateStatusBarItem(statusBarMsg);

			const diffFiles = this.getDiffFiles();

			if (!diffFiles.length) return recallDaemon(this.statusBarItem);

			const repoDiffs = this.groupRepoDiffs(diffFiles);

			// Handle repo diffs
			this.handleRepoDiffs(repoDiffs);

		} catch (e) {
			putLogEvent(`Daemon failed: ${e}`);
		}

		recallDaemon(this.statusBarItem);
	}
}
