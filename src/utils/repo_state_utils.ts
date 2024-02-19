import vscode from 'vscode';
import { checkSubDir } from "./common";
import { IRepoPlanLimitState, IRepoState } from '../interface';
import { ConfigUtils } from './config_utils';
import { CODESYNC_STATES, CodeSyncState } from "./state_utils";
import { RETRY_REQUEST_AFTER, SHOW_PLAN_UPGRADE_MSG_AFTER, contextVariables } from "../constants";
import { pathUtils } from './path_utils';


export class RepoState {

	repoPath: string;
	config: any;

	constructor(repoPath: string) {
		this.repoPath = repoPath;
		const configUtils = new ConfigUtils();
		this.config = configUtils.config;
	}
	
	get () : IRepoState {
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
		if (!repoConfig.email) return repoState;
		repoState.IS_CONNECTED = true;
		return repoState;
	}
}

export class RepoPlanLimitsState {

	repoPath: string;
	planLimitKey: string;
	requestSentAtKey: string;
	canAvailTrailKey: string;
	alertShownAtKey: string;

	constructor(repoPath: string) {
		this.repoPath = repoPath;
		this.planLimitKey = `${this.repoPath}:planLimitReached`;
		this.requestSentAtKey = `${this.repoPath}:requestSentAt`;
		this.canAvailTrailKey = `${this.repoPath}:canAvailTrial`;
		this.alertShownAtKey = `${this.repoPath}:planUpgradeAlertShownAt`;
	}
	
	get = (): IRepoPlanLimitState => {
		const state = <IRepoPlanLimitState>{};
		state.planLimitReached = CodeSyncState.get(this.planLimitKey);
		const requestSentAt = CodeSyncState.get(this.requestSentAtKey);
		const alertShownAt = CodeSyncState.get(this.alertShownAtKey);
		state.canRetry = !requestSentAt || (new Date().getTime() - requestSentAt) > RETRY_REQUEST_AFTER;
		state.canShowNotification = !alertShownAt || (new Date().getTime() - alertShownAt) > SHOW_PLAN_UPGRADE_MSG_AFTER;
		return state;
	}

	set = (canAvailTrial: boolean, alertShown=false): void => {
		CodeSyncState.set(this.planLimitKey, true);
		CodeSyncState.set(this.requestSentAtKey, new Date().getTime());
		CodeSyncState.set(this.canAvailTrailKey, canAvailTrial);
		if (alertShown) {
			CodeSyncState.set(this.alertShownAtKey, new Date().getTime());
		}
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
