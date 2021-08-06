import * as fs from 'fs';
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { COMMAND, STATUS_BAR_MSGS } from "../constants";

export const readFile = (filePath: string) => {
	return fs.readFileSync(filePath, "utf8");
};

export const readYML = (filePath: string) => {
	try {
		return yaml.load(readFile(filePath));
	} catch (e) {
		return;
	}
};

export const updateStatusBarItem = (statusBarItem: vscode.StatusBarItem, text: string) => {
	if (text === STATUS_BAR_MSGS.AUTHENTICATION_FAILED) {
		statusBarItem.command = COMMAND.triggerSignUp;
	} else if (text === STATUS_BAR_MSGS.CONNECT_REPO) {
		statusBarItem.command = COMMAND.triggerSync;
	} else {
		statusBarItem.command = undefined;
	}
	statusBarItem.text = text;
	statusBarItem.show();
};

export const isRepoActive = (config: any, repoPath: string) => {
	return repoPath in config.repos && !config.repos[repoPath].is_disconnected;
};
