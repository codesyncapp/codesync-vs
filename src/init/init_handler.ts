import fs from 'fs';
import path from 'path';
import vscode from 'vscode';

import {
	GITIGNORE,
	NOTIFICATION,
	SYNC_IGNORE_FILE_DATA,
	SYNCIGNORE
} from "../constants";
import { initUtils } from './utils';
import { IUser, IUserPlan } from '../interface';
import { pathUtils } from "../utils/path_utils";
import { askPublicPrivate } from '../utils/notifications';
import { askAndTriggerSignUp } from '../utils/auth_utils';
import { checkServerDown, getUserForToken } from "../utils/api_utils";
import { getBranch, readFile } from "../utils/common";
import { isRepoSynced } from '../events/utils';

export class initHandler {
	repoPath: string;
	accessToken: string;
	viaDaemon: boolean;
	branch: string;

	constructor(repoPath: string, accessToken: string, viaDaemon=false) {
		this.repoPath = repoPath;
		this.accessToken = accessToken;
		// This is set True via daemon
		this.viaDaemon = viaDaemon;
		this.branch = getBranch(this.repoPath);
	}

	syncRepo = async () => {
		/* Syncs a repo with CodeSync */
		const isServerDown = await checkServerDown();
		if (!this.viaDaemon && isServerDown) {
			vscode.window.showErrorMessage(NOTIFICATION.SERVICE_NOT_AVAILABLE);
			return;
		}

		let user = <IUser>{};
		user.email = "";
		user.plan = <IUserPlan>{};

		if (!isServerDown) {
			// Validate access token
			const json = await getUserForToken(this.accessToken);
			if (!json.isTokenValid) {
				askAndTriggerSignUp();
				return;
			}
			user = json.response;
		}

		const repoSynced = isRepoSynced(this.repoPath);

		if (repoSynced && !this.viaDaemon) {
			vscode.window.showWarningMessage(`Repo is already in sync with branch: ${this.branch}`);
			return;
		}

		// In case of branch sync, we don't care of user plan
		if (!isServerDown && !repoSynced && !this.viaDaemon && user.repo_count >= user.plan.REPO_COUNT) {
			vscode.window.showErrorMessage(NOTIFICATION.UPGRADE_PLAN);
			return;
		}

		const syncignorePath = path.join(this.repoPath, SYNCIGNORE);
		const syncignoreExists = fs.existsSync(syncignorePath);

		let syncignoreData = "";
		if (syncignoreExists) {
			syncignoreData = readFile(syncignorePath);
		} else {
			fs.writeFileSync(syncignorePath, SYNC_IGNORE_FILE_DATA);
		}

		const gitignorePath = path.join(this.repoPath, GITIGNORE);
		const gitignoreExists  = fs.existsSync(gitignorePath);
		if ((!syncignoreExists || (syncignoreExists && !syncignoreData)) && gitignoreExists && !this.viaDaemon) {
			fs.copyFileSync(gitignorePath, syncignorePath);
		}

		// Only ask for public/private in case of Repo Sync. Do not ask for Branch Sync.
		if (this.viaDaemon) {
			await this.postPublicPrivate(user, false);
			return;
		}
		// Open .syncignore and ask public/private info
		const setting: vscode.Uri = vscode.Uri.parse("file:" + syncignorePath);
		// Opening .syncignore
		await vscode.workspace.openTextDocument(setting).then(async (a: vscode.TextDocument) => {
			await vscode.window.showTextDocument(a, 1, false).then(async e => {
				const buttonSelected = await askPublicPrivate(this.repoPath);
				if (!buttonSelected) {
					vscode.window.showWarningMessage(NOTIFICATION.INIT_CANCELLED);
					return;
				}
				const isPublic = buttonSelected == NOTIFICATION.PUBLIC;
				await this.postPublicPrivate(user, isPublic);
			});
		});
	};

	postPublicPrivate = async (user: IUser, isPublic: boolean) => {
		const initUtilsObj = new initUtils(this.repoPath, this.viaDaemon);
		// get item paths to upload and copy in respective repos
		const itemPaths = initUtilsObj.getSyncablePaths(user.plan);
		const filePaths = itemPaths.map(itemPath => itemPath.file_path);
		const pathUtilsObj = new pathUtils(this.repoPath, this.branch);
		// copy files to .originals repo
		const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
		initUtilsObj.copyFilesTo(filePaths, originalsRepoBranchPath);
		// copy files to .shadow repo
		const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
		initUtilsObj.copyFilesTo(filePaths, shadowRepoBranchPath);
		// Upload repo/branch
		await initUtilsObj.uploadRepo(this.branch, this.accessToken, itemPaths, user.email, isPublic);
	};
}
