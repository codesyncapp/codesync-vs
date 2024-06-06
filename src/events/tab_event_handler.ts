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
import { CodeSyncLogger } from "../logger";

export class tabEventHandler {
	repoPath = "";
	branch = "";
	pathUtils: any;
	newTab = <ITab>{};

	// Diff props
	settings = generateSettings();
	shouldProceed = false;

	constructor(repoPath="") {
		const userState = new UserState();
		const isValidAccount = userState.isValidAccount();
		this.repoPath = repoPath || pathUtils.getRootPath();
		const repoState = new RepoState(this.repoPath).get();
		const repoIsConnected = repoState.IS_CONNECTED;
		this.shouldProceed = isValidAccount && repoIsConnected;
		if (!this.shouldProceed) return;
		this.branch = getBranch(this.repoPath);
		this.pathUtils = new pathUtils(this.repoPath, this.branch);
	}

	handleTabChangeEvent = () => {
		// Record timestamp
		const created_at = new Date().getTime();
		// For the current open repoPath, get the repo_id and from config File
		const configUtils = new ConfigUtils();
		const repoId = configUtils.getRepoIdByPath(this.repoPath);
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
				const fileRelativePath = this.pathUtils.getFileRelativePath(tab.input.uri.path);
				// console.log("File Name: ", fileRelativePath);
				// Get file ID using path
				const fileId = configUtils.getFileIdByPath(this.repoPath, this.branch, fileRelativePath);
				// console.log("File ID: ", fileId);
				tabs.push({"file_id": fileId, "path": fileRelativePath});
			}
		}
		const tabsJSON = JSON.stringify(tabs);
		// Structuring tab data
		if (!repoId) return
		this.newTab.repo_id = repoId;
		this.newTab.created_at = formatDatetime(created_at);
		this.newTab.source = VSCODE;
		this.newTab.file_name = `${new Date().getTime()}.yml`
		this.newTab.tabs = tabsJSON;
		console.log("newTab: ", yaml.dump(this.newTab));

		// Dump data in the buffer
		const tabFilePath = path.join(this.settings.TABS_PATH, this.newTab.file_name);
		this.addToBuffer(tabFilePath);

	}

	addToBuffer = (tabFilePath: string) => {
		try {
			fs.writeFileSync(tabFilePath, yaml.dump(this.newTab));
		} catch (e) {
			CodeSyncLogger.error(`Error while dumping tab data: ${e}`);
		}
	}


}