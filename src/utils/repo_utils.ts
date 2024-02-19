import vscode from 'vscode';
import { checkSubDir, getBranch } from "./common";
import { IRepoPlanLimitState, IRepoState } from '../interface';
import { ConfigUtils } from './config_utils';
import { UserUtils } from './user_utils';
import { CODESYNC_STATES, CodeSyncState } from "./state_utils";
import { RETRY_REQUEST_AFTER, contextVariables } from "../constants";
import { pathUtils } from './path_utils';


export class RepoUtils {

	repoPath: string;
	config: any;

	constructor(repoPath: string) {
		this.repoPath = repoPath;
		const configUtils = new ConfigUtils();
		this.config = configUtils.config;
	}
	
	get (checkFileIds=true) : IRepoState {
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
		if (!this.config) return repoState;
		const result = checkSubDir(this.repoPath);
		repoState.IS_SUB_DIR = result.isSubDir;
		repoState.IS_SYNC_IGNORED = result.isSyncIgnored;
		if (result.isSubDir) {
			repoState.IS_CONNECTED = true;
			repoState.PARENT_REPO_PATH = result.parentRepo;
			if (result.isSyncIgnored) return repoState;
			this.repoPath = repoState.PARENT_REPO_PATH;
		}
		const repoConfig = this.config.repos[this.repoPath];
		if (!repoConfig || !repoConfig.id) return repoState;
		if (repoConfig.is_disconnected) {
			repoState.IS_DISCONNECTED = true;
			return repoState;
		}
		const userUtils = new UserUtils();
		if (!repoConfig.email || !userUtils.isUserActive(repoConfig.email)) return repoState;
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

export class RepoPlanLimitsState {

	repoPath: string;
	planLimitKey: string;
	requestSentAtKey: string;
	canAvailTrailKey: string;

	constructor(repoPath: string) {
		this.repoPath = repoPath;
		this.planLimitKey = `${this.repoPath}:planLimitReached`;
		this.requestSentAtKey = `${this.repoPath}:requestSentAt`;
		this.canAvailTrailKey = `${this.repoPath}:canAvailTrial`;
	}
	
	get = (): IRepoPlanLimitState => {
		const state = <IRepoPlanLimitState>{};
		state.planLimitReached = CodeSyncState.get(this.planLimitKey);
		const requestSentAt = CodeSyncState.get(this.requestSentAtKey);
		state.canRetry = requestSentAt && (new Date().getTime() - requestSentAt) > RETRY_REQUEST_AFTER;
		return state;
	}

	set = (canAvailTrial: boolean): void => {
		CodeSyncState.set(this.planLimitKey, true);
		CodeSyncState.set(this.requestSentAtKey, new Date().getTime());
		CodeSyncState.set(this.canAvailTrailKey, canAvailTrial);
	}

	reset = (): void => {
		// Reset state for given repoPath
		CodeSyncState.set(this.planLimitKey, false);
		CodeSyncState.set(this.requestSentAtKey, "");
		CodeSyncState.set(this.canAvailTrailKey, false);
		const currentRepoPath = pathUtils.getRootPath();
		// Reset state for currently opened repo
		if (this.repoPath === currentRepoPath) {
			vscode.commands.executeCommand('setContext', contextVariables.upgradePricingPlan, false);
			vscode.commands.executeCommand('setContext', contextVariables.canAvailTrial, false);
			CodeSyncState.set(CODESYNC_STATES.PRICING_URL, "");
			CodeSyncState.set(CODESYNC_STATES.CAN_AVAIL_TRIAL, false);	
		}
	}
}
