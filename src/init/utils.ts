import fs from 'fs';
import os from "os";
import path from 'path';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import vscode from 'vscode';
import parallel from "run-parallel";
import { isBinaryFileSync } from 'isbinaryfile';

import { CodeSyncLogger } from '../logger';
import { generateSettings } from "../settings";
import { pathUtils } from '../utils/path_utils';
import { checkServerDown } from '../utils/api_utils';
import { IFileToUpload } from '../interface';
import { trackRepoHandler } from '../handlers/commands_handler';
import { uploadFileTos3, uploadRepoToServer } from '../utils/upload_utils';
import { CONNECTION_ERROR_MESSAGE, VSCODE, NOTIFICATION, RETRY_BRANCH_SYNC_AFTER } from '../constants';
import { getGlobIgnorePatterns, isRepoActive, readYML, getSyncIgnoreItems, shouldIgnorePath, getDefaultIgnorePatterns } from '../utils/common';
import { getPlanLimitReached } from '../utils/pricing_utils';
import { CodeSyncState, CODESYNC_STATES } from '../utils/state_utils';

export class initUtils {
	repoPath: string;
	viaDaemon: boolean;
	settings: any;
	syncIgnoreItems: string[];
	defaultIgnorePatterns: string[];

	constructor(repoPath: string, viaDaemon=false) {
		this.repoPath = repoPath;
		this.viaDaemon = viaDaemon;
		this.settings = generateSettings();
		this.syncIgnoreItems = getSyncIgnoreItems(this.repoPath);
		this.defaultIgnorePatterns = getDefaultIgnorePatterns();
	}

	isBranchSyncInProcess (syncingBranchKey: string) {
		const branchSyncStartedAt = CodeSyncState.get(syncingBranchKey);
		const isSyncInProcess = branchSyncStartedAt && (new Date().getTime() - branchSyncStartedAt) < RETRY_BRANCH_SYNC_AFTER;
		return isSyncInProcess;
	}

	getSyncablePaths () {
		const itemPaths: IFileToUpload[] = [];
		const globIgnorePatterns = getGlobIgnorePatterns(this.repoPath, this.syncIgnoreItems);
		const globFiles = globSync("**", { 
			cwd: this.repoPath,
			ignore: globIgnorePatterns, 
			nodir: true, 
			dot: true, 
			stat: true,
			withFileTypes: true
		});
		globFiles.forEach(globFile => {
			// Ignore symlinks, blockDevices, characterDevices, FIFO, sockets
			if (!globFile.isFile()) return;
			const filePath = globFile.fullpath();
			const relPath = filePath.split(path.join(this.repoPath, path.sep))[1];
			const isIgnoreablePath = shouldIgnorePath(relPath, this.defaultIgnorePatterns, this.syncIgnoreItems);
			if (isIgnoreablePath) return;
			itemPaths.push({
				file_path: filePath,
				rel_path: relPath,
				is_binary: isBinaryFileSync(filePath),
				size: globFile.size,
				created_at: globFile.ctimeMs,
				modified_at: globFile.mtimeMs
			});
		});
		return itemPaths;
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
				CodeSyncLogger.error("Unable to copy", `${filePath} -> ${destinationPath}`);
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
			CodeSyncLogger.error("Unable to copy for rename", `${from} -> ${to}`);
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
		fs.writeFileSync(this.settings.USER_PATH, yaml.dump(users));
	}

	saveSequenceTokenFile (email: string) {
		// Save email for sequence_token
		if (!fs.existsSync(this.settings.SEQUENCE_TOKEN_PATH)) {
			const users = <any>{};
			users[email] = "";
			fs.writeFileSync(this.settings.SEQUENCE_TOKEN_PATH, yaml.dump(users));
		} else {
			const users = readYML(this.settings.SEQUENCE_TOKEN_PATH) || {};
			if (!(email in users)) {
				users[email] = "";
				fs.writeFileSync(this.settings.SEQUENCE_TOKEN_PATH, yaml.dump(users));
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
		fs.writeFileSync(this.settings.CONFIG_PATH, yaml.dump(configJSON));
	}

	async uploadRepoToS3(branch: string, uploadResponse: any, syncingBranchKey: string) {
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
					const json = <any> await uploadFileTos3(absPath, presignedUrl);
					callback(json.error, true);
				});
			}
		});

		parallel(
			tasks,
			// optional callback
			function (err, results) {
				// the results array will equal ['one','two'] even though
				// the second function had a shorter timeout.
				if (err) {
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore
					CodeSyncLogger.error("uploadRepoToS3 failed: ", err);
					CodeSyncState.set(syncingBranchKey, false);
					return;
				}
				// delete .originals repo
				if (fs.existsSync(originalsRepoBranchPath)) {
					fs.rmSync(originalsRepoBranchPath, { recursive: true });
				}
				// Hide Connect Repo
				vscode.commands.executeCommand('setContext', 'showConnectRepoView', false);
				// Reset key for syncingBranch
				CodeSyncState.set(syncingBranchKey, false);
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
		if (planLimitReached && !canRetry) return false;
					
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
				created_at: fileToUpload.created_at ? fileToUpload.created_at / 1000 : ""
			};
		});
		
		if (!repoInConfig) {
			configJSON.repos[this.repoPath] = {
				branches: {},
				email: userEmail
			};
			configJSON.repos[this.repoPath].branches[branch] = branchFiles;
			fs.writeFileSync(this.settings.CONFIG_PATH, yaml.dump(configJSON));
		} else if (!(branch in configJSON.repos[this.repoPath].branches)) {
			configJSON.repos[this.repoPath].branches[branch] = branchFiles;
			fs.writeFileSync(this.settings.CONFIG_PATH, yaml.dump(configJSON));
		}

		const isServerDown = await checkServerDown();
		if (isServerDown) {
			if (!this.viaDaemon) CodeSyncLogger.error(CONNECTION_ERROR_MESSAGE);
			return false;
		}

		// Check if branch is already being synced, skip it
		const syncingBranchKey = `${CODESYNC_STATES.SYNCING_BRANCH}:${repoName}:${branch}`;
		const isSyncInProcess = this.isBranchSyncInProcess(syncingBranchKey);
		if (isSyncInProcess) return false;

		// Set key here that Branch is being synced
		CodeSyncState.set(syncingBranchKey, new Date().getTime());
		const instanceUUID = CodeSyncState.get(CODESYNC_STATES.INSTANCE_UUID);
		CodeSyncLogger.info(`Uploading branch=${branch}, repo=${this.repoPath}, uuid=${instanceUUID}`);

		const data = {
			name: repoName,
			is_public: isPublic,
			branch,
			files_data: JSON.stringify(filesData),
			source: VSCODE,
			platform: os.platform()
		};

		const json = await uploadRepoToServer(token, data);
		if (json.error) {
			// Reset the key here and try again in next attempt
			CodeSyncState.set(syncingBranchKey, false);
			const error = this.viaDaemon ? NOTIFICATION.ERROR_SYNCING_BRANCH : NOTIFICATION.ERROR_SYNCING_REPO;
			CodeSyncLogger.error(error, json.error, userEmail);
			if (!this.viaDaemon) {
				vscode.window.showErrorMessage(NOTIFICATION.SYNC_FAILED);
			}
			return false;
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
		await this.uploadRepoToS3(branch, json.response, syncingBranchKey);

		return true;
	}
}
