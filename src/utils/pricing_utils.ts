import vscode from 'vscode';
import { NOTIFICATION, PRICING_URL, RETRY_REQUEST_AFTER } from '../constants';
import { generateSettings } from '../settings';
import { checkSubDir, readYML } from './common';
import { LockUtils } from './lock_utils';
import { pathUtils } from './path_utils';
import { CodeSyncState, CODESYNC_STATES } from "./state_utils";
import { getRepoPlanInfo } from './sync_repo_utils';


export const setPlanLimitReached = async (accessToken: string) => {
	/*
		Checks from server if repo is a User's repo or an Organization's repo
		- Sets alert msg and pricing URL accordingly
		- Sets REQUEST_SENT_AT in CodeSyncState after which we retry syncing data
	*/
	const loctUtils = new LockUtils();
	loctUtils.acquirePricingAlertLock();

	let pricingUrl = PRICING_URL;
	let isOrgRepo = false;
	let canAvailTrial = false;

	// Set time when request is sent
	CodeSyncState.set(CODESYNC_STATES.REQUEST_SENT_AT, new Date().getTime());

	let repoPath = pathUtils.getRootPath();
	if (repoPath) {
		const settings = generateSettings();
		const config = readYML(settings.CONFIG_PATH);
		const result = checkSubDir(repoPath);
		if (result.isSubDir) {
			repoPath = result.parentRepo;
		}
		const configRepo = config.repos[repoPath];
		if (configRepo) {
			const json = <any> await getRepoPlanInfo(accessToken, configRepo.id);
			if (!json.error) {
				pricingUrl = json.response.url;
				isOrgRepo = json.response.is_org_repo;
				canAvailTrial = json.response.can_avail_trial;
			}	
		}
	}

	// Mark upgradePricingPlan to show button in left panel
	vscode.commands.executeCommand('setContext', 'upgradePricingPlan', true);
	vscode.commands.executeCommand('setContext', 'canAvailTrial', canAvailTrial);

	const msg = isOrgRepo ? NOTIFICATION.UPGRADE_ORG_PLAN : NOTIFICATION.UPGRADE_PRICING_PLAN;
	let button = NOTIFICATION.UPGRADE;
	if (canAvailTrial) {
		button = isOrgRepo ? NOTIFICATION.TRY_TEAM_FOR_FREE : NOTIFICATION.TRY_PRO_FOR_FREE;
	}
	CodeSyncState.set(CODESYNC_STATES.PRICING_URL, pricingUrl);
	CodeSyncState.set(CODESYNC_STATES.CAN_AVAIL_TRIAL, canAvailTrial);
	// Show alert msg
	vscode.window.showErrorMessage(msg, button).then(async selection => {
		if (!selection) return;
		vscode.env.openExternal(vscode.Uri.parse(pricingUrl));
	});	
};


export const getPlanLimitReached = () => {
	/*
		If pricingAlertlock is acquried by any IDE instance, means pricing limit has been reached. 
	*/
	const lockUtils = new LockUtils();
	const planLimitReached = lockUtils.checkPricingAlertLock();
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
	const lockUtils = new LockUtils();
	lockUtils.releasePricingAlertLock();
	vscode.commands.executeCommand('setContext', 'upgradePricingPlan', false);
	// Set time to "" when request is sent
	CodeSyncState.set(CODESYNC_STATES.REQUEST_SENT_AT, "");
};
