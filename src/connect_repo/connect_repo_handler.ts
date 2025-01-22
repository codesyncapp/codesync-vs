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
import { IUser } from '../interface';
import { pathUtils } from "../utils/path_utils";
import { askPersonalOrOrgRepo, askPublicPrivate } from '../utils/notifications';
import { isAccountActive } from '../utils/auth_utils';
import { checkServerDown } from "../utils/api_utils";
import { getBranch, readFile } from "../utils/common";
import { CODESYNC_STATES, CodeSyncState } from '../utils/state_utils';
import { RepoState } from '../utils/repo_state_utils';


export class initHandler {
	repoPath: string;
	accessToken: string;
	userEmail: string;
	viaDaemon: boolean;
	branch: string;

	constructor(repoPath: string, accessToken: string, userEmail: string, viaDaemon=false) {
		this.repoPath = repoPath;
		this.accessToken = accessToken;
		this.userEmail = userEmail;
		// This is set True via daemon
		this.viaDaemon = viaDaemon;
		this.branch = getBranch(this.repoPath);
	}

	connectRepo = async () => {
		/* Syncs a repo with CodeSync */
		const isServerDown = await checkServerDown();
		if (!this.viaDaemon && isServerDown) {
			vscode.window.showErrorMessage(NOTIFICATION.SERVICE_NOT_AVAILABLE);
			return false;
		}

		const user = <IUser>{};
		user.email = this.userEmail;

		if (!isServerDown) {
			// Validate access token
			const success = await isAccountActive(this.userEmail, this.accessToken);
			if (!success) return false;	
		}
		
		const repoState = new RepoState(this.repoPath).get();
		if (repoState.IS_CONNECTED && !this.viaDaemon) {
			vscode.window.showWarningMessage(`Repo is already in sync with branch: ${this.branch}`);
			return false;
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
			return await this.postOrgSelection(user.email, false);
		}
		// Open .syncignore and ask public/private info
		const setting: vscode.Uri = vscode.Uri.parse("file:" + syncignorePath);
		// Opening .syncignore
		return await vscode.workspace.openTextDocument(setting).then(async (a: vscode.TextDocument) => {
			return await vscode.window.showTextDocument(a, 1, false).then(async e => {
				const json = await askPersonalOrOrgRepo(this.accessToken, this.repoPath);
				if (json.isCancelled) {
					vscode.window.showWarningMessage(NOTIFICATION.CONNECT_REPO_CANCELLED);
					return false;
				}
				return await this.postOrgSelection(user.email, false, json.orgId, json.teamId);
			});
		});
	};

	postOrgSelection = async (userEmail: string, isPublic = false, orgId = null, teamId = null) => {
		CodeSyncState.set(CODESYNC_STATES.IS_SYNCING_BRANCH, new Date().getTime());
		const initUtilsObj = new initUtils(this.repoPath, this.viaDaemon);
		// get item paths to upload and copy in respective repos
		const itemPaths = await initUtilsObj.getSyncablePaths();
		const filePaths = itemPaths.map(itemPath => itemPath.file_path);
		const pathUtilsObj = new pathUtils(this.repoPath, this.branch);
		// copy files to .originals repo
		const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
		initUtilsObj.copyFilesTo(filePaths, originalsRepoBranchPath);
		// copy files to .shadow repo
		const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
		initUtilsObj.copyFilesTo(filePaths, shadowRepoBranchPath);
		// Upload repo/branch
		const uploaded = await initUtilsObj.uploadRepo(this.branch, this.accessToken, 
			itemPaths, userEmail, isPublic, null, orgId, teamId
		);
		return uploaded;
	};
}
