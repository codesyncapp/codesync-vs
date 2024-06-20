/*
class TabValidator:
	validateRepoID()
	validate_yml_file()
	group_data()
*/

import { REQUIRED_KEYS_TAB_FILE_YML, TAB_SIZE_LIMIT } from "../../constants";
import { ITabYML } from "../../interface";
import { CodeSyncLogger } from "../../logger";
import { generateSettings } from "../../settings";
import { readYML } from "../../utils/common";
import { ConfigUtils } from "../../utils/config_utils";
import { removeFile } from "../../utils/file_utils";

export class TabValidator {

	settings: any;
	configJSON: any;
	constructor() {
		this.settings = generateSettings();
        this.configJSON = readYML(this.settings.CONFIG_PATH);

	}

	validateRepo(tabFile: ITabYML, tabData: string, filePath: string, repoId: number) {
		const config_utils = new ConfigUtils();
		const repo_path = config_utils.getRepoPathByRepoId(repoId);
		const configRepo = this.configJSON.repos[repo_path];
		if (!configRepo) {
			CodeSyncLogger.info(`Removing tab: Skipping invalid tab: ${tabFile}`, "", tabData);
			removeFile(filePath, "getTabFiles");
			return false;
		}
		// Remove tab if repo is disconnected
		if (configRepo.is_disconnected) {
			CodeSyncLogger.error(`Removing tab: Repo ${repo_path} is disconnected`);
			removeFile(filePath, "getTabFiles");
			return false;
		}
		return true;
	}
	
	validateRepoId(tabData: ITabYML, repo_id: number) {
		console.log(`tabData.repo_id: ${tabData.repository_id}, repo_id: ${repo_id}`);
		if(tabData.repository_id === repo_id) {
			return true;
		}
		return false;
	}

	validateYMLFile(tabData: ITabYML){
		const missingKeys = REQUIRED_KEYS_TAB_FILE_YML.filter(key => !(key in tabData));
		if (missingKeys.length > 0) return false;
		if (tabData.tabs && tabData.tabs.length > TAB_SIZE_LIMIT) return false;
		if (tabData.created_at && (typeof tabData.created_at) != "string") return false;
		if (tabData.repository_id && (typeof tabData.repository_id) != "number") return false;
		if (tabData.source && (typeof tabData.source != "string")) return false;
		if (tabData.file_name && (typeof tabData.file_name != "string")) return false;
		
		return true;
	}
}
