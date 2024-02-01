import fs from 'fs';
import { generateSettings } from "../settings";
import { checkSubDir, getBranch, isEmpty, isUserActive, readYML } from "./common";
import { CODESYNC_STATES, CodeSyncState } from './state_utils';

export const RepoState = {
	CONNECTED: "CONNECTED",
	NOT_CONNECTED: "NOT_CONNECTED",
	DISCONNECTED: "DISCONNECTED"
};

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
	
	isRepoConnected (checkFileIds=true) {
		/*
		Returns true if follwing conditions exist, and returns false otherwise 
		- if repoPath exists in config.yml 
		- Repo is not disconnected
		- Repo has at least 1 branch uploaded
		- Repo is assoicated with a user
		*/
		// Set RepoState to be NOT_CONNCECTED by default
		this.setState(RepoState.NOT_CONNECTED);
		if (!this.isConfigValid()) return false;
		const result = checkSubDir(this.repoPath);
		if (result.isSubDir) {
			if (result.isSyncIgnored) return false;
			this.repoPath = result.parentRepo;
		}
		const repoConfig = this.config.repos[this.repoPath];
		if (!repoConfig) return false;
		if (repoConfig.is_disconnected) {
			this.setState(RepoState.DISCONNECTED);
			return false;
		}
		if (!repoConfig.email || !this.isRepoUserActive(repoConfig.email)) return false;
		this.setState(RepoState.CONNECTED);
		if (!checkFileIds) return true;
		const branch = getBranch(this.repoPath);
		// If branch is not uploaded, daemon will take care of that
		if (!(branch in repoConfig.branches)) return true;
		const configFiles = repoConfig.branches[branch];
		const invalidFiles = Object.keys(configFiles).filter(relPath => configFiles[relPath] === null);
		const hasNullIds = invalidFiles.length && invalidFiles.length === Object.keys(configFiles).length;
		if (hasNullIds) {
			this.setState(RepoState.NOT_CONNECTED);
			return false; 
		}
		return true;
	}

	setState(state: string) {
		CodeSyncState.set(CODESYNC_STATES.REPO_STATE, state);
	}

	getState() {
		return CodeSyncState.get(CODESYNC_STATES.REPO_STATE);
	}

}