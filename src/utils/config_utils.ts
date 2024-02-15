import fs from 'fs';
import { generateSettings } from "../settings";
import { readYML } from "./common";

export class ConfigUtils {
	config: any;
	
	constructor() {
		const settings = generateSettings();
		this.config = fs.existsSync(settings.CONFIG_PATH) ? readYML(settings.CONFIG_PATH) : null;
	}

	isConfigValid () {
		return this.config && this.config.repos;
	}

	getRepoPathByRepoId = (repoId: number) => {
		if (!this.isConfigValid()) return "";
		const repoPath = Object.keys(this.config.repos).find(repoPath => {
			const _repoConfig = this.config.repos[repoPath];
			return _repoConfig.id == repoId;
		});
		return repoPath;
	}
}
