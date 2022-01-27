import vscode from 'vscode';
import { initHandler } from '../init/init_handler';
import { getActiveUsers } from './common';
import { redirectToBrowser } from './auth_utils';
import { getPublicPrivateMsg, getDirectorySyncIgnoredMsg, NOTIFICATION } from '../constants';
import { trackRepoHandler, unSyncHandler, openSyncIgnoreHandler } from '../handlers/commands_handler';


export const showSignUpButtons = () => {
	vscode.window.showInformationMessage(
		NOTIFICATION.WELCOME_MSG, ...[
		NOTIFICATION.JOIN,
		NOTIFICATION.IGNORE
	]).then(async selection => {
		if (selection === NOTIFICATION.JOIN) {
			redirectToBrowser();
		}
	});
};

export const showConnectRepo = (repoPath: string, email="", accessToken="") => {
	const skipAskConnect = (global as any).skipAskConnect;
	if (skipAskConnect && email && accessToken) {
		const handler = new initHandler(repoPath, accessToken);
		handler.syncRepo();
		(global as any).skipAskConnect = false;
		return;
	}
	const msg = email ? NOTIFICATION.CONNECT_AFTER_JOIN : NOTIFICATION.CONNECT_REPO;
	vscode.window.showInformationMessage(msg, ...[
		NOTIFICATION.CONNECT
	]).then(async selection => {
		if (selection === NOTIFICATION.CONNECT) {

			if (email && accessToken) {
				const handler = new initHandler(repoPath, accessToken);
				await handler.syncRepo();
				return;
			}

			await showChooseAccount(repoPath);
		}
	});
};


export const showChooseAccount = async (repoPath: string) => {
	// Check if access token is present against users
	const validUsers =  getActiveUsers();
	if (validUsers.length === 0) {
		vscode.window.showErrorMessage(NOTIFICATION.NO_VALID_ACCOUNT);
		return;
	}
	// By Default choosing first account
	const user = validUsers[0];
	const handler = new initHandler(repoPath, user.access_token);
	await handler.syncRepo();
	return handler;
	// TODO: Option to choose different account
	// const emails = validUsers.map(account => account.email);
	// const options = [...emails, NOTIFICATION.USE_DIFFERENT_ACCOUNT];
	// vscode.window.showInformationMessage(
	// 	NOTIFICATION.CHOOSE_ACCOUNT,
	// 	...options)
	// 	.then(async selection => {
	// 		if (selection === NOTIFICATION.USE_DIFFERENT_ACCOUNT) {
	// 			(global as any).skipAskConnect = true;
	// 			return logout();
	// 		}
	// 	const index = validUsers.findIndex(user => user.email === selection);
	// 	const user = validUsers[index];
	// 	// We have token, repoPath Trigger Init
	// 	await syncRepo(repoPath, user.access_token);
	// });
};

export const askPublicPrivate = async (repoPath: string) => {
	const msg = getPublicPrivateMsg(repoPath);
	const buttonSelected = await vscode.window.showInformationMessage(msg, { modal: true }, ...[
		NOTIFICATION.PUBLIC,
		NOTIFICATION.PRIVATE
	]).then(selection => selection);
	return buttonSelected;
};

export const showSyncIgnoredRepo = (repoPath: string, parentRepoPath: string) => {
	const msg = getDirectorySyncIgnoredMsg(repoPath, parentRepoPath);
	vscode.window.showInformationMessage(msg, 
		NOTIFICATION.OPEN_SYNCIGNORE, 
		NOTIFICATION.TRACK_PARENT_REPO, 
		NOTIFICATION.UNSYNC_PARENT_REPO).then(async selection => {
		if (!selection) { return; }
		switch (selection) {
			case NOTIFICATION.TRACK_PARENT_REPO:
				trackRepoHandler();
				break;
			case NOTIFICATION.OPEN_SYNCIGNORE:
				openSyncIgnoreHandler();
				break;
			case NOTIFICATION.UNSYNC_PARENT_REPO:
				unSyncHandler();
				break;
			default:
			}
		});
};
