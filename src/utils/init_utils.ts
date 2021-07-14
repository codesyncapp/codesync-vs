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

import { API_INIT, CONFIG_PATH, DEFAULT_BRANCH, ERROR_SYNCING_REPO, IGNOREABLE_REPOS, NOTIFICATION, ORIGINALS_REPO, 
	SEQUENCE_TOKEN_PATH, 
	SYNCIGNORE, 
	USER_PATH} from '../constants';
import { IFileToUpload } from '../interface';
import { readFile, readYML } from './common';
import { checkServerDown } from './api_utils';
import { putLogEvent } from '../logger';
import { uploadFileTos3 } from './upload_file';

export class initUtils {

	static isValidRepoSize (syncSize: number, userPlan: any)  {
		const isValid = userPlan.SIZE >= syncSize;
		if (!isValid) {
			vscode.window.showErrorMessage(`${NOTIFICATION.REPOS_LIMIT_BREACHED} ${userPlan.SIZE}`);
		}
		return isValid;	
	}
	
	static isValidFilesCount (filesCount: number, userPlan: any) {
		const isValid = userPlan.FILE_COUNT >= filesCount;
		if (!isValid) {
			vscode.window.showErrorMessage(`${NOTIFICATION.FILES_LIMIT_BREACHED}\n
			You can add only ${userPlan.FILE_COUNT} files (Trying to add ${filesCount} files)`);
		}
		return isValid;
	}

	static successfulySynced (repoPath: string) {
		const config = readYML(CONFIG_PATH);
		const configRepo = config['repos'][repoPath];
		const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
		const configFiles = configRepo.branches[branch];
		const invalidFiles = [];
		Object.keys(configFiles).forEach((relPath) => {
			if (configFiles[relPath] === null) {
				invalidFiles.push(relPath);
			}
		});
		return invalidFiles.length === 0;
	}

	static getSyncablePaths (repoPath: string, userPlan: any) {
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
							created_at: fileStats.ctime
						});
						syncSize += fileStats.size;
					}
					if (!(initUtils.isValidRepoSize(syncSize, userPlan) && initUtils.isValidFilesCount(itemPaths.length, userPlan))) {
						return [];
					}
					next();
				}
			}
		};
		walk.walkSync(repoPath, options);
		return itemPaths;
	}

	static copyFilesTo (repoPath: string, itemPaths: IFileToUpload[], destination: string) {
		itemPaths.forEach((fileToUpload) => {
			const relPath = fileToUpload.file_path.split(`${repoPath}/`)[1];
			const destinationPath = path.join(destination, relPath);
			const directories = path.dirname(destinationPath);
			if (!fs.existsSync(directories)) {
				fs.mkdirSync(directories, { recursive: true });
			}
			// File destination will be created or overwritten by default.
			fs.copyFileSync(fileToUpload.file_path, destinationPath);
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

	static async uploadRepoToS3(repoPath: string, branch: string, token: string, uploadResponse: any, userEmail: string,
		isRepoSynced=false, viaDaemon=false) {

		const repoId = uploadResponse.repo_id;
		const filePathAndId = uploadResponse.file_path_and_id;
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
				// Write file IDs
				configJSON.repos[repoPath].branches[branch] = filePathAndId;
				fs.writeFileSync(CONFIG_PATH, yaml.safeDump(configJSON));
				
				// delete .originals repo 
				fs.rmdirSync(originalsRepoBranchPath, { recursive: true });
				
				// Show success notifucation
				if (!viaDaemon) {
					const successMsg = isRepoSynced ? NOTIFICATION.BRANCH_SYNCED : NOTIFICATION.REPO_SYNCED;
					vscode.window.showInformationMessage(successMsg);	
				}
		});

	}
	static async uploadRepo(repoPath: string, repoName: string, branch: string, token: string, isPublic: boolean, itemPaths: IFileToUpload[],
		userEmail: string, isRepoSynced=false, viaDaemon=false) {
		const configJSON = readYML(CONFIG_PATH);
		const repoInConfig = repoPath in configJSON.repos;
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
			configJSON.repos[repoPath] = {'branches': {branch: branchFiles}};
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
			putLogEvent(`${ERROR_SYNCING_REPO}. Reason: ${json.error || json.response.error}`);
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
					'file_path_and_ids': file_path_and_id,
					'urls': <presigned_urls_for_files>
				}
		*/	
		
		const user = json.response.user;
		
		// Save IAM credentials
		initUtils.saveIamUser(user);

		// Save email for sequence_token
		initUtils.saveSequenceTokenFile(user.email);

		// Upload to s3
		await initUtils.uploadRepoToS3(repoPath, branch, token, json.response, user.email, isRepoSynced, viaDaemon);
	}
}
