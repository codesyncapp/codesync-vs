import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as walk from 'walk';

import ignore from 'ignore';
import fetch from "node-fetch";
import { isBinaryFileSync } from 'isbinaryfile';

import { API_INIT, CONFIG_PATH, ERROR_SYNCING_REPO, IGNOREABLE_REPOS, ORIGINALS_REPO, 
	SEQUENCE_TOKEN_PATH, 
	SYNCIGNORE, 
	USER_PATH} from '../constants';
import { IFileToUpload } from '../interface';
import { readFile, readYML } from './common';
import { checkServerDown } from './api_utils';
import { putLogEvent } from '../logger';

export class initUtils {

	static isValidRepoSize (syncSize: number, userPlan: any)  {
		const isValid = userPlan.SIZE >= syncSize;
		if (!isValid) {
			console.log(`Repo size exceeds limit. Allowed repo size is ${userPlan.SIZE}`);
		}
		return isValid;	
	}
	
	static isValidFilesCount (filesCount: number, userPlan: any) {
		const isValid = userPlan.FILE_COUNT >= filesCount;
		if (!isValid) {
			console.log(`You can add only ${userPlan.FILE_COUNT} files (Trying to add ${filesCount} files)`);
		}
		return isValid;
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

	static async uploadRepo(repoPath: string, branch: string, token: string, isPublic: boolean, itemPaths: IFileToUpload[],
		userEmail: string, viaDaemon=false) {
		const originalsRepoBranchPath = path.join(ORIGINALS_REPO, path.join(repoPath, branch));
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

		const splittedPath = repoPath.split('/');
		const repoName = splittedPath[splittedPath.length-1];

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
				// TODO: Show some error notification to user
			}
			return;
		}
		/*
			Response from server looks like
				{
					'repo_id': repo_id,
					'branch_id': branch_id,
					'file_path_and_ids': file_path_and_id,
					'file_urls': <presigned_urls_for_files>
				}
		*/	
		
		const repoId = json.response.repo_id;
		const filePathAndId = json.response.file_path_and_id;
		const user = json.response.user;
		
		// Save IAM credentials
		initUtils.saveIamUser(user);

		// Save email for sequence_token
		initUtils.saveSequenceTokenFile(user.email);

		// Upload to s3
	}
}
