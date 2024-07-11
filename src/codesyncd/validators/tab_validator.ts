import { REQUIRED_KEYS_TAB_FILE_YML, TAB_SIZE_LIMIT, VSCODE } from "../../constants";
import { ITabYML } from "../../interface";
import { generateSettings } from "../../settings";
import { readYML } from "../../utils/common";
import { UserState } from "../../utils/user_utils";

export class TabValidator {

	settings: any;
	configJSON: any;
	constructor() {
		this.settings = generateSettings();
		this.configJSON = readYML(this.settings.CONFIG_PATH);

	}

	validateRepo(repoPath: string) {
		const configRepo = this.configJSON.repos[repoPath];
		if (!configRepo) return false;
		const repoEmail = configRepo.email;
		// Remove tab if repo is disconnected
		if (configRepo.is_disconnected) return false;
		// Validate repo belongs to logged-in user
		const activeUser = new UserState().getUser();
		if (!activeUser || activeUser?.email !== repoEmail) return false;
		// If validation passes
		return true;
	}

	validateYMLFile(tabData: ITabYML) {
		const missingKeys = REQUIRED_KEYS_TAB_FILE_YML.filter(key => !(key in tabData));
		if (missingKeys.length > 0) return false;
		if (tabData.tabs && tabData.tabs.length > TAB_SIZE_LIMIT) return false;
		if (tabData.created_at && (typeof tabData.created_at) != "string") return false;
		if (tabData.repository_id && (typeof tabData.repository_id) != "number") return false;
		if (tabData.source && (tabData.source !== VSCODE)) return false;
		if (tabData.file_name && (typeof tabData.file_name != "string")) return false;

		return true;
	}
}
