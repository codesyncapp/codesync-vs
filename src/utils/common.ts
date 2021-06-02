import * as fs from 'fs';
import * as yaml from 'js-yaml';
import fetch from "node-fetch";

import { CODESYNC_ROOT, SHADOW_REPO, DIFFS_REPO, ORIGINALS_REPO, 
	DELETED_REPO, API_HEALTHCHECK } from "../constants";


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

export const checkServerDown = async () => {
	let isDown = false;
	const response = await fetch(API_HEALTHCHECK)
	.then(res => res.json())
    .then(json => json)
	.catch(err => isDown = true);
	return isDown || !response.status;
};
