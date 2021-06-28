import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as getBranchName from 'current-git-branch';

import { CONFIG_PATH, DEFAULT_BRANCH, INVALID_TOKEN_MESSAGE, NOTIFICATION_CONSTANTS, 
	ORIGINALS_REPO, PLANS_URL, SHADOW_REPO, SYNCIGNORE } from "./constants";
import { readFile, readYML } from "./utils/common";
import { checkServerDown, getUserForToken } from "./utils/api_utils";
import { initUtils } from './utils/init_utils';

export const syncRepo = async (repoPath: string, accessToken: string, email: string, viaDaemon=false, isSyncingBranch=false) => {
	/* Syncs a repo with CodeSync */
	if (!viaDaemon) {
		const isServerDown = await checkServerDown();
		if (isServerDown) { 
			// TODO: Show server is down, try again a moment later
			return; 
		}
	}

	// Validate access token
	const json = await getUserForToken(accessToken);
	if (!json.isTokenValid) {
		if (viaDaemon) {
			console.log(INVALID_TOKEN_MESSAGE);
		} else {
			// Show error msg that token is invalid
			vscode.window.showErrorMessage(INVALID_TOKEN_MESSAGE);
			// TODO: Trigger sign up process
		}
		return;	
	}
	const user = json.response;
	// Check if config.yml exists
	const configExists = fs.existsSync(CONFIG_PATH);
	if (!configExists) { 
		// TODO: Show some error here OR create config.yml maybe?
		return;
	}

	const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;

	const configJSON = readYML(CONFIG_PATH);
    const isRepoSynced = repoPath in configJSON['repos'];
	
	// if (isRepoSynced && branch in configJSON.repos[repoPath].branches) {
	// 	vscode.window.showErrorMessage(`Repo is already in sync with branch: ${branch}`);
	// 	return;
	// }

	if (!isRepoSynced && user.repo_count >= user.plan.REPO_COUNT) {
		vscode.window.showErrorMessage(`Upgrade your plan: ${PLANS_URL}`);
		return;
	}
	

	const continueWithoutAsking = viaDaemon || isRepoSynced;

	const syncignorePath = path.join(repoPath, SYNCIGNORE);
	const syncignoreExists = fs.existsSync(syncignorePath);

	let syncignoreData = "";
	if (syncignoreExists) {
		syncignoreData = readFile(syncignorePath);
	} else {
		fs.writeFileSync(syncignorePath, "");
	}

	// TODO: Deal with syncignore later
	// const gitignorePath = path.join(repoPath, GITIGNORE);
	// const gitignoreExists  = fs.existsSync(gitignorePath);
	// if (!syncignoreExists || (syncignoreExists && !syncignoreData) && gitignoreExists) {
	// 	// Ask if .gitignore should be used as .syncignore
	// 	vscode.window.showInformationMessage(`Do you want to use ${GITIGNORE} as ${SYNCIGNORE}?`, ...[
	// 		NOTIFICATION_CONSTANTS.YES,
	// 		NOTIFICATION_CONSTANTS.NO
	// 	]).then(async selection => {
	// 		if (selection  === NOTIFICATION_CONSTANTS.YES) {
	// 			fs.copyFileSync(gitignorePath, syncignorePath);
	// 		}
	// 	});
	// }

	const buttonSelected = await vscode.window.showInformationMessage(NOTIFICATION_CONSTANTS.PUBLIC_OR_PRIVATE, ...[
		NOTIFICATION_CONSTANTS.YES, 
		NOTIFICATION_CONSTANTS.NO
	]).then(selection => selection);

	if (buttonSelected == undefined) {
		return;
	}

	const isPublic = buttonSelected === NOTIFICATION_CONSTANTS.YES;
	
	// get item paths to upload and copy in respective repos
	const itemPaths = initUtils.getSyncablePaths(repoPath, user.plan);

	const originalsRepoBranchPath = path.join(ORIGINALS_REPO, path.join(repoPath, branch));
	if (!fs.existsSync(originalsRepoBranchPath)) {
		// copy files to .originals repo
		initUtils.copyFilesTo(repoPath, itemPaths, originalsRepoBranchPath);
	}

	const shadowRepoBranchPath = path.join(SHADOW_REPO, path.join(repoPath, branch));
	if (!fs.existsSync(shadowRepoBranchPath)) {
		// copy files to .shadow repo
		initUtils.copyFilesTo(repoPath, itemPaths, shadowRepoBranchPath);
	}

	// Upload repo/branch
	await initUtils.uploadRepo(repoPath, branch, accessToken, isPublic, itemPaths, email, viaDaemon);
};