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
import { isRelativePath } from "../utils";

export class TabHandler {
	
	constructor() {}

	createTabToSend(tabData: ITabYML) {
		return {
			repository_id : tabData.repository_id,
			created_at : tabData.created_at,
			source : tabData.source,
			file_name : tabData.file_name,
			tabs : tabData.tabs,
			};
	}

	cleanTabFile(tabFilePath: string) {
		TabHandler.removeTabFile(tabFilePath);
	}

	static removeTabFile(tabFileName: string) {
		const settings = generateSettings();
		const tabFilePath = path.join(settings.TABS_PATH, tabFileName);
		const relative = path.relative(settings.TABS_PATH, tabFilePath);
		const is_relative = isRelativePath(relative);
        if (!(is_relative && fs.existsSync(tabFilePath))) return;
		removeTabFile(tabFilePath, "removeTabFile");
	}

}
