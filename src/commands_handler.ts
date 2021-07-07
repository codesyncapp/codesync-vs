import * as vscode from 'vscode';
import { redirectToBrowser } from "./utils/login_utils";
import { showChooseAccount } from "./utils/notifications";

export const SignUpHandler = () => {
	redirectToBrowser();
};

export const SyncHandler = () => {
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath) { return; }
	showChooseAccount(repoPath);
};

export const unSyncHandler = () => {
	console.log("Unsync activated");
};
