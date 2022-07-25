import fs from 'fs';
import os from "os";
import path from 'path';
import walk from 'walk';
import yaml from 'js-yaml';
import vscode from 'vscode';
import ignore from 'ignore';
import parallel from "run-parallel";
import { isBinaryFileSync } from 'isbinaryfile';

import { putLogEvent } from '../logger';
import { generateSettings } from "../settings";
import { pathUtils } from '../utils/path_utils';
import { checkServerDown } from '../utils/api_utils';
import { IFileToUpload, IUserPlan } from '../interface';
import { trackRepoHandler } from '../handlers/commands_handler';
import { uploadFileTos3, uploadRepoToServer } from '../utils/upload_utils';
import { CONNECTION_ERROR_MESSAGE, DIFF_SOURCE, NOTIFICATION } from '../constants';
import { getSkipRepos, isRepoActive, readYML, getSyncIgnoreItems } from '../utils/common';
import { getPlanLimitReached } from '../utils/pricing_utils';

export class initUtils {
	repoPath: string;
	viaDaemon: boolean;
	settings: any;

	constructor(repoPath: string, viaDaemon= false) {
		this.repoPath = repoPath;
		this.viaDaemon = viaDaemon;
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

	isSyncAble(relPath: string) {
		const syncIgnoreItems = getSyncIgnoreItems(this.repoPath);
		const ig = ignore().add(syncIgnoreItems);
		return !ig.ignores(relPath);
	}

	getSyncablePaths (userPlan: IUserPlan, isPopulatingBuffer = false) {
		const itemPaths: IFileToUpload[] = [];
		const repoPath = this.repoPath;
		const viaDaemon = this.viaDaemon;
		const syncIgnoreItems = getSyncIgnoreItems(repoPath);

		let syncSize = 0;
		let limitReached = false;
		const skipRepos = getSkipRepos(repoPath, syncIgnoreItems);

		const options = {
			filters: skipRepos,
			listeners: {
				file: function (root: string, fileStats: any, next: any) {
					const filePath = path.join(root, fileStats.name);
					const relPath = filePath.split(path.join(repoPath, path.sep))[1];
					const self = new initUtils(repoPath, viaDaemon);
					const isSyncAbleFile = self.isSyncAble(relPath);
					if (isSyncAbleFile) {
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
					if (!viaDaemon && !isPopulatingBuffer &&
						(!self.isValidRepoSize(syncSize, userPlan) ||
						!self.isValidFilesCount(itemPaths.length, userPlan))) {
						limitReached = true;
					}
					next();
				}
			}
		};
		walk.walkSync(repoPath, options);
		return limitReached ? [] : itemPaths;
	}

	copyFilesTo(filePaths: string[], destination: string, useFormattedRepoPath = false) {
		filePaths.forEach((filePath) => {
			const repoPath = useFormattedRepoPath ? pathUtils.formatRepoPath(this.repoPath): this.repoPath;
			const relPath = filePath.split(path.join(repoPath, path.sep))[1];
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

    copyForRename(from: string, to: string) {
        const directories = path.dirname(to);
        if (!fs.existsSync(directories)) {
            fs.mkdirSync(directories, {recursive: true});
        }
        // File destination will be created or overwritten by default.
        try {
            fs.copyFileSync(from, to);
        } catch (error) {
            console.log("Unable to copy", from, to);
            console.log(error);
        }
    }
	saveIamUser (user: any) {
		// save iam credentials if not saved already
		const iamUser = {
			access_key: user.iam_access_key,
			secret_key: user.iam_secret_key,
		};
		let users = <any>{};
		if (!fs.existsSync(this.settings.USER_PATH)) {
			users[user.email] = iamUser;
		} else {
			users = readYML(this.settings.USER_PATH) || {};
			if (user.email in users) {
				users[user.email].access_key = iamUser.access_key;
				users[user.email].secret_key = iamUser.secret_key;
			} else {
				users[user.email] = iamUser;
			}
		}
		fs.writeFileSync(this.settings.USER_PATH, yaml.safeDump(users));
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

	async uploadRepoToS3(branch: string, token: string, uploadResponse: any) {
		const viaDaemon = this.viaDaemon;
		const s3Urls =  uploadResponse.urls;
		const tasks: any[] = [];
		const pathUtilsObj = new pathUtils(this.repoPath, branch);
		const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();

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
				if (fs.existsSync(originalsRepoBranchPath)) {
					fs.rmdirSync(originalsRepoBranchPath, { recursive: true });
				}
				// Hide Connect Repo
				vscode.commands.executeCommand('setContext', 'showConnectRepoView', false);

				// Show success notification
				if (!viaDaemon) {
					vscode.window.showInformationMessage(NOTIFICATION.REPO_SYNCED, ...[
						NOTIFICATION.TRACK_IT
					]).then(selection => {
						if (!selection) { return; }
						if (selection === NOTIFICATION.TRACK_IT) {
							trackRepoHandler();
						}
					});
				}
		});
	}

	async uploadRepo(branch: string, token: string, itemPaths: IFileToUpload[],
					userEmail: string, isPublic=false) {

		// Check plan limits
		const { planLimitReached, canRetry } = getPlanLimitReached();
		if (planLimitReached && !canRetry) return;
					
		const repoName = path.basename(this.repoPath);
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
			configJSON.repos[this.repoPath] = {
				branches: {},
				email: userEmail
			};
			configJSON.repos[this.repoPath].branches[branch] = branchFiles;
			fs.writeFileSync(this.settings.CONFIG_PATH, yaml.safeDump(configJSON));
		} else if (!(branch in configJSON.repos[this.repoPath].branches)) {
			configJSON.repos[this.repoPath].branches[branch] = branchFiles;
			fs.writeFileSync(this.settings.CONFIG_PATH, yaml.safeDump(configJSON));
		}

		const isServerDown = await checkServerDown();
		if (isServerDown) {
			if (!this.viaDaemon) putLogEvent(CONNECTION_ERROR_MESSAGE);
			return;
		}

		console.log(`Uploading new branch: ${branch} for repo: ${this.repoPath}`);

		const data = {
			name: repoName,
			is_public: isPublic,
			branch,
			files_data: JSON.stringify(filesData),
			source: DIFF_SOURCE,
			platform: os.platform()
		};

		const json = await uploadRepoToServer(token, data);
		if (json.error) {
			const error = this.viaDaemon ? NOTIFICATION.ERROR_SYNCING_BRANCH : NOTIFICATION.ERROR_SYNCING_REPO;
			putLogEvent(error, userEmail, json.error);
			if (!this.viaDaemon) {
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
		await this.uploadRepoToS3(branch, token, json.response);
	}
}
