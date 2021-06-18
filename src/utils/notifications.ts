import * as vscode from 'vscode';
import { Auth0URLs, NOTIFICATION_CONSTANTS } from '../constants';


export function showSignUpButtons() { 
	vscode.window.showInformationMessage(
		NOTIFICATION_CONSTANTS.WELCOME_MSG, ...[
		NOTIFICATION_CONSTANTS.JOIN, 
		NOTIFICATION_CONSTANTS.IGNORE
	]).then(async selection => {
		if (selection === NOTIFICATION_CONSTANTS.JOIN) {
			vscode.env.openExternal(vscode.Uri.parse(Auth0URLs.AUTHORIZE));
		}
	});
}

export function showConnectRepo() { 
	vscode.window.showInformationMessage(
		NOTIFICATION_CONSTANTS.CONNECT_REPO, ...[
		NOTIFICATION_CONSTANTS.CONNECT, 
		NOTIFICATION_CONSTANTS.IGNORE
	]).then(async selection => {
		if (selection === NOTIFICATION_CONSTANTS.CONNECT_REPO) {
			// Trigger init
		}
	});
}