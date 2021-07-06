import * as vscode from 'vscode';
import { NOTIFICATION, USER_PATH } from '../constants';
import { syncRepo } from '../init_handler';
import { readYML } from './common';
import { logout, redirectToBrowser } from './login_utils';


export const showSignUpButtons = (port: number) => { 
	vscode.window.showInformationMessage(
		NOTIFICATION.WELCOME_MSG, ...[
		NOTIFICATION.JOIN, 
		NOTIFICATION.IGNORE
	]).then(async selection => {
		if (selection === NOTIFICATION.JOIN) {
			redirectToBrowser(port);
		}
	});
};

export const showConnectRepo = (repoPath: string, email="", accessToken="", port=0, skipAskConnect=false) => { 
	if (skipAskConnect && email && accessToken) {
		syncRepo(repoPath, accessToken, port);
		return;
	}
	const msg = email ? NOTIFICATION.CONNECT_AFTER_JOIN : NOTIFICATION.CONNECT_REPO;
	vscode.window.showInformationMessage(msg, ...[
		NOTIFICATION.CONNECT, 
		NOTIFICATION.IGNORE
	]).then(async selection => {
		if (selection === NOTIFICATION.CONNECT) {

			if (email && accessToken) {
				await syncRepo(repoPath, accessToken, port);
				return;
			}

			// Check if access token is present against users
			const users = readYML(USER_PATH);
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

			showChooseAccount(repoPath, validUsers, port);
		}
	});
};


export const showChooseAccount = (repoPath: string, accounts: any[], port: number) => {
	const emails = accounts.map(account => account.email);
	const options = [...emails, NOTIFICATION.USE_DIFFERENT_ACCOUNT];
	vscode.window.showInformationMessage(
		NOTIFICATION.CHOOSE_ACCOUNT, 
		...options)
		.then(async selection => {
			if (selection === NOTIFICATION.USE_DIFFERENT_ACCOUNT) {
				await logout(port);
				redirectToBrowser(port, true);
				return;
			}
		const index = accounts.findIndex(user => user.email === selection);
		const user = accounts[index];
		// We have token, repoPath Trigger Init
		await syncRepo(repoPath, user.access_token, port);
	});
};

export const askPublicPrivate = async() => {
	const buttonSelected = await vscode.window.showInformationMessage(
		NOTIFICATION.PUBLIC_OR_PRIVATE, ...[
		NOTIFICATION.YES, 
		NOTIFICATION.NO
	]).then(selection => selection);
	return buttonSelected;
};

export const askContinue = async () => {
	return await vscode.window.showInformationMessage(
		NOTIFICATION.UPDATE_SYNCIGNORE, ...[
		NOTIFICATION.CONTINUE, 
		NOTIFICATION.CANCEL
	])
	.then(selection => selection);
};