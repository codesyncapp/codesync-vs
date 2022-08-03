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

	// Mark upgradePricingPlan to show button in left panel
	vscode.commands.executeCommand('setContext', 'upgradePricingPlan', true);
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
		const json = await getRepoPlanInfo(accessToken, configRepo.id);
		if (!json.error) {
			pricingUrl = json.response.url;
			isOrgRepo = json.response.is_org_repo;
		}	
	}

	const msg = isOrgRepo ? NOTIFICATION.UPGRADE_ORG_PLAN : NOTIFICATION.UPGRADE_PRICING_PLAN;
	CodeSyncState.set(CODESYNC_STATES.PRICING_URL, pricingUrl);
	// Show alert msg
	vscode.window.showErrorMessage(msg, ...[
		NOTIFICATION.UPGRADE
	]).then(async selection => {
		if (selection === NOTIFICATION.UPGRADE) {
			vscode.env.openExternal(vscode.Uri.parse(pricingUrl));
		}
	});	
};


export const getPlanLimitReached = () => {
	/*
		If pricingAlertlock is acquried by any IDE instance, means pricing limit has been reached. 
	*/
	const loctUtils = new LockUtils();
	const planLimitReached = loctUtils.checkPricingAlertLock();
	const requestSentAt = CodeSyncState.get(CODESYNC_STATES.REQUEST_SENT_AT);
	const canRetry = requestSentAt && (new Date().getTime() - requestSentAt) > RETRY_REQUEST_AFTER;
	return {
		planLimitReached,
		canRetry
	};
};
