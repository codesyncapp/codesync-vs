import vscode from 'vscode';
import { NOTIFICATION, PRICING_URL, RETRY_REQUEST_AFTER } from '../constants';
import { generateSettings, WEB_APP_URL } from '../settings';
import { checkSubDir, readYML } from './common';
import { LockUtils } from './lock_utils';
import { pathUtils } from './path_utils';
import { CodeSyncState, CODESYNC_STATES } from "./state_utils";
import { getRepoPlanInfo } from './sync_repo_utils';


export const setPlanLimitReached = async (accessToken: string) => {
	let repoPath = pathUtils.getRootPath();
	if (!repoPath) { return; }
	const settings = generateSettings();
	const config = readYML(settings.CONFIG_PATH);
	const result = checkSubDir(repoPath);
	if (result.isSubDir) {
		repoPath = result.parentRepo;
	}
	const configRepo = config.repos[repoPath];
	let msg = NOTIFICATION.UPGRADE_PRICING_PLAN;
	let pricingUrl = PRICING_URL;
	const json = await getRepoPlanInfo(accessToken, configRepo.id);
	if (!json.error) {
		pricingUrl = json.response.url;
		const isOrgRepo = json.response.is_org_repo;
		msg = isOrgRepo ? NOTIFICATION.UPGRADE_ORG_PLAN : NOTIFICATION.UPGRADE_PRICING_PLAN;
	}
	vscode.commands.executeCommand('setContext', 'upgradePricingPlan', true);
	CodeSyncState.set(CODESYNC_STATES.PRICING_URL, pricingUrl);
	const loctUtils = new LockUtils();
	loctUtils.acquirePricingAlertLock();
	// Set time when request is sent
	CodeSyncState.set(CODESYNC_STATES.REQUEST_SENT_AT, new Date().getTime());
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
	// Return if key is already set
	const loctUtils = new LockUtils();
	const planLimitReached = loctUtils.checkPricingAlertLock();
	const requestSentAt = CodeSyncState.get(CODESYNC_STATES.REQUEST_SENT_AT);
	const canRetry = requestSentAt && (new Date().getTime() - requestSentAt) > RETRY_REQUEST_AFTER;
	return {
		planLimitReached,
		canRetry
	};
};
