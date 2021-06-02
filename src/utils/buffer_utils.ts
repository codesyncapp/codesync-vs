import * as yaml from 'js-yaml';

import { IDiff } from "../interface";
import { DIFF_SIZE_LIMIT, REQUIRED_DIFF_KEYS, REQUIRED_DIR_RENAME_DIFF_KEYS, REQUIRED_FILE_RENAME_DIFF_KEYS } from "../constants";


export const isValidDiff = (diffData: IDiff) => {
	const missingKeys = REQUIRED_DIFF_KEYS.filter(key => !(key in diffData));
	if (missingKeys.length) { return false; }
	const isRename = diffData.is_rename;
	const isDirRename = diffData.is_dir_rename;
	const diff = diffData.diff;
	if (diff && diff.length > DIFF_SIZE_LIMIT) { return false; }
	if (isRename || isDirRename) {
		if (!diff) { return false; }
		let diffJSON = {};
		try {
			diffJSON = yaml.load(diff);
		} catch (e) {
			return false;
		}
		if (isRename) {
			const missingRenameKeys = REQUIRED_FILE_RENAME_DIFF_KEYS.filter(key => !(key in diffJSON));
			if (missingRenameKeys.length) { return false; }
		}
		if (isDirRename) {
			const missingDirRenameKeys = REQUIRED_DIR_RENAME_DIFF_KEYS.filter(key => !(key in diffJSON));
			if (missingDirRenameKeys.length) { return false; }
		}
	}
	return true;
};
