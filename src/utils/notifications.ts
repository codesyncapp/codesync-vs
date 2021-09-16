import vscode from 'vscode';
import {getPublicPrivateMsg, NOTIFICATION} from '../constants';
import { syncRepo } from '../init/init_handler';
import { readYML } from './common';
import { logout, redirectToBrowser } from './auth_utils';
import {generateSettings} from "../settings";

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
		syncRepo(repoPath, accessToken);
		(global as any).skipAskConnect = false;
		return;
	}
	const msg = email ? NOTIFICATION.CONNECT_AFTER_JOIN : NOTIFICATION.CONNECT_REPO;
	vscode.window.showInformationMessage(msg, ...[
		NOTIFICATION.CONNECT,
		NOTIFICATION.IGNORE
	]).then(async selection => {
		if (selection === NOTIFICATION.CONNECT) {

			if (email && accessToken) {
				await syncRepo(repoPath, accessToken);
				return;
			}

			await showChooseAccount(repoPath);
		}
	});
};


export const showChooseAccount = async (repoPath: string) => {
	// Check if access token is present against users
	const settings = generateSettings();
	const users = readYML(settings.USER_PATH);
	const validUsers: any[] = [];
	Object.keys(users).forEach(email => {
		const user = users[email];
		if (user.access_token) {
			validUsers.push({ email, access_token: user.access_token });
		}
	});

	if (validUsers.length === 0) {
		vscode.window.showErrorMessage(NOTIFICATION.NO_VALID_ACCOUNT);
		return;
	}

	// By Default choosing first account
	const user = validUsers[0];
	await syncRepo(repoPath, user.access_token);
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

export const askToUpdateSyncIgnore = async (syncignoreExists: boolean) => {
	const msg = syncignoreExists ? NOTIFICATION.UPDATE_SYNCIGNORE : NOTIFICATION.SYNC_IGNORE_CREATED;
	const selectedValue = await vscode.window.showInformationMessage(
		msg,
		NOTIFICATION.OK
	).then(selection => selection);
	return selectedValue;
};
