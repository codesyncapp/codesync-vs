import fs from 'fs';
import path from 'path';
import vscode from 'vscode';
import getBranchName from 'current-git-branch';

import {
	DEFAULT_BRANCH,
	GITIGNORE,
	NOTIFICATION,
	SYNC_IGNORE_FILE_DATA,
	SYNCIGNORE
} from "../constants";
import { initUtils } from './utils';
import { IUser, IUserPlan } from '../interface';
import { generateSettings } from "../settings";
import { askAndTriggerSignUp } from '../utils/auth_utils';
import { checkServerDown, getUserForToken } from "../utils/api_utils";
import { isRepoActive, readFile, readYML } from "../utils/common";
import { askPublicPrivate, askToUpdateSyncIgnore } from '../utils/notifications';
import { pathUtils } from "../utils/path_utils";


export const syncRepo = async (repoPath: string, accessToken: string,
								viaDaemon=false, isSyncingBranch=false) => {
	/* Syncs a repo with CodeSync */
	const isServerDown = await checkServerDown();

	if (!viaDaemon && isServerDown) {
		vscode.window.showErrorMessage(NOTIFICATION.SERVICE_NOT_AVAILABLE);
		return;
	}

	let user = <IUser>{};
	user.email = "";
	user.plan = <IUserPlan>{};

	if (!isServerDown) {
		// Validate access token
		const json = await getUserForToken(accessToken);
		if (!json.isTokenValid) {
			askAndTriggerSignUp();
			return;
		}
		user = json.response;
	}

	const settings = generateSettings();
	const repoName = path.basename(repoPath);
	const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
	const configJSON = readYML(settings.CONFIG_PATH);
	const isRepoSynced = isRepoActive(configJSON, repoPath);

	if (isRepoSynced && !isSyncingBranch && !viaDaemon) {
		vscode.window.showWarningMessage(`Repo is already in sync with branch: ${branch}`);
		return;
	}

	if (!isServerDown && !isRepoSynced && !isSyncingBranch && user.repo_count >= user.plan.REPO_COUNT) {
		vscode.window.showErrorMessage(NOTIFICATION.UPGRADE_PLAN);
		return;
	}

	const syncignorePath = path.join(repoPath, SYNCIGNORE);
	const syncignoreExists = fs.existsSync(syncignorePath);

	let syncignoreData = "";
	if (syncignoreExists) {
		syncignoreData = readFile(syncignorePath);
	} else {
		fs.writeFileSync(syncignorePath, SYNC_IGNORE_FILE_DATA);
	}

	const gitignorePath = path.join(repoPath, GITIGNORE);
	const gitignoreExists  = fs.existsSync(gitignorePath);
	if ((!syncignoreExists || (syncignoreExists && !syncignoreData)) && gitignoreExists && !viaDaemon) {
		fs.copyFileSync(gitignorePath, syncignorePath);
	}

	if (viaDaemon) {
		await postSyncIgnoreUpdate(repoName, branch, repoPath, user, accessToken, viaDaemon, isSyncingBranch);
		return;
	}
	// Open .syncignore and ask public/private info
	const setting: vscode.Uri = vscode.Uri.parse("file:" + syncignorePath);
	// Opening .syncignore
	await vscode.workspace.openTextDocument(setting).then(async (a: vscode.TextDocument) => {
		await vscode.window.showTextDocument(a, 1, false).then(async e => {
			await postSyncIgnoreUpdate(repoName, branch, repoPath, user, accessToken, viaDaemon, isSyncingBranch);
		});
	});
};

const postSyncIgnoreUpdate = async (repoName: string, branch: string, repoPath: string,
									user: IUser, accessToken: string,
									viaDaemon=false, isSyncingBranch=false) => {

	let isPublic = false;

	if (!viaDaemon && isSyncingBranch) {
		vscode.window.showInformationMessage(`Branch: ${branch} is being synced for the repo: ${repoName}`);
	}

	// Only ask for public/private in case of Repo Sync. Do not ask for Branch Sync.
	if (!viaDaemon && !isSyncingBranch) {
		const buttonSelected = await askPublicPrivate(repoPath);
		if (buttonSelected == undefined) {
			vscode.window.showWarningMessage(NOTIFICATION.INIT_CANCELLED);
			return;
		}
		isPublic = buttonSelected === NOTIFICATION.PUBLIC;
	}

	const initUtilsObj = new initUtils(repoPath);
	const pathUtilsObj = new pathUtils(repoPath, branch);

	// get item paths to upload and copy in respective repos
	const itemPaths = initUtilsObj.getSyncablePaths(user.plan, isSyncingBranch);
	const filePaths = itemPaths.map(itemPath => itemPath.file_path);

	// copy files to .originals repo
	const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
	initUtilsObj.copyFilesTo(filePaths, originalsRepoBranchPath);

	// copy files to .shadow repo
	const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
	initUtilsObj.copyFilesTo(filePaths, shadowRepoBranchPath);

	// Upload repo/branch
	await initUtilsObj.uploadRepo(branch, accessToken, itemPaths, isPublic, isSyncingBranch, viaDaemon, user.email);
};
