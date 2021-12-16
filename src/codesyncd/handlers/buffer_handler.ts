import fs from 'fs';
import path from 'path';
import vscode from "vscode";

import {isValidDiff} from '../utils';
import {putLogEvent} from '../../logger';
import {IFileToDiff, IRepoDiffs} from '../../interface';
import {DIFF_FILES_PER_ITERATION, STATUS_BAR_MSGS} from "../../constants";
import {recallDaemon} from "../codesyncd";
import {generateSettings} from "../../settings";
import {pathUtils} from "../../utils/path_utils";
import {getActiveUsers, isRepoActive, readYML, updateStatusBarItem} from '../../utils/common';
import {SocketClient} from "../websocket/socket_client";


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
				putLogEvent(`Skipping invalid diff file: ${diffFile}`, "", diffData);
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
		if (!fs.existsSync(this.settings.CONFIG_PATH)) return STATUS_BAR_MSGS.NO_CONFIG;
		const repoPath = pathUtils.getRootPath();
		const activeUsers = getActiveUsers();
		// No Valid account found
		if (!activeUsers.length) return STATUS_BAR_MSGS.AUTHENTICATION_FAILED;
		// No repo is opened
		if (!repoPath) return STATUS_BAR_MSGS.NO_REPO_OPEN;
		// Repo is not synced
		if (!isRepoActive(this.configJSON, repoPath)) return STATUS_BAR_MSGS.CONNECT_REPO;
		return STATUS_BAR_MSGS.DEFAULT;
	}

	async run() {
		try {
			const statusBarMsg = this.getStatusBarMsg();
			this.updateStatusBarItem(statusBarMsg);
			// Do not proceed if no active user is found OR no config is found
			if ([STATUS_BAR_MSGS.AUTHENTICATION_FAILED, STATUS_BAR_MSGS.NO_CONFIG].includes(statusBarMsg)) {
				return recallDaemon(this.statusBarItem);
			}
			const diffFiles = this.getDiffFiles();
			if (!diffFiles.length) return recallDaemon(this.statusBarItem);

			const repoDiffs = this.groupRepoDiffs(diffFiles);

			const activeUser = getActiveUsers()[0];
			const webSocketClient = new SocketClient(this.statusBarItem, activeUser.access_token, repoDiffs);
			webSocketClient.connect();
		} catch (e) {
			putLogEvent(`Daemon failed: ${e}`);
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			console.log(e.stack);
		}
	}
}
