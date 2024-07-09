import fs from "fs";
import path from "path";

import { ITabYML } from "../../interface";
import {generateSettings} from "../../settings";
import { removeTabFile } from "../../utils/tab_utils";
import { isRelativePath } from "../utils";

export class TabHandler {
	
	constructor() {}
	
	static createTabToSend(tabData: ITabYML) {
		return {
			repository_id : tabData.repository_id,
			created_at : tabData.created_at,
			source : tabData.source,
			file_name : tabData.file_name,
			tabs : tabData.tabs,
			};
	}

	static removeTabFile(tabFileName: string) {
		const settings = generateSettings();
		const tabFilePath = path.join(settings.TABS_PATH, tabFileName);
		const relative = path.relative(settings.TABS_PATH, tabFilePath);
		const isRelative = isRelativePath(relative);
		if (!(isRelative && fs.existsSync(tabFilePath))) return;
		removeTabFile(tabFilePath, "removeTabFile");
	}

}
