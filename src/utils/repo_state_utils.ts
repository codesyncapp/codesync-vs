import path from 'path';
import vscode from 'vscode';
import { IRepoPlanLimitState, IRepoState } from '../interface';
import { ConfigUtils } from './config_utils';
import { CODESYNC_STATES, CodeSyncState } from "./state_utils";
import { RETRY_REQUEST_AFTER, SHOW_PLAN_UPGRADE_MSG_AFTER, contextVariables } from "../constants";
import { pathUtils } from './path_utils';
import { UserState } from './user_utils';
import { getDefaultIgnorePatterns, getSyncIgnoreItems, shouldIgnorePath } from './common';


export class RepoState {

	repoPath: string;
	config: any;

	constructor(repoPath: string) {
		this.repoPath = repoPath;
		const configUtils = new ConfigUtils();
		this.config = configUtils.config;
	}

	static setIsSubDir (isSubDir: boolean, parentRepo: string, isSyncIgnored: boolean): void {
		CodeSyncState.set(CODESYNC_STATES.IS_SUB_DIR, isSubDir);
		CodeSyncState.set(CODESYNC_STATES.PARENT_REPO, parentRepo);
		CodeSyncState.set(CODESYNC_STATES.IS_SYNCIGNORED_SUB_DIR, isSyncIgnored);
	}

	static isSubDir() {
		return CodeSyncState.get(CODESYNC_STATES.IS_SUB_DIR);
	}

	static getParentRepo() {
		return CodeSyncState.get(CODESYNC_STATES.PARENT_REPO);
	}

	static isSyncIgnoredSubDir() {
		return CodeSyncState.get(CODESYNC_STATES.IS_SYNCIGNORED_SUB_DIR);
	}

	setSubDirState = () => {
		let isSubDir = false;
		let parentRepo = "";
		let isSyncIgnored = false;
		if (!this.config) return RepoState.setIsSubDir(isSubDir, parentRepo, isSyncIgnored);
		const userState = new UserState();
		const activeUser = userState.getUser();
		const repoPaths = Object.keys(this.config.repos);
		const defaultIgnorePatterns = getDefaultIgnorePatterns();
	
		for (const _repoPath of repoPaths) {
			const repoConfig = this.config.repos[_repoPath];
			// Verify connected repo is of current user's repo
			if (activeUser && repoConfig.email !== activeUser.email) continue;
			// Skip disconnected repos
			if (repoConfig.is_disconnected) continue;
			const relative = path.relative(_repoPath, this.repoPath);
			const isSubdir = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
			if (isSubdir) {
				parentRepo = _repoPath;
				const relPath = this.repoPath.split(path.join(_repoPath, path.sep))[1];
				const syncIgnoreItems = getSyncIgnoreItems(_repoPath);
				isSyncIgnored = relPath ? shouldIgnorePath(relPath, defaultIgnorePatterns, syncIgnoreItems) : false;
				break;
			}
		}
		isSubDir = !!parentRepo;
		RepoState.setIsSubDir(isSubDir, parentRepo, isSyncIgnored);
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
		repoState.IS_SUB_DIR = RepoState.isSubDir();
		repoState.IS_SYNC_IGNORED = RepoState.isSyncIgnoredSubDir();
		if (repoState.IS_SUB_DIR) {
			repoState.IS_CONNECTED = true;
			repoState.PARENT_REPO_PATH = RepoState.getParentRepo();
			if (repoState.IS_SYNC_IGNORED) return repoState;
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
		state.canRetry = requestSentAt && (new Date().getTime() - requestSentAt) > RETRY_REQUEST_AFTER;
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
