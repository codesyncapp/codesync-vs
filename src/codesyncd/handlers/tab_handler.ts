import fs from "fs";
import path from "path";

import { ITabYML } from "../../interface";
import {generateSettings} from "../../settings";
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
