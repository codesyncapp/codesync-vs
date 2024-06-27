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
import { CodeSyncLogger } from "../logger";
import { TabValidator } from "../codesyncd/validators/tab_validator";

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

	handleTabChangeEvent = (isTabEvent: boolean = true) => {
		if (!this.repoPath || !isTabEvent) return;
		// Record timestamp
		const created_at = formatDatetime(new Date().getTime());
		// For the current open repoPath, get the repo_id and from config File
		const configUtils = new ConfigUtils();
		const repoId = configUtils.getRepoIdByPath(this.repoPath);
		if (!repoId) return

		// Get list of current tabs
		const open_tabs = vscode.window.tabGroups.all;
		const tabs: ITabFile[] = open_tabs.flatMap(tab_group => 
			tab_group.tabs.map(tab => {
				// Get path of tab
				// @ts-ignore
				const tabFilePath = tab.input.uri.path;
				const splitPath = tabFilePath.split(`${this.repoPath}${path.sep}`);
				if (splitPath.length == 1) {
					CodeSyncLogger.info(`File from other repo detected, Skipping invalid tab: ${tabFilePath}`);
					return null;
				}
				const tabValidator = new TabValidator();
				if (!tabValidator.validateRepo(this.repoPath)) return;
				if (splitPath.length ==2) {
				// Get file ID using path
				const fileId = configUtils.getFileIdByPath(this.repoPath, this.branch, tabFilePath);
				const is_active_tab: boolean = tab.isActive;
				return { file_id: fileId, path: splitPath[1], is_active_tab: is_active_tab };
				} else {
					return null;
				}
			})
		).filter((tab): tab is ITabFile => tab !== null); // Filter out null values

		// If no tabs found
		if (tabs.length == 0) return;

		// Adding to buffer
		this.addToBuffer(repoId, created_at, tabs);

	}

	addToBuffer = (repoId: number, created_at: string, tabs: ITabFile[]) => {
		const newTab = <ITabYML>{};
		// Structuring tab data
		newTab.repository_id = repoId;
		newTab.created_at = created_at;
		newTab.source = VSCODE;
		newTab.file_name = `${new Date().getTime()}.yml`
		newTab.tabs = tabs;
		// Dump data in the buffer
		const tabFilePath = path.join(this.settings.TABS_PATH, newTab.file_name);
		fs.writeFileSync(tabFilePath, yaml.dump(newTab));
	}
}
