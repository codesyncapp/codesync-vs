/*
class TabValidator:
	validateRepoID()
	validate_yml_file()
	group_data()
*/

import { REQUIRED_TAB_KEYS, TAB_SIZE_LIMIT } from "../../constants";
import { ITabYML } from "../../interface";

export class TabValidator {

	constructor() {
	}

	validateRepoId() {

	}

	validateYMLFile(tabData: ITabYML){
		const missingKeys = REQUIRED_TAB_KEYS.filter(key => !(key in tabData));
		if (missingKeys) return false;
		const tabs = tabData.tabs;
		if (tabs && tabs.length > TAB_SIZE_LIMIT) return false;
		
		return true;
	}



}