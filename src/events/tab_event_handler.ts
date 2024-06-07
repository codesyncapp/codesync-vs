import yaml from "js-yaml";
import vscode from 'vscode';
import path from 'path';
import fs from 'fs';

import { VSCODE } from "../constants";
import { ITab } from "../interface";
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

	handleTabChangeEvent = (isTabEvent: boolean) => {
		if(!this.repoPath) return;
		// Discard event if file is changed 
		if (!isTabEvent) return;

		// Record timestamp
		const created_at = formatDatetime(new Date().getTime());
		// For the current open repoPath, get the repo_id and from config File
		const configUtils = new ConfigUtils();
		console.log("repo path: ", this.repoPath);
		const repoId = configUtils.getRepoIdByPath(this.repoPath);
		console.log("repo id: ", repoId);
		if (!repoId) return
		// console.log(`Repo ID: ${repoId}`)
		const configJSON = configUtils.config;

		// Get list of current tabs
		const open_tabs = vscode.window.tabGroups.all;
		const tabs: any[] = [];
		// Loop through tab groups
		for (const tab_group of open_tabs) {
			for (let tab of tab_group.tabs) {
				// console.log(`Displaying tabs: `, tab);
				// Get path of tab
				// @ts-ignore
				const fileRelativePath = (tab.input.uri.path).split(`${this.repoPath}${path.sep}`)[1];
				console.log("File Name: ", fileRelativePath);
				// Get file ID using path
				const fileId = configUtils.getFileIdByPath(this.repoPath, this.branch, fileRelativePath);
				// console.log("File ID: ", fileId);
				tabs.push({"file_id": fileId, "path": fileRelativePath});
			}
		}
		// Adding to buffer
		this.addToBuffer(repoId, created_at, tabs);
	}

	addToBuffer = (repoId: number, created_at: string, tabs: any[]) => {
		const newTab = <ITab>{};
		// Structuring tab data
		newTab.repo_id = repoId;
		newTab.created_at = created_at;
		newTab.source = VSCODE;
		newTab.file_name = `${new Date().getTime()}.yml`
		newTab.tabs = tabs;
		console.log("newTab: ", yaml.dump(newTab));

		// Dump data in the buffer
		const tabFilePath = path.join(this.settings.TABS_PATH, newTab.file_name);	
		fs.writeFileSync(tabFilePath, yaml.dump(newTab));
	}


}