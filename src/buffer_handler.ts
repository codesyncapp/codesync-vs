import * as fs from 'fs';
import * as path from 'path';
import { client } from "websocket";
import * as getBranchName from 'current-git-branch';

import { putLogEvent } from './logger';
import { readYML } from './utils/common';
import { checkServerDown } from "./utils/api_utils";
import { handleFilesRename, isValidDiff, handleNewFileUpload, getDIffForDeletedFile, cleanUpDeleteDiff } from './utils/buffer_utils';
import { IFileToDiff, IRepoDiffs, IUserPlan } from './interface';
import { RESTART_DAEMON_AFTER, DIFFS_REPO, DIFF_FILES_PER_ITERATION, 
	CONFIG_PATH, WEBSOCKET_ENDPOINT, INVALID_TOKEN_MESSAGE, ORIGINALS_REPO, DEFAULT_BRANCH, USER_PATH} from "./constants";
import { syncRepo } from './init_handler';
import { initUtils } from './utils/init_utils';
import { askAndTriggerSignUp } from './utils/login_utils';


const recallDaemon = () => {
	console.log('recallDaemon');
	// Recall daemon after X seconds
	setTimeout(() => {
		detectBranchChange();
		handleBuffer();
	}, RESTART_DAEMON_AFTER);	
};

export const detectBranchChange = async (viaDaemon=true) => {
	// Read config.json
	const configJSON = readYML(CONFIG_PATH);
	const users = readYML(USER_PATH) || {};
	for (const repoPath of Object.keys(configJSON.repos)) {
		const configRepo = configJSON.repos[repoPath];
		const accessToken = users[configRepo.email].access_token;
        const userEmail = configRepo.email;
        if (!accessToken) {
			putLogEvent(`Access token not found for repo: ${repoPath}, ${userEmail}`, userEmail);
			continue;
		}
		if (!fs.existsSync(repoPath)) {
			// TODO: Handle out of sync repo
			continue;
		}
		const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
		const originalsRepoBranchPath = path.join(ORIGINALS_REPO, path.join(repoPath, branch));
		const originalsRepoExists = fs.existsSync(originalsRepoBranchPath);
		if (!(branch in configRepo.branches)) {
			if (originalsRepoExists) {
				// init has been called, now see if we can upload the repo/branch
				const itemPaths = initUtils.getSyncablePaths(repoPath, <IUserPlan>{}, true);
				await initUtils.uploadRepo(repoPath, branch, accessToken, itemPaths, false, true, viaDaemon, configRepo.email);
			} else {
				await syncRepo(repoPath, accessToken, viaDaemon, true);
			}
			continue;
		}

		const configFiles = configRepo['branches'][branch];
        // If all files IDs are None in config.yml, we need to sync the branch
		const shouldSyncBranch = Object.values(configFiles).every(element => element === null);
		if (shouldSyncBranch) {
			const itemPaths = initUtils.getSyncablePaths(repoPath, <IUserPlan>{}, true);
			await initUtils.uploadRepo(repoPath, branch, accessToken, itemPaths, false, true, viaDaemon, configRepo.email);
			continue;
		}
	}
};

export async function handleBuffer() {
	/***
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
				- Remove the sahdow file
				- Remove the diff file if data is successfully uploaded 
	***/
	try {
		let diffFiles = fs.readdirSync(DIFFS_REPO);
		// Pick only yml files
		diffFiles = diffFiles.filter(file => file.endsWith('.yml'));
		if (!diffFiles.length) { return recallDaemon(); }
	
		// Read config.json
		let configJSON = readYML(CONFIG_PATH);
		if (!configJSON) { return; }
		const users = readYML(USER_PATH) || {};

		diffFiles = diffFiles.slice(0, DIFF_FILES_PER_ITERATION);

		const isServerDown = await checkServerDown();
		if (isServerDown) { return recallDaemon(); }

		const repoDiffs: IRepoDiffs[] = [];
		for (const diffFile of diffFiles) {
			const filePath = `${DIFFS_REPO}/${diffFile}`;
			const diffData = readYML(filePath);
			if (!diffData) { return; }
			if (!isValidDiff(diffData)) { 
				putLogEvent(`Skipping invalid diff file: ${diffData}, file: ${diffFile}`);
				fs.unlinkSync(filePath);
				return;
			}
			if (!(diffData.repo_path in configJSON.repos)) {
				putLogEvent(`Repo ${diffData.repo_path} is in buffer.yml but not in config.yml`);
				return;
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
		
			// Iterate repoDiffs and send to server
			repoDiffs.forEach((repoDiff) => {
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
								putLogEvent(INVALID_TOKEN_MESSAGE);
								askAndTriggerSignUp();
								return; 
							}

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
									const json = await handleNewFileUpload(accessToken, diffData, relPath, configRepo.id, configJSON, fileToDiff.file_path);
									if (json.uploaded) {
										configJSON = json.config;
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
										synced for rename of ${repoDiff.path}/${relPath}`, configRepo.email);
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
									putLogEvent(`File ID not found for; ${relPath}`, configRepo.email);
									continue;
								}

								if (!fileId && isDeleted) {
									// It can be a directory delete
									putLogEvent(`is_deleted non-synced file found: ${diffData.repo_path}/${relPath}`, configRepo.email);
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

	recallDaemon();

}
