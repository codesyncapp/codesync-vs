import * as vscode from 'vscode';
import {NOTIFICATION} from '../constants';
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

			showChooseAccount(repoPath);
		}
	});
};


export const showChooseAccount = (repoPath: string) => {
	// Check if access token is present against users
	const settings = generateSettings();
	const users = readYML(settings.USER_PATH);
	const validUsers: any[] = [];
	Object.keys(users).forEach(key => {
		const user = users[key];
		if (user.access_token) {
			validUsers.push({ email: key, access_token: user.access_token });
		}
	});

	if (validUsers.length === 0) {
		vscode.window.showErrorMessage(NOTIFICATION.NO_VALID_ACCOUNT);
		return;
	}

	const emails = validUsers.map(account => account.email);
	const options = [...emails, NOTIFICATION.USE_DIFFERENT_ACCOUNT];
	vscode.window.showInformationMessage(
		NOTIFICATION.CHOOSE_ACCOUNT,
		...options)
		.then(async selection => {
			if (selection === NOTIFICATION.USE_DIFFERENT_ACCOUNT) {
				(global as any).skipAskConnect = true;
				return logout();
			}
		const index = validUsers.findIndex(user => user.email === selection);
		const user = validUsers[index];
		// We have token, repoPath Trigger Init
		await syncRepo(repoPath, user.access_token);
	});
};

export const askPublicPrivate = async () => {
	const buttonSelected = await vscode.window.showInformationMessage(
		NOTIFICATION.PUBLIC_OR_PRIVATE,
		{ modal: true }, ...[
		NOTIFICATION.YES,
		NOTIFICATION.NO
	]).then(selection => selection);
	return buttonSelected;
};

export const askToUpdateSyncIgnore = async () => {
	const selectedValue = await vscode.window.showInformationMessage(
		NOTIFICATION.UPDATE_SYNCIGNORE,
		...[NOTIFICATION.OK, NOTIFICATION.CANCEL]
	).then(selection => selection);
	return selectedValue;
};
