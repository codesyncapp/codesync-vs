import fs from "fs";
import vscode from 'vscode';
import yaml from "js-yaml";

import {
	contextVariables,
	getRepoDisconnectedMsg,
	getRepoReconnectedMsg,
	NOTIFICATION
} from '../constants';
import { readYML } from '../utils/common';
import { updateRepo } from '../utils/sync_repo_utils';
import { generateSettings } from "../settings";
import { pathUtils } from "../utils/path_utils";

import { RepoState } from "../utils/repo_state_utils";
import { IRepoState } from "../interface";

export class RepoCommandsHandler {
	repoPath: string;
	repoStateUtils: any;
	repoState: IRepoState;
	settings: any;

	constructor() {
		this.repoPath = pathUtils.getRootPath();
		this.repoStateUtils = new RepoState(this.repoPath);
		this.repoState = this.repoStateUtils.get();
		this.settings = generateSettings();
	}

	writeToConfig = () => {
		fs.writeFileSync(this.settings.CONFIG_PATH, yaml.dump(this.repoStateUtils.config));
	}
}

export class RepoDisconnectHandler extends RepoCommandsHandler {

	run = async () => {
		if (!this.repoPath) return;
		let msg = NOTIFICATION.REPO_DISCONNECT_CONFIRMATION;
		if (RepoState.isSubDir()) {
			this.repoPath = RepoState.getParentRepo();
			msg = NOTIFICATION.REPO_DISCONNECT_PARENT_CONFIRMATION;
		}
		vscode.window.showWarningMessage(msg, NOTIFICATION.YES, NOTIFICATION.CANCEL)
		.then(async selection => {
			await this.postSelection(selection);
		});
	};
	
	postSelection = async (selection?: string) => {
		if (!selection || selection !== NOTIFICATION.YES || this.repoState.IS_DISCONNECTED) {
			return;
		}
		const configRepo = this.repoStateUtils.config.repos[this.repoPath];
		const users = readYML(this.settings.USER_PATH);
		const accessToken = users[configRepo.email].access_token;
		const json = await updateRepo(accessToken, configRepo.id, { is_in_sync: false });
		if (json.error) {
			vscode.window.showErrorMessage(NOTIFICATION.REPO_DISCONNECT_FAILED);
			return;
		}
		// Show notification that repo is disconnected
		configRepo.is_disconnected = true;
		this.writeToConfig();
		// TODO: Maybe should delete repo from .shadow and .originals?
		vscode.commands.executeCommand('setContext', contextVariables.showConnectRepoView, false);
		vscode.commands.executeCommand('setContext', contextVariables.isSubDir, false);
		vscode.commands.executeCommand('setContext', contextVariables.isSyncIgnored, false);
		vscode.commands.executeCommand('setContext', contextVariables.isDisconnectedRepo, true);
		const msg = getRepoDisconnectedMsg(this.repoPath);
		vscode.window.showInformationMessage(msg);
	};
}

export class RepoReconnectHandler extends RepoCommandsHandler {

	run = async () => {
		if (!this.repoPath) return;
		if (this.repoState.IS_CONNECTED) return;
		const configRepo = this.repoStateUtils.config.repos[this.repoPath];
		const users = readYML(this.settings.USER_PATH);
		const accessToken = users[configRepo.email].access_token;
		const json = await updateRepo(accessToken, configRepo.id, { is_in_sync: true });
		if (json.error) {
			vscode.window.showErrorMessage(NOTIFICATION.REPO_RECONNECT_FAILED);
			return;
		}
		// Show notification that repo is reconnected
		configRepo.is_disconnected = false;
		this.writeToConfig();
		vscode.commands.executeCommand('setContext', contextVariables.showConnectRepoView, false);
		vscode.commands.executeCommand('setContext', contextVariables.isDisconnectedRepo, false);
		const msg = getRepoReconnectedMsg(this.repoPath);
		vscode.window.showInformationMessage(msg);
	};
}
