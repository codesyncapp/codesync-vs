import * as vscode from 'vscode';
import { Auth0URLs, NOTIFICATION_CONSTANTS, USER_PATH } from '../constants';
import { syncRepo } from '../init_handler';
import { readYML } from './common';
import { createAuthorizeUrl } from './login_utils';


export const showSignUpButtons = async (port: number) => { 
	await vscode.window.showInformationMessage(
		NOTIFICATION_CONSTANTS.WELCOME_MSG, ...[
		NOTIFICATION_CONSTANTS.JOIN, 
		NOTIFICATION_CONSTANTS.IGNORE
	]).then(async selection => {
		if (selection === NOTIFICATION_CONSTANTS.JOIN) {
			vscode.env.openExternal(vscode.Uri.parse(createAuthorizeUrl(port)));
		}
	});
};

export const showConnectRepo = (repoPath: string) => { 
	vscode.window.showInformationMessage(
		NOTIFICATION_CONSTANTS.CONNECT_REPO, ...[
		NOTIFICATION_CONSTANTS.CONNECT, 
		NOTIFICATION_CONSTANTS.IGNORE
	]).then(async selection => {
		if (selection === NOTIFICATION_CONSTANTS.CONNECT) {
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
				vscode.window.showErrorMessage("No valid account found");
				return;
			}

			showChooseAccount(repoPath, validUsers);

		}
	});
};


export const showChooseAccount = (repoPath: string, accounts: any[]) => {
	const emails = accounts.map(account => account.email);
	vscode.window.showInformationMessage(
		NOTIFICATION_CONSTANTS.CHOOSE_ACCOUNT, ...emails, NOTIFICATION_CONSTANTS.USE_DIFFERENT_ACCOUNT).then(async selection => {
			if (selection === NOTIFICATION_CONSTANTS.USE_DIFFERENT_ACCOUNT) {
				// Trigger sign up
				return;
			}
		const index = accounts.findIndex(user => user.email === selection);
		const user = accounts[index];
		// We have token, repoPath Trigger Init
		await syncRepo(repoPath, user.access_token, user.email);
	});
};