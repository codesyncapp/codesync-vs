import * as fs from 'fs';
import * as yaml from 'js-yaml';

import { CODESYNC_ROOT, SHADOW_REPO, DIFFS_REPO, ORIGINALS_REPO, 
	DELETED_REPO } from "../constants";

export const readYML = (filePath: string) => {
	try {
		return yaml.load(fs.readFileSync(filePath, "utf8"));
	} catch (e) {
		return;
	}
};


export const initCodeSync = () => {
	const paths = [CODESYNC_ROOT, DIFFS_REPO, ORIGINALS_REPO, SHADOW_REPO, DELETED_REPO ];
	paths.forEach((path) => {
		if (!fs.existsSync(path)) {
			// Add file in originals repo
			fs.mkdirSync(path, { recursive: true });
		}
	});
};
