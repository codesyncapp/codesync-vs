import * as vscode from 'vscode';
import { NOTIFICATION_CONSTANTS } from '../constants';
import { createAuthorizeUrl } from './login_utils';


export function showSignUpButtons(port: number) { 
	vscode.window.showInformationMessage(
		NOTIFICATION_CONSTANTS.WELCOME_MSG, ...[
		NOTIFICATION_CONSTANTS.JOIN, 
		NOTIFICATION_CONSTANTS.IGNORE
	]).then(async selection => {
		if (selection === NOTIFICATION_CONSTANTS.JOIN) {
			vscode.env.openExternal(vscode.Uri.parse(createAuthorizeUrl(port)));
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