import yaml from "js-yaml";
import vscode from 'vscode';
import path from 'path';
import fs from 'fs';

import { VSCODE } from "../constants";
import { ITabYML, ITabFile } from "../interface";
import { formatDatetime, getBranch } from "../utils/common";
import { ConfigUtils } from "../utils/config_utils";
import { pathUtils } from "../utils/path_utils";
import { generateSettings } from "../settings";
import { RepoState } from "../utils/repo_state_utils";
import { UserState } from "../utils/user_utils";
import { CODESYNC_STATES, CodeSyncState } from "../utils/state_utils";
import { CodeSyncLogger } from "../logger";

export class tabEventHandler {
	repoPath = "";
	branch = "";
	pathUtils: any;

	// Diff props
	settings = generateSettings();
	shouldProceed = false;

	constructor(repoPath = "") {
		const userState = new UserState();
		const isValidAccount = userState.isValidAccount();
		this.repoPath = repoPath || pathUtils.getRootPath();
		if (!this.repoPath) return;
		const repoState = new RepoState(this.repoPath).get();
		const repoIsConnected = repoState.IS_CONNECTED;
		this.shouldProceed = isValidAccount && repoIsConnected;
		if (!this.shouldProceed) return;
		this.branch = getBranch(this.repoPath);
		this.pathUtils = new pathUtils(this.repoPath, this.branch);
	}

	handleTabChangeEvent = (createdAt: string, isTabEvent: boolean = true) => {
		if (!isTabEvent || !this.shouldProceed) return CodeSyncState.set(CODESYNC_STATES.ACTIVE_TAB_PATH, false);
		// For the current open repoPath, get the repo_id and from config File
		const configUtils = new ConfigUtils();
		const repoId = configUtils.getRepoIdByPath(this.repoPath);
		if (!repoId) return
		// Get list of current tabs
		const openTabs = vscode.window.tabGroups.all;
	try {	
			const tabs: ITabFile[] = openTabs.flatMap(tabGroup => 
			tabGroup.tabs.map(tab => {
				// @ts-ignore
				if (!tab.input || !tab.input?.uri || !tab.input?.uri.path) return null;
				// Get path of tab
				// @ts-ignore
				const tabFilePath = tab.input?.uri.path;
				const splitPath = tabFilePath.split(`${this.repoPath}${path.sep}`);
				if (splitPath.length === 2) {
					// Get file ID using path
					const fileId = configUtils.getFileIdByPath(this.repoPath, this.branch, tabFilePath);
					const isActiveTab: boolean = tab.isActive;
					return { file_id: fileId, path: splitPath[1], is_active_tab: isActiveTab };
				} else {
					return null;
				}
			}
		)
		).filter((tab): tab is ITabFile => tab !== null); // Filter out null values
		// If no tabs found
		if (tabs.length === 0) return;
		// Adding to buffer
		this.addToBuffer(repoId, createdAt, tabs);
	} catch(error) {
		CodeSyncLogger.error(`[handleTabChangeEvent] Error processing tabs, error: ${error}`);
	}
	}

	addToBuffer = (repoId: number, createdAt: string, tabs: ITabFile[]) => {
		const newTab = <ITabYML>{};
		// Structuring tab data
		newTab.repository_id = repoId;
		newTab.created_at = createdAt;
		newTab.source = VSCODE;
		newTab.file_name = `${new Date().getTime()}.yml`
		newTab.tabs = tabs;
		// Dump data in the buffer
		const tabFilePath = path.join(this.settings.TABS_PATH, newTab.file_name);
		fs.writeFileSync(tabFilePath, yaml.dump(newTab));
	}
}
