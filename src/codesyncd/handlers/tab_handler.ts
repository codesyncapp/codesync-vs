import fs from "fs";
import os from "os";
import path from "path";

import { ITab, ITabFile, ITabToSend } from "../../interface";
import {generateSettings} from "../../settings";
import {readYML} from "../../utils/common";
import {CodeSyncLogger} from "../../logger";
import {pathUtils} from "../../utils/path_utils";
import {initUtils} from "../../init/utils";
import {VSCODE} from "../../constants";
import { removeTabFile } from "../../utils/tab_utils";

export class TabHandler {
    accessToken: string;
	tabData: ITab;
	tabFilePath: string;
	repoPath: string;

	repo_id: number;
	created_at: string;
	source: string;
	file_name: string;
	tabs: ITabFile[];

	configJSON: any;
    configRepo: any;

	constructor(
		tabData: ITab,
		tabFilePath: string,
		repoPath: string,
		accessToken: string
	) {
		this.accessToken = accessToken;
		this.tabData = tabData;
		this.repo_id = tabData.repo_id;
		this.created_at = tabData.created_at;
		this.source = tabData.source;
		this.file_name = tabData.source;
		this.tabs = tabData.tabs;
		this.tabFilePath = tabFilePath;
		this.repoPath = repoPath

		const settings = generateSettings();
        this.configJSON = readYML(settings.CONFIG_PATH);
        this.configRepo = this.configJSON.repos[this.repoPath];
	}

	createTabToSend() {
		return {
			'repo_id': this.repo_id,
			'created_at': this.created_at,
			'source': this.source,
			'file_name': this.file_name,
			'tabs': this.tabs,
		};
	}

	sendTabsToServer(webSocketConnection: any, tabToSend: ITabToSend) {
		// Send tab to server
		webSocketConnection.send(JSON.stringify({'tabs': [tabToSend]}));
	}

	cleanTabFile() {
		TabHandler.removeTabFile(this.tabFilePath);
	}

	static removeTabFile(tabFilePath: string) {
		const settings = generateSettings();
		const relative = path.relative(settings.TABS_PATH, tabFilePath);
		const isRelative = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        if (!(isRelative && fs.existsSync(tabFilePath))) return;
        removeTabFile(tabFilePath, "removeTabFile");

	}
}