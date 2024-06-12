import yaml from "js-yaml";
import vscode from 'vscode';
import path from 'path';
import fs from 'fs';

import { VSCODE } from "../constants";
import { ITab, ITabFile } from "../interface";
import { formatDatetime, getBranch } from "../utils/common";
import { ConfigUtils } from "../utils/config_utils";
import { pathUtils } from "../utils/path_utils";
import { generateSettings } from "../settings";
import { RepoState } from "../utils/repo_state_utils";
import { UserState } from "../utils/user_utils";

export class tabEventHandler {
	repoPath = "";
	branch = "";
	pathUtils: any;

	// Diff props
	settings = generateSettings();
	shouldProceed = false;

	constructor(repoPath="") {
		const userState = new UserState();
		const isValidAccount = userState.isValidAccount();
		this.repoPath = repoPath || pathUtils.getRootPath();
		if(!this.repoPath) return;
		const repoState = new RepoState(this.repoPath).get();
		const repoIsConnected = repoState.IS_CONNECTED;
		this.shouldProceed = isValidAccount && repoIsConnected;
		if (!this.shouldProceed) return;
		this.branch = getBranch(this.repoPath);
		this.pathUtils = new pathUtils(this.repoPath, this.branch);
	}

	handleTabChangeEvent = (isTabEvent: boolean = true) => {
		if(!this.repoPath || !isTabEvent) return;
		// Record timestamp
		const created_at = formatDatetime(new Date().getTime());
		// For the current open repoPath, get the repo_id and from config File
		const configUtils = new ConfigUtils();
		const repoId = configUtils.getRepoIdByPath(this.repoPath);
		if (!repoId) return

		// Get list of current tabs
		const open_tabs = vscode.window.tabGroups.all;
		const tabs: ITabFile[] = [] = open_tabs.flatMap(tab_group => 
			tab_group.tabs.map(tab => {
				// Get path of tab
				// @ts-ignore
				const fileRelativePath = tab.input.uri.path;
				// Get file ID using path
				const fileId = configUtils.getFileIdByPath(this.repoPath, this.branch, fileRelativePath);
				return {file_id: fileId, path: fileRelativePath};
			})
		);
		// Adding to buffer
		this.addToBuffer(repoId, created_at, tabs);
	}

	addToBuffer = (repoId: number, created_at: string, tabs: ITabFile[]) => {
		const newTab = <ITab>{};
		// Structuring tab data
		newTab.repo_id = repoId;
		newTab.created_at = created_at;
		newTab.source = VSCODE;
		newTab.file_name = `${new Date().getTime()}.yml`
		newTab.tabs = tabs;

		// Dump data in the buffer
		const tabFilePath = path.join(this.settings.TABS_PATH, newTab.file_name);	
		fs.writeFileSync(tabFilePath, yaml.dump(newTab));
	}
}
