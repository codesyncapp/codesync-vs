import fs from "fs";
import os from "os";
import path from "path";

import { ITabYML } from "../../interface";
import {generateSettings} from "../../settings";
import {readYML} from "../../utils/common";
import {CodeSyncLogger} from "../../logger";
import {pathUtils} from "../../utils/path_utils";
import {initUtils} from "../../init/utils";
import {VSCODE} from "../../constants";
import { removeTabFile } from "../../utils/tab_utils";
import { isRelative } from "../utils";

export class TabHandler {
    accessToken: string;
	tabData: ITabYML;
	tabFilePath: string;

	configJSON: any;

	constructor(
		tabData: ITabYML,
		tabFilePath: string | null = null,
		accessToken: string
	) {
		this.accessToken = accessToken;
		this.tabData = tabData;
		// @ts-ignore
		this.tabFilePath = tabFilePath;


		const settings = generateSettings();
        this.configJSON = readYML(settings.CONFIG_PATH);
	}

	createTabToSend() {
		return {
			repository_id : this.tabData.repository_id,
			created_at : this.tabData.created_at,
			source : this.tabData.source,
			file_name : this.tabData.file_name,
			tabs : this.tabData.tabs,
			};
	}

	cleanTabFile() {
		TabHandler.removeTabFile(this.tabFilePath);
	}

	static removeTabFile(tabFilePath: string) {
		const settings = generateSettings();
		const relative = path.relative(settings.TABS_PATH, tabFilePath);
		const is_relative = isRelative(relative);
        if (!(is_relative && fs.existsSync(tabFilePath))) return;
        removeTabFile(tabFilePath, "removeTabFile");
	}

}