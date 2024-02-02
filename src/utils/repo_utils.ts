import fs from 'fs';
import { generateSettings } from "../settings";
import { checkSubDir, getBranch, isUserActive, readYML } from "./common";
import { IRepoState } from '../interface';


export class RepoUtils {

	repoPath: string;
	config: any;

	constructor(repoPath: string, setConfig=true) {
		this.repoPath = repoPath;
		if (!setConfig) return;
		const settings = generateSettings();
		this.config = fs.existsSync(settings.CONFIG_PATH) ? readYML(settings.CONFIG_PATH) : null;
	}
	
	isConfigValid () {
		return this.repoPath && this.config && this.config.repos;
	}

	isRepoUserActive = (email: string) => {
		const settings = generateSettings();
		if (!fs.existsSync(settings.USER_PATH)) return false;
		// Return if user hasn't synced the repo
		const users = readYML(settings.USER_PATH) || {};
		const user = users[email];
		return isUserActive(user);
	};
	
	getState (checkFileIds=true) : IRepoState {
		/*
		Returns true if follwing conditions exist, and returns false otherwise 
		- if repoPath exists in config.yml 
		- Repo is not disconnected
		- Repo has at least 1 branch uploaded
		- Repo is assoicated with a user
		*/
		const repoState: IRepoState = {
			IS_CONNECTED: false,
			IS_DISCONNECTED: false,
			IS_SUB_DIR: false,
			IS_SYNC_IGNORED: false,
			IS_OPENED: !!this.repoPath,
			PARENT_REPO_PATH: ""
		};
		if (!this.isConfigValid()) return repoState;
		repoState.IS_OPENED = true;
		const result = checkSubDir(this.repoPath);
		repoState.IS_SUB_DIR = result.isSubDir;
		repoState.IS_SYNC_IGNORED = result.isSyncIgnored;
		if (result.isSubDir) {
			repoState.PARENT_REPO_PATH = result.parentRepo;
			if (result.isSyncIgnored) return repoState;
			this.repoPath = repoState.PARENT_REPO_PATH;
		}
		const repoConfig = this.config.repos[this.repoPath];
		if (!repoConfig) return repoState;
		if (repoConfig.is_disconnected) {
			repoState.IS_DISCONNECTED = true;
			return repoState;
		}
		if (!repoConfig.email || !this.isRepoUserActive(repoConfig.email)) return repoState;
		repoState.IS_CONNECTED = true;
		if (!checkFileIds) return repoState;
		const branch = getBranch(this.repoPath);
		// If branch is not uploaded, daemon will take care of that
		if (!(branch in repoConfig.branches)) return repoState;
		const configFiles = repoConfig.branches[branch];
		const invalidFiles = Object.keys(configFiles).filter(relPath => configFiles[relPath] === null);
		const hasNullIds = invalidFiles.length && invalidFiles.length === Object.keys(configFiles).length;
		if (hasNullIds) {
			repoState.IS_CONNECTED = false;
			return repoState; 
		}
		return repoState;
	}
}