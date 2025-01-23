import fs from 'fs';
import os from "os";
import path from 'path';
import { glob } from 'glob';
import yaml from 'js-yaml';
import vscode from 'vscode';
import { isBinaryFileSync } from 'isbinaryfile';

import { CodeSyncLogger } from '../logger';
import { generateSettings } from "../settings";
import { pathUtils } from '../utils/path_utils';
import { checkServerDown } from '../utils/api_utils';
import { IFileToUpload } from '../interface';
import { uploadRepoToServer } from '../utils/upload_utils';
import { CONNECTION_ERROR_MESSAGE, VSCODE, NOTIFICATION, BRANCH_SYNC_TIMEOUT, contextVariables } from '../constants';
import { getGlobIgnorePatterns, readYML, getSyncIgnoreItems, shouldIgnorePath, getDefaultIgnorePatterns } from '../utils/common';
import { CodeSyncState, CODESYNC_STATES } from '../utils/state_utils';
import { s3UploaderUtils } from './s3_uploader';
import gitCommitInfo from 'git-commit-info';
import { RepoPlanLimitsState, RepoState } from '../utils/repo_state_utils';
import { captureTabs } from '../utils/tab_utils';

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

	async getSyncablePaths () {
		const itemPaths: IFileToUpload[] = [];
		const globIgnorePatterns = getGlobIgnorePatterns(this.repoPath, this.syncIgnoreItems);
		const globFiles = await glob("**", { 
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
			const isIgnorablePath = shouldIgnorePath(relPath, this.defaultIgnorePatterns, this.syncIgnoreItems);
			if (isIgnorablePath) return;
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

	saveFileIds(branch: string, userEmail: string, uploadResponse: any) {
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
		CodeSyncLogger.debug(`Saved file IDs, branch=${branch} repo=${this.repoPath}`);
	}

	async uploadRepoToS3(branch: string, uploadResponse: any, syncingBranchKey: string) {
		/* 
			Save URLs in YML file for s3Uploader
		*/
		const filePathAndURLs =  uploadResponse.urls;
		const uploaderUtils = new s3UploaderUtils();
		uploaderUtils.saveURLs(this.repoPath, branch, filePathAndURLs);
		// Reset state values
		CodeSyncState.set(syncingBranchKey, false);
		CodeSyncState.set(CODESYNC_STATES.IS_SYNCING_BRANCH, false);
		// Hide Connect Repo
		vscode.commands.executeCommand('setContext', contextVariables.showConnectRepoView, false);
		if (this.viaDaemon) return;
		// Show success notification
		vscode.window.showInformationMessage(NOTIFICATION.REPO_CONNECTED);
	}

	async uploadRepo(branch: string, token: string, itemPaths: IFileToUpload[],
					userEmail: string, isPublic=false, repoId=null, orgId=null, teamId=null) {
		// Check plan limits
		const repoLimitsState = new RepoPlanLimitsState(this.repoPath).get();
		if (repoLimitsState.planLimitReached && !repoLimitsState.canRetry) return false;
		const repoName = path.basename(this.repoPath);
		const repoStateUtils = new RepoState(this.repoPath);
		const repoState = repoStateUtils.get();
		const configJSON = repoStateUtils.config;
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
		if (!repoState.IS_CONNECTED) {
			configJSON.repos[this.repoPath] = {
				branches: {},
				email: userEmail,
				orgId: orgId,
				teamId: teamId
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
		const syncingBranchKey = `${CODESYNC_STATES.SYNCING_BRANCH}:${this.repoPath}:${branch}`;
		const isSyncInProcess = CodeSyncState.canSkipRun(syncingBranchKey, BRANCH_SYNC_TIMEOUT);
		if (isSyncInProcess) return false;

		// Set key here that Branch is being synced
		CodeSyncState.set(syncingBranchKey, new Date().getTime());
		CodeSyncState.set(CODESYNC_STATES.IS_SYNCING_BRANCH, new Date().getTime());
		const instanceUUID = CodeSyncState.get(CODESYNC_STATES.INSTANCE_UUID);
		CodeSyncLogger.info(`Uploading branch=${branch}, repo=${this.repoPath}, uuid=${instanceUUID}`);

		const commit_hash = gitCommitInfo({cwd: this.repoPath}).hash || null;

		const data = {
			repo_path: this.repoPath,
			name: repoName,
			is_public: isPublic,
			branch,
			commit_hash,
			files_data: JSON.stringify(filesData),
			source: VSCODE,
			platform: os.platform(),
			org_id: configJSON.repos[this.repoPath].orgId,
			team_id: configJSON.repos[this.repoPath].teamId
		};

		const json = await uploadRepoToServer(token, data, repoId);
		if (json.error) {
			// Reset the key here and try again in next attempt
			CodeSyncState.set(syncingBranchKey, false);
			CodeSyncState.set(CODESYNC_STATES.IS_SYNCING_BRANCH, false);
			let error = this.viaDaemon ? NOTIFICATION.ERROR_SYNCING_BRANCH : NOTIFICATION.ERROR_CONNECTING_REPO;
			error = `${error}, branch=${branch}, repo=${this.repoPath}`;
			CodeSyncLogger.error(error, json.error, userEmail);
			if (!this.viaDaemon && !json.msgShown) vscode.window.showErrorMessage(NOTIFICATION.REPO_CONNECTE_FAILED);
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

		// Save file paths and IDs in config
		this.saveFileIds(branch, user.email, json.response);

		// Upload to s3
		await this.uploadRepoToS3(branch, json.response, syncingBranchKey);

		// Capture tabs for newly connected repo/branch
		captureTabs(this.repoPath);
		return true;
	}
}
