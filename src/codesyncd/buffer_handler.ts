import fs from 'fs';
import path from 'path';
import vscode from "vscode";
import {client} from "websocket";

import {putLogEvent} from '../logger';
import {isRepoActive, readYML, updateStatusBarItem} from '../utils/common';
import {checkServerDown} from "../utils/api_utils";
import {
    cleanUpDeleteDiff,
    getDIffForDeletedFile,
    handleFilesRename,
    handleNewFileUpload,
    isValidDiff
} from './utils';
import {IFileToDiff, IRepoDiffs} from '../interface';
import {
	DIFF_FILES_PER_ITERATION,
	STATUS_BAR_MSGS,
	WEBSOCKET_ENDPOINT,
	DAY
} from "../constants";
import {recallDaemon} from "./codesyncd";
import {generateSettings} from "../settings";
import {initUtils} from "../init/utils";
import {pathUtils} from "../utils/path_utils";

const WAITING_FILES = <any>{};

export const handleBuffer = async (statusBarItem: vscode.StatusBarItem) => {
	/*
	 * Each file in .diffs directory contains following data

        repo_path: /Users/basit/projects/codesync/codesync
        branch: plugins
        file: codesync/init.py
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
				- Remove the diff file if data is successfully uploaded
			- If diff is for new file
				- Upload file to server & then on s3
				- Updated config.yml with new file ID
				- Remove the diff file if data is successfully uploaded
			- If diff is for rename file
				- rename file in shadow repo
				- rename file in config.yml
				- Push rename-diff to server
				- Remove the diff file if data is successfully uploaded
			- If diff is for directory rename
				- Repeat file rename for every nested item
			- If diff is for is_deleted
				- Get the diff with shadow file
				- Remove the shadow file
				- Remove the diff file if data is successfully uploaded
	*/
	try {
		const settings = generateSettings();

		// Read config.json
		let configJSON = readYML(settings.CONFIG_PATH);
		if (!configJSON) {
			updateStatusBarItem(statusBarItem, STATUS_BAR_MSGS.CONNECT_REPO);
			return recallDaemon(statusBarItem);
		}
		const repoPath = pathUtils.getRootPath();
		if (!repoPath) {
			updateStatusBarItem(statusBarItem, STATUS_BAR_MSGS.NO_REPO_OPEN);
			return recallDaemon(statusBarItem);
		}
		// Update status bar msg
		const msg =  isRepoActive(configJSON, repoPath) ? STATUS_BAR_MSGS.DEFAULT : STATUS_BAR_MSGS.CONNECT_REPO;
		updateStatusBarItem(statusBarItem, msg);
		let diffFiles = fs.readdirSync(settings.DIFFS_REPO);
		// Pick only yml files
		diffFiles = diffFiles.filter(file => file.endsWith('.yml'));
		if (!diffFiles.length) {
			return recallDaemon(statusBarItem);
		}

		const isServerDown = await checkServerDown();
		if (isServerDown) {
			updateStatusBarItem(statusBarItem, STATUS_BAR_MSGS.SERVER_DOWN);
			return recallDaemon(statusBarItem);
		}

		diffFiles = diffFiles.slice(0, DIFF_FILES_PER_ITERATION);

		const users = readYML(settings.USER_PATH) || {};

		const repoDiffs: IRepoDiffs[] = [];
		for (const diffFile of diffFiles) {
			const filePath = path.join(settings.DIFFS_REPO, diffFile);
			const diffData = readYML(filePath);
			if (!diffData) { continue; }
			if (!isValidDiff(diffData)) {
				putLogEvent(`Skipping invalid diff file: ${diffData}, file: ${diffFile}`);
				fs.unlinkSync(filePath);
				continue;
			}
			if (!(diffData.repo_path in configJSON.repos)) {
				putLogEvent(`Repo ${diffData.repo_path} is in buffer.yml but not in config.yml`);
				continue;
			}
			if (configJSON.repos[diffData.repo_path].is_disconnected) {
				putLogEvent(`Repo ${diffData.repo_path} is disconnected`);
				continue;
			}
			const configRepo = configJSON.repos[diffData.repo_path];

			if (!(diffData.branch in configRepo.branches)) {
				putLogEvent(`Branch: ${diffData.branch} is not synced for Repo ${diffData.repo_path}`, configRepo.email);
			}

			// Group diffs by repo_path
			const fileToDiff = <IFileToDiff>{};
			fileToDiff.file_path = filePath;
			fileToDiff.diff = diffData;

			const index = repoDiffs.findIndex((repoDiff) => repoDiff.path === diffData.repo_path);
			if (index > -1) {
				repoDiffs[index].file_to_diff.push(fileToDiff);
			} else {
				const newRepoDiff = <IRepoDiffs>{};
				newRepoDiff.path = diffData.repo_path;
				newRepoDiff.file_to_diff = [fileToDiff];
				repoDiffs.push(newRepoDiff);
			}
		}

		// Iterate repoDiffs and send to server
		repoDiffs.forEach((repoDiff) => {
			// Making a new socket connection per repo
			const WebSocketClient = new client();
			WebSocketClient.connect(WEBSOCKET_ENDPOINT);

			WebSocketClient.on('connectFailed', function(error) {
				putLogEvent('Socket Connect Error: ' + error.toString());
			});

			WebSocketClient.on('connect', function(connection) {
				connection.on('error', function(error) {
					putLogEvent("Socket Connection Error: " + error.toString());
				});
				connection.on('close', function() {
					putLogEvent('echo-protocol Connection Closed');
				});

				const newFiles: string[] = [];
				const configRepo = configJSON.repos[repoDiff.path];
				const accessToken = users[configRepo.email].access_token;
				// authenticate via websocket
				connection.send(accessToken);
				connection.on('message', async function(message) {
					if (message.type === 'utf8') {
						const resp = JSON.parse(message.utf8Data || "{}");
						if (resp.type === 'auth') {
							if (resp.status !== 200) {
								putLogEvent(STATUS_BAR_MSGS.ERROR_SENDING_DIFF);
								updateStatusBarItem(statusBarItem, STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
								return;
							}

							updateStatusBarItem(statusBarItem, STATUS_BAR_MSGS.SYNCING);

							for (const fileToDiff of repoDiff.file_to_diff) {
								const diffData = fileToDiff.diff;
								const configFiles = configRepo['branches'][diffData.branch];
								const relPath = diffData.file_relative_path;
								const isBinary = diffData.is_binary;
								const isDeleted = diffData.is_deleted;

								if (diffData.is_new_file) {
									if (!newFiles.includes(relPath)) {
										newFiles.push(relPath);
									}
									const json = await handleNewFileUpload(accessToken, diffData.repo_path,
										diffData.branch, diffData.created_at, relPath, configRepo.id, configJSON);
									if (json.uploaded) {
										configJSON = json.config;
									}
									if (fs.existsSync(fileToDiff.file_path)) {
										fs.unlinkSync(fileToDiff.file_path);
									}
									continue;
								}

								// Skip the changes diffs if relevant file was uploaded in the same iteration, wait for next iteration
								if (newFiles.includes(relPath)) { continue; }

								if (diffData.is_rename) {
									const oldRelPath = JSON.parse(diffData.diff).old_rel_path;
									// If old_rel_path uploaded in the same iteration, wait for next iteration
									if (newFiles.includes(oldRelPath)) { continue; }
									// Remove old file ID from config
									const oldFileId = configFiles[oldRelPath];
									delete configFiles[oldRelPath];

									if  (!oldFileId) {
										putLogEvent(`old_file: ${oldRelPath} was not 
										synced for rename of ${path.join(repoDiff.path, relPath)}`, configRepo.email);
										fs.unlinkSync(fileToDiff.file_path);
										continue;
									}
									handleFilesRename(configJSON, diffData.repo_path, diffData.branch,
										relPath, oldFileId, oldRelPath);
								}

								if (!isBinary && !isDeleted && !diffData.diff) {
									putLogEvent(`Empty diff found in file: ${fileToDiff.file_path}`, configRepo.email);
									fs.unlinkSync(fileToDiff.file_path);
									continue;
								}

								const fileId = configFiles[relPath];

								if (!fileId && !isDeleted && !diffData.is_rename) {
									if (relPath in WAITING_FILES) {
										const now = (new Date()).getTime() / 1000;
										if ((now - WAITING_FILES[relPath]) > DAY) {
											putLogEvent(`File ID not found for: ${relPath}`, configRepo.email);
											delete WAITING_FILES[relPath];
											fs.unlinkSync(fileToDiff.file_path);
										}
									} else {
										WAITING_FILES[relPath] = (new Date()).getTime() / 1000;
										console.log(`Uploading the file ${relPath} first`);
										const pathUtilsObj = new pathUtils(diffData.repo_path, diffData.branch);
										const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
										const originalsFilePath = path.join(originalsRepoBranchPath, relPath);
										if (!fs.existsSync(originalsFilePath)) {
											const initUtilsObj = new initUtils(diffData.repo_path);
											const filePath = path.join(diffData.repo_path, relPath);
											initUtilsObj.copyFilesTo([filePath], originalsRepoBranchPath);
										}
										if (newFiles.indexOf(relPath) > -1) {
											newFiles.push(relPath);
										}
										const json = await handleNewFileUpload(accessToken, diffData.repo_path,
											diffData.branch, diffData.created_at, relPath, configRepo.id, configJSON);
										if (json.uploaded) {
											configJSON = json.config;
                                            if (fs.existsSync(originalsFilePath)) {
                                                fs.unlinkSync(originalsFilePath);
                                            }
										}
									}
									continue;
								}

								if (!fileId && isDeleted) {
									// It can be a directory delete
									putLogEvent(`is_deleted non-synced file found: ${path.join(diffData.repo_path, relPath)}`,
										configRepo.email);
									cleanUpDeleteDiff(diffData.repo_path, diffData.branch, relPath, configJSON);
									fs.unlinkSync(fileToDiff.file_path);
									continue;
								}

								if (isDeleted) {
									diffData.diff =  getDIffForDeletedFile(diffData.repo_path, diffData.branch, relPath, configJSON);
								}

								// Diff data to be sent to server
								const diffToSend = {
									'file_id': fileId,
									'diff': diffData.diff,
									'is_deleted': isDeleted,
									'is_rename': diffData.is_rename,
									'is_binary': isBinary,
									'created_at': diffData.created_at,
									'path': relPath,
									'diff_file_path': fileToDiff.file_path
								};
								connection.send(JSON.stringify({'diffs': [diffToSend]}));
							}
						}
						if (resp.type === 'sync') {
							if (resp.status === 200 && fs.existsSync(resp.diff_file_path)) {
								fs.unlinkSync(resp.diff_file_path);
							}
						}
					}
				});
			});
		});
	} catch (e) {
		putLogEvent(`"Daemon failed": ${e}`);
	}

	recallDaemon(statusBarItem);
};
