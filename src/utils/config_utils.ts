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

	getRepoPathByRepoId = (repoId: number) : string => {
		if (!this.isConfigValid()) return "";
		const repoPath = Object.keys(this.config.repos).find(repoPath => {
			const _repoConfig = this.config.repos[repoPath];
			return _repoConfig.id == repoId;
		});
		return repoPath || "";
	}

	getRepoIdByPath = (repoPath: string): number | null => {
		if (!this.isConfigValid()) return null;
		const path: string | undefined = Object.keys(this.config.repos).find(path => {
			const _repoConfig = this.config.repos[path];
			return _repoConfig.id == this.config.repos[repoPath].id;
		})
		// @ts-ignore
		return this.config.repos[path].id || null;
	}

	getFileIdByPath = (repoPath: string, branchName: string, fileName: string): number | null => {
		if (!this.isConfigValid()) return null;
		const path: string | undefined = Object.keys(this.config.repos).find(path => {
			const _repoConfig = this.config.repos[path].branches[branchName];
			return _repoConfig[fileName] == this.config.repos[repoPath].branches[branchName][fileName];
		})
		// @ts-ignore
		return this.config.repos[path].branches[branchName][fileName];
	}
}

