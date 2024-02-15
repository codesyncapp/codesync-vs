import vscode from 'vscode';
import { contextVariables, NOTIFICATION, NOTIFICATION_BUTTON, PRICING_URL_PATH, RETRY_REQUEST_AFTER } from '../constants';
import { checkSubDir } from './common';
import { pathUtils } from './path_utils';
import { CodeSyncState, CODESYNC_STATES } from "./state_utils";
import { getRepoPlanInfo } from './sync_repo_utils';
import { generateWebUrl } from './url_utils';
import { ConfigUtils } from './config_utils';

export class PlanLimitsHandler {

	accessToken: string;
	
	constructor(accessToken: string) {
		this.accessToken = accessToken;
	}

	async set(repoId: number) {
		console.log("set", repoId);
		let repoPath = null;
		const configUtils = new ConfigUtils();
		const config = configUtils.config;
		if (repoId) {
			repoPath = configUtils.getRepoPathByRepoId(repoId);
		} else {
			// Assuming it is current repo for now
			repoPath = pathUtils.getRootPath();
			if (repoPath) {
				const result = checkSubDir(repoPath);
				if (result.isSubDir) {
					repoPath = result.parentRepo;
				}
			}
			const configRepo = config.repos[repoPath];
			repoId = configRepo.id;
		}
		let pricingUrl = generateWebUrl(PRICING_URL_PATH);
		let isOrgRepo = false;
		let canAvailTrial = false;
	
		// Set time when request is sent
		CodeSyncState.set(CODESYNC_STATES.REQUEST_SENT_AT, new Date().getTime());
	
		const json = <any> await getRepoPlanInfo(this.accessToken, repoId);
		if (!json.error) {
			pricingUrl = generateWebUrl("", json.response.url);
			isOrgRepo = json.response.is_org_repo;
			canAvailTrial = json.response.can_avail_trial;
		}
	
		// Mark upgradePricingPlan to show button in left panel
		vscode.commands.executeCommand('setContext', contextVariables.upgradePricingPlan, true);
		vscode.commands.executeCommand('setContext', contextVariables.canAvailTrial, canAvailTrial);
	
		let msg = NOTIFICATION.FREE_TIER_LIMIT_REACHED;
		const subMsg = isOrgRepo ? NOTIFICATION.UPGRADE_ORG_PLAN : NOTIFICATION.UPGRADE_PRICING_PLAN;
		msg = `${msg} ${repoPath}. ${subMsg}`;
		let button = isOrgRepo ? NOTIFICATION_BUTTON.UPGRADE_TO_TEAM : NOTIFICATION_BUTTON.UPGRADE_TO_PRO;
		if (canAvailTrial) {
			button = isOrgRepo ? NOTIFICATION_BUTTON.TRY_TEAM_FOR_FREE : NOTIFICATION_BUTTON.TRY_PRO_FOR_FREE;
		}
		CodeSyncState.set(CODESYNC_STATES.PRICING_URL, pricingUrl);
		CodeSyncState.set(CODESYNC_STATES.CAN_AVAIL_TRIAL, canAvailTrial);
		// Show alert msg
		vscode.window.showErrorMessage(msg, button).then(async selection => {
			if (!selection) return;
			vscode.env.openExternal(vscode.Uri.parse(pricingUrl));
		});
	}
}

export const getPlanLimitReached = () => {
	/*
		If pricingAlertlock is acquried by any IDE instance, means pricing limit has been reached. 
	*/
	const planLimitReached = false;
	const requestSentAt = CodeSyncState.get(CODESYNC_STATES.REQUEST_SENT_AT);
	const canRetry = requestSentAt && (new Date().getTime() - requestSentAt) > RETRY_REQUEST_AFTER;
	return {
		planLimitReached,
		canRetry
	};
};

export const resetPlanLimitReached = () => {
	/*
		Checks from server if repo is a User's repo or an Organization's repo
		- Sets alert msg and pricing URL accordingly
		- Sets REQUEST_SENT_AT in CodeSyncState after which we retry syncing data
	*/
	vscode.commands.executeCommand('setContext', contextVariables.upgradePricingPlan, false);
	// Set time to "" when request is sent
	CodeSyncState.set(CODESYNC_STATES.REQUEST_SENT_AT, "");
};
