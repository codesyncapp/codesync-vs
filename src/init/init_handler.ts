import fs from 'fs';
import path from 'path';
import vscode from 'vscode';
import getBranchName from 'current-git-branch';

import { CONFIG_PATH, DEFAULT_BRANCH, GITIGNORE, NOTIFICATION,
	ORIGINALS_REPO, SHADOW_REPO, SYNCIGNORE } from "../constants";
import {isRepoActive, readFile, readYML} from "../utils/common";
import { checkServerDown, getUserForToken } from "../utils/api_utils";
import { initUtils } from './utils';
import { askPublicPrivate, askToUpdateSyncIgnore } from '../utils/notifications';
import { askAndTriggerSignUp } from '../utils/auth_utils';
import { IUser, IUserPlan } from '../interface';


export const syncRepo = async (repoPath: string, accessToken: string, viaDaemon=false, isSyncingBranch=false) => {
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

	const splitPath = repoPath.split('/');
	const repoName = splitPath[splitPath.length-1];
	const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
	const configJSON = readYML(CONFIG_PATH);
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
		fs.writeFileSync(syncignorePath, "");
	}

	const gitignorePath = path.join(repoPath, GITIGNORE);
	const gitignoreExists  = fs.existsSync(gitignorePath);
	if (!syncignoreExists || (syncignoreExists && !syncignoreData) && gitignoreExists && !viaDaemon) {
		fs.copyFileSync(gitignorePath, syncignorePath);
		// Notify the user that .syncignore was created from .syncignore
		vscode.window.showInformationMessage(`${SYNCIGNORE} was created from ${GITIGNORE}`);
	}

	if (viaDaemon) {
		await postSyncIgnoreUpdate(repoName, branch, repoPath, user, accessToken, viaDaemon, isSyncingBranch);
		return;
	}
	// Open .syncignore and ask for user input for Continue/Cancel
	const setting: vscode.Uri = vscode.Uri.parse("file:" + `${repoPath}/${SYNCIGNORE}`);
	// Opening .syncignore
	await vscode.workspace.openTextDocument(setting).then(async (a: vscode.TextDocument) => {
		await vscode.window.showTextDocument(a, 1, false).then(async e => {
			if (!(global as any).didSaveSyncIgnoreEventAdded) {
				(global as any).didSaveSyncIgnoreEventAdded = true;
				vscode.workspace.onDidSaveTextDocument(async event => {
					const fileName = event.fileName;
					if (fileName.endsWith(SYNCIGNORE)) {
						await postSyncIgnoreUpdate(repoName, branch, repoPath, user, accessToken, viaDaemon, isSyncingBranch);
					}
				});
			}
			const selectedValue = await askToUpdateSyncIgnore();
			const shouldExit = selectedValue && selectedValue === NOTIFICATION.CANCEL;
			if (shouldExit) {
				vscode.window.showWarningMessage(NOTIFICATION.INIT_CANCELLED);
				return;
			}
		});
	});
};

const postSyncIgnoreUpdate = async (repoName: string, branch: string, repoPath: string, user: IUser, accessToken: string,
	viaDaemon=false, isSyncingBranch=false) => {

	let isPublic = false;

	if (!viaDaemon && isSyncingBranch) {
		vscode.window.showInformationMessage(`Branch: ${branch} is being synced for the repo: ${repoName}`);
	}

	// Only ask for public/private in case of Repo Sync. Do not ask for Branch Sync.
	if (!viaDaemon && !isSyncingBranch) {
		const buttonSelected = await askPublicPrivate();
		if (buttonSelected == undefined) {
			vscode.window.showWarningMessage(NOTIFICATION.INIT_CANCELLED);
			return;
		}
		isPublic = buttonSelected === NOTIFICATION.YES;
	}

	// get item paths to upload and copy in respective repos
	const itemPaths = initUtils.getSyncablePaths(repoPath, user.plan, isSyncingBranch);
	const filePaths = itemPaths.map(itemPath => itemPath.file_path);
	const originalsRepoBranchPath = path.join(ORIGINALS_REPO, path.join(repoPath, branch));
	// copy files to .originals repo
	initUtils.copyFilesTo(repoPath, filePaths, originalsRepoBranchPath);

	const shadowRepoBranchPath = path.join(SHADOW_REPO, path.join(repoPath, branch));
	// copy files to .shadow repo
	initUtils.copyFilesTo(repoPath, filePaths, shadowRepoBranchPath);

	// Upload repo/branch
	await initUtils.uploadRepo(repoPath, branch, accessToken, itemPaths, isPublic, isSyncingBranch, viaDaemon, user.email);

};
