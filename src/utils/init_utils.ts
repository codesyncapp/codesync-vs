import * as fs from 'fs';
import * as path from 'path';
import * as walk from 'walk';
import * as yaml from 'js-yaml';
import * as vscode from 'vscode';
import ignore from 'ignore';
import fetch from "node-fetch";
import * as parallel from "run-parallel";
import * as getBranchName from 'current-git-branch';
import { isBinaryFileSync } from 'isbinaryfile';

import {
	API_INIT,
	CONFIG_PATH,
	DEFAULT_BRANCH,
	IGNOREABLE_REPOS,
	NOTIFICATION,
	ORIGINALS_REPO,
	SEQUENCE_TOKEN_PATH,
	SYNCIGNORE,
	USER_PATH,
	WEB_APP_URL
} from '../constants';
import { IFileToUpload, IUserPlan } from '../interface';
import {isRepoActive, readFile, readYML} from './common';
import { checkServerDown } from './api_utils';
import { putLogEvent } from '../logger';
import { uploadFileTos3 } from './upload_file';
import { trackRepoHandler, unSyncHandler } from '../commands_handler';

export class initUtils {

	static isValidRepoSize (syncSize: number, userPlan: IUserPlan)  {
		const isValid = userPlan.SIZE >= syncSize;
		if (!isValid) {
			vscode.window.showErrorMessage(`${NOTIFICATION.REPOS_LIMIT_BREACHED} ${userPlan.SIZE}`);
		}
		return isValid;
	}

	static isValidFilesCount (filesCount: number, userPlan: IUserPlan) {
		const isValid = userPlan.FILE_COUNT >= filesCount;
		if (!isValid) {
			vscode.window.showErrorMessage(`${NOTIFICATION.FILES_LIMIT_BREACHED}\n
			You can add only ${userPlan.FILE_COUNT} files (Trying to add ${filesCount} files)`);
		}
		return isValid;
	}

	static successfullySynced (repoPath: string) {
		const config = readYML(CONFIG_PATH);
		const configRepo = config['repos'][repoPath];
		const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
		// If branch is not synced, daemon will take care of that
		if (!(branch in configRepo.branches)) { return true; }
		const configFiles = configRepo.branches[branch];
		const invalidFiles = [];
		Object.keys(configFiles).forEach((relPath) => {
			if (configFiles[relPath] === null) {
				invalidFiles.push(relPath);
			}
		});
		const hasValidFiles = invalidFiles.length === 0;
		return hasValidFiles;
	}

	static getSyncablePaths (repoPath: string, userPlan: IUserPlan, isSyncingBranch=false,
							isPopulatingBuffer = false) {
		const syncignorePath = path.join(repoPath, SYNCIGNORE);
		const syncignoreExists = fs.existsSync(syncignorePath);
		const itemPaths: IFileToUpload[] = [];

		if (!syncignoreExists) {
			return itemPaths;
		}

		let syncSize = 0;
		let syncignoreData = "";

		syncignoreData = readFile(syncignorePath);
		const syncignoreItems = syncignoreData.split("\n");

		IGNOREABLE_REPOS.forEach((repo) => {
			syncignoreItems.push(repo);
		});

		const ig = ignore().add(syncignoreItems);

		const options = {
			listeners: {
				file: function (root: string, fileStats: any, next: any) {
					const filePath = `${root}/${fileStats.name}`;
					const relPath = filePath.split(`${repoPath}/`)[1];
					const shouldIgnore = ig.ignores(relPath);
					if (!shouldIgnore) {
						itemPaths.push({
							file_path: filePath,
							rel_path: relPath,
							is_binary: isBinaryFileSync(filePath),
							size: fileStats.size,
							created_at: fileStats.ctime,
							modified_at: fileStats.mtime
						});
						syncSize += fileStats.size;
					}

					if (!isPopulatingBuffer && !isSyncingBranch &&
						!initUtils.isValidRepoSize(syncSize, userPlan) &&
						!initUtils.isValidFilesCount(itemPaths.length, userPlan)) {
						return [];
					}
					next();
				}
			}
		};
		walk.walkSync(repoPath, options);
		return itemPaths;
	}

	static copyFilesTo (repoPath: string, filePaths: string[], destination: string) {
		filePaths.forEach((filePath) => {
			const relPath = filePath.split(`${repoPath}/`)[1];
			const destinationPath = path.join(destination, relPath);
			const directories = path.dirname(destinationPath);
			if (!fs.existsSync(directories)) {
				fs.mkdirSync(directories, { recursive: true });
			}
			// File destination will be created or overwritten by default.
			fs.copyFileSync(filePath, destinationPath);
		});
	}

	static uploadRepoToServer = async (token: string, data: any) => {
		let error = '';
		const response = await fetch(API_INIT, {
				method: 'post',
				body: JSON.stringify(data),
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Basic ${token}`
				},
			}
		)
		.then(res => res.json())
		.then(json => json)
		.catch(err => error = err);

		return {
			response,
			error
		};
	};

	static saveIamUser (user: any) {
		// save iam credentials if not saved already
		const iamUser = {
			access_key: user.iam_access_key,
			secret_key: user.iam_secret_key,
		};

		if (!fs.existsSync(USER_PATH)) {
			const users = <any>{};
			users[user.email] = iamUser;
			fs.writeFileSync(USER_PATH, yaml.safeDump(iamUser));
		} else {
			const users = readYML(USER_PATH) || {};
			if (!(user.email in users)) {
				users[user.email] = iamUser;
				fs.writeFileSync(USER_PATH, yaml.safeDump(users));
			}
		}
	}

	static saveSequenceTokenFile (email: string) {
		// Save email for sequence_token
		if (!fs.existsSync(SEQUENCE_TOKEN_PATH)) {
			const users = <any>{};
			users[email] = "";
			fs.writeFileSync(SEQUENCE_TOKEN_PATH, yaml.safeDump(users));
		} else {
			const users = readYML(SEQUENCE_TOKEN_PATH) || {};
			if (!(email in users)) {
				users[email] = "";
				fs.writeFileSync(SEQUENCE_TOKEN_PATH, yaml.safeDump(users));
			}
		}
	}

	static saveFileIds(repoPath: string, branch: string, token: string, userEmail: string, uploadResponse: any) {
		// Save file IDs, repoId and email against repo path
		const repoId = uploadResponse.repo_id;
		const filePathAndId = uploadResponse.file_path_and_id;
		// Write file IDs
		const configJSON = readYML(CONFIG_PATH);
		const configRepo = configJSON.repos[repoPath];
		configRepo.branches[branch] = filePathAndId;
		configRepo.id = repoId;
		configRepo.email = userEmail;
		fs.writeFileSync(CONFIG_PATH, yaml.safeDump(configJSON));
	}

	static async uploadRepoToS3(repoPath: string, branch: string, token: string, uploadResponse: any,
								userEmail: string, isSyncingBranch=false, viaDaemon=false) {

		const repoId = uploadResponse.repo_id;
		const s3Urls =  uploadResponse.urls;
		const tasks: any[] = [];
		const originalsRepoBranchPath = path.join(ORIGINALS_REPO, path.join(repoPath, branch));

		Object.keys(s3Urls).forEach(relPath => {
			const presignedUrl = s3Urls[relPath];
			const absPath = path.join(originalsRepoBranchPath, relPath);
			if (presignedUrl) {
				tasks.push(async function (callback: any) {
					await uploadFileTos3(absPath, presignedUrl);
					callback(null, true);
				});
			}
		});

		parallel(
			tasks,
			// optional callback
			function (err, results) {
				// the results array will equal ['one','two'] even though
				// the second function had a shorter timeout.
				if (err) return;
				const repoData = <any>{
					id: repoId,
					email: userEmail,
					token
				};
				const configJSON = readYML(CONFIG_PATH);
				Object.keys(repoData).forEach((key) => {
					configJSON.repos[repoPath][key] = repoData[key];
				});

				// delete .originals repo
				fs.rmdirSync(originalsRepoBranchPath, { recursive: true });

				// Show success notification
				if (!viaDaemon) {
					const successMsg = isSyncingBranch ? NOTIFICATION.BRANCH_SYNCED : NOTIFICATION.REPO_SYNCED;
					vscode.window.showInformationMessage(successMsg, ...[
						NOTIFICATION.TRACK_IT,
						NOTIFICATION.UNSYNC_REPO,
					]).then(selection => {
						if (!selection) { return; }
						if (selection === NOTIFICATION.TRACK_IT) {
							trackRepoHandler();
						}
						if (selection === NOTIFICATION.UNSYNC_REPO) {
							unSyncHandler();
						}
					});
				}
		});
	}

	static async uploadRepo(repoPath: string, branch: string, token: string, itemPaths: IFileToUpload[],
							isPublic=false, isSyncingBranch=false, viaDaemon=false,
							userEmail?: string) {
		const splitPath = repoPath.split('/');
		const repoName = splitPath[splitPath.length-1];

		const configJSON = readYML(CONFIG_PATH);
		const repoInConfig = isRepoActive(configJSON, repoPath);
		const branchFiles = <any>{};
		const filesData = <any>{};

		itemPaths.forEach((fileToUpload) => {
			branchFiles[fileToUpload.rel_path] = null;
			filesData[fileToUpload.rel_path] = {
				is_binary: fileToUpload.is_binary,
				size: fileToUpload.size,
				created_at: new Date(fileToUpload.created_at).getTime() / 1000
			};
		});

		if (!repoInConfig) {
			configJSON.repos[repoPath] = {'branches': {}};
			configJSON.repos[repoPath].branches[branch] = branchFiles;
			fs.writeFileSync(CONFIG_PATH, yaml.safeDump(configJSON));
		} else if (!(branch in configJSON.repos[repoPath].branches)) {
			configJSON.repos[repoPath].branches[branch] = branchFiles;
			fs.writeFileSync(CONFIG_PATH, yaml.safeDump(configJSON));
		}

		const isServerDown = await checkServerDown(userEmail);
		if (isServerDown) { return; }

		console.log(`Uploading new branch: ${branch} for repo: ${repoPath}`);

		const data = {
			name: repoName,
			is_public: isPublic,
			branch,
			files_data: JSON.stringify(filesData)
		};

		const json = await initUtils.uploadRepoToServer(token, data);
		if (json.error || json.response.error) {
			const error = isSyncingBranch ? NOTIFICATION.ERROR_SYNCING_BRANCH : NOTIFICATION.ERROR_SYNCING_REPO;
			putLogEvent(`${error}. Reason: ${json.error || json.response.error}`);
			if (!viaDaemon) {
				vscode.window.showErrorMessage(NOTIFICATION.SYNC_FAILED);
			}
			return;
		}
		/*
			Response from server looks like
				{
					'repo_id': repo_id,
					'branch_id': branch_id,
					'file_path_and_ids': {file_path_and_id},
					'urls': {presigned_urls_for_files},
					'user': {
						'email': emali,
						'iam_access_key': <key>,
						'iam_secret_key': <key>
					}
				}
		*/

		const user = json.response.user;

		// Save IAM credentials
		initUtils.saveIamUser(user);

		// Save email for sequence_token
		initUtils.saveSequenceTokenFile(user.email);

		// Save file paths and IDs
		initUtils.saveFileIds(repoPath, branch, token, user.email, json.response);
		// Upload to s3
		await initUtils.uploadRepoToS3(repoPath, branch, token, json.response, user.email, isSyncingBranch, viaDaemon);
	}
}
