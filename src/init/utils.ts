import fs from 'fs';
import path from 'path';
import walk from 'walk';
import yaml from 'js-yaml';
import vscode from 'vscode';
import ignore from 'ignore';
import parallel from "run-parallel";
import getBranchName from 'current-git-branch';
import { isBinaryFileSync } from 'isbinaryfile';
import {
	DEFAULT_BRANCH,
	NOTIFICATION
} from '../constants';
import { IFileToUpload, IUserPlan } from '../interface';
import { getSkipRepos, isRepoActive, readYML, getSyncIgnoreItems } from '../utils/common';
import { checkServerDown } from '../utils/api_utils';
import { putLogEvent } from '../logger';
import { uploadFileTos3, uploadRepoToServer } from '../utils/upload_utils';
import { trackRepoHandler, unSyncHandler } from '../handlers/commands_handler';
import { generateSettings } from "../settings";

export class initUtils {
	repoPath: string;
	settings: any;

	constructor(repoPath="") {
		this.repoPath = repoPath;
		this.settings = generateSettings();
	}

	isValidRepoSize (syncSize: number, userPlan: IUserPlan)  {
		const isValid = userPlan.SIZE >= syncSize;
		if (!isValid) {
			vscode.window.showErrorMessage(`${NOTIFICATION.REPOS_LIMIT_BREACHED} ${userPlan.SIZE}`);
		}
		return isValid;
	}

	isValidFilesCount (filesCount: number, userPlan: IUserPlan) {
		const isValid = userPlan.FILE_COUNT >= filesCount;
		if (!isValid) {
			vscode.window.showErrorMessage(`${NOTIFICATION.FILES_LIMIT_BREACHED}\n
			You can add only ${userPlan.FILE_COUNT} files (Trying to add ${filesCount} files)`);
		}
		return isValid;
	}

	successfullySynced () {
		const config = readYML(this.settings.CONFIG_PATH);
		if (!(this.repoPath in config.repos)) {
			return false;
		}
		const configRepo = config.repos[this.repoPath];
		const branch = getBranchName({ altPath: this.repoPath }) || DEFAULT_BRANCH;
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

	getSyncablePaths (userPlan: IUserPlan, isSyncingBranch=false, isPopulatingBuffer = false) {
		const syncIgnoreItems = getSyncIgnoreItems(this.repoPath);
		const itemPaths: IFileToUpload[] = [];
		if (!syncIgnoreItems.length) {
			return itemPaths;
		}
		let syncSize = 0;
		let limitReached = false;
		const ig = ignore().add(syncIgnoreItems);
		const skipRepos = getSkipRepos(this.repoPath, syncIgnoreItems);
		const repoPath = this.repoPath;
		const options = {
			filters: skipRepos,
			listeners: {
				file: function (root: string, fileStats: any, next: any) {
					const self = new initUtils();
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
						(!self.isValidRepoSize(syncSize, userPlan) ||
						!self.isValidFilesCount(itemPaths.length, userPlan))) {
						limitReached = true;
					}
					next();
				}
			}
		};
		walk.walkSync(this.repoPath, options);
		return limitReached ? [] : itemPaths;
	}

	copyFilesTo (filePaths: string[], destination: string) {
		filePaths.forEach((filePath) => {
			const relPath = filePath.split(`${this.repoPath}/`)[1];
			const destinationPath = path.join(destination, relPath);
			const directories = path.dirname(destinationPath);
			if (!fs.existsSync(directories)) {
				fs.mkdirSync(directories, { recursive: true });
			}
			// File destination will be created or overwritten by default.
			try {
				fs.copyFileSync(filePath, destinationPath);
			} catch (error) {
				console.log("Unable to copy", filePath, destinationPath);
				console.log(error);
			}
		});
	}

	saveIamUser (user: any) {
		// save iam credentials if not saved already
		const iamUser = {
			access_key: user.iam_access_key,
			secret_key: user.iam_secret_key,
		};

		if (!fs.existsSync(this.settings.USER_PATH)) {
			const users = <any>{};
			users[user.email] = iamUser;
			fs.writeFileSync(this.settings.USER_PATH, yaml.safeDump(users));
		} else {
			const users = readYML(this.settings.USER_PATH) || {};
			if (!(user.email in users)) {
				users[user.email] = iamUser;
				fs.writeFileSync(this.settings.USER_PATH, yaml.safeDump(users));
			}
		}
	}

	saveSequenceTokenFile (email: string) {
		// Save email for sequence_token
		if (!fs.existsSync(this.settings.SEQUENCE_TOKEN_PATH)) {
			const users = <any>{};
			users[email] = "";
			fs.writeFileSync(this.settings.SEQUENCE_TOKEN_PATH, yaml.safeDump(users));
		} else {
			const users = readYML(this.settings.SEQUENCE_TOKEN_PATH) || {};
			if (!(email in users)) {
				users[email] = "";
				fs.writeFileSync(this.settings.SEQUENCE_TOKEN_PATH, yaml.safeDump(users));
			}
		}
	}

	saveFileIds(branch: string, token: string, userEmail: string, uploadResponse: any) {
		// Save file IDs, repoId and email against repo path
		const repoId = uploadResponse.repo_id;
		const filePathAndId = uploadResponse.file_path_and_id;
		// Write file IDs
		const configJSON = readYML(this.settings.CONFIG_PATH);
		const configRepo = configJSON.repos[this.repoPath];
		configRepo.branches[branch] = filePathAndId;
		configRepo.id = repoId;
		configRepo.email = userEmail;
		fs.writeFileSync(this.settings.CONFIG_PATH, yaml.safeDump(configJSON));
	}

	async uploadRepoToS3(branch: string, token: string, uploadResponse: any,
						userEmail: string, isSyncingBranch=false, viaDaemon=false) {
		const repoId = uploadResponse.repo_id;
		const s3Urls =  uploadResponse.urls;
		const tasks: any[] = [];
		const repoPath = this.repoPath;
		const originalsRepoBranchPath = path.join(this.settings.ORIGINALS_REPO, path.join(repoPath, branch));

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

				// delete .originals repo
				fs.rmdirSync(originalsRepoBranchPath, { recursive: true });

				// Hide Connect Repo
				vscode.commands.executeCommand('setContext', 'showConnectRepoView', false);

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

	async uploadRepo(branch: string, token: string, itemPaths: IFileToUpload[],
					isPublic=false, isSyncingBranch=false, viaDaemon=false,
					userEmail?: string) {
		const splitPath = this.repoPath.split('/');
		const repoName = splitPath[splitPath.length-1];
		const configJSON = readYML(this.settings.CONFIG_PATH);
		const repoInConfig = isRepoActive(configJSON, this.repoPath);
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
			configJSON.repos[this.repoPath] = {branches: {}};
			configJSON.repos[this.repoPath].branches[branch] = branchFiles;
			fs.writeFileSync(this.settings.CONFIG_PATH, yaml.safeDump(configJSON));
		} else if (!(branch in configJSON.repos[this.repoPath].branches)) {
			configJSON.repos[this.repoPath].branches[branch] = branchFiles;
			fs.writeFileSync(this.settings.CONFIG_PATH, yaml.safeDump(configJSON));
		}

		const isServerDown = await checkServerDown(userEmail);
		if (isServerDown) return;

		console.log(`Uploading new branch: ${branch} for repo: ${this.repoPath}`);

		const data = {
			name: repoName,
			is_public: isPublic,
			branch,
			files_data: JSON.stringify(filesData)
		};

		const json = await uploadRepoToServer(token, data);
		if (json.error) {
			const error = isSyncingBranch ? NOTIFICATION.ERROR_SYNCING_BRANCH : NOTIFICATION.ERROR_SYNCING_REPO;
			putLogEvent(`${error}. Reason: ${json.error}`);
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
						'email': email,
						'iam_access_key': <key>,
						'iam_secret_key': <key>
					}
				}
		*/

		const user = json.response.user;

		// Save IAM credentials
		this.saveIamUser(user);

		// Save email for sequence_token
		this.saveSequenceTokenFile(user.email);

		// Save file paths and IDs
		this.saveFileIds(branch, token, user.email, json.response);

		// Upload to s3
		await this.uploadRepoToS3(branch, token, json.response, user.email, isSyncingBranch, viaDaemon);
	}
}
