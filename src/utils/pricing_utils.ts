import vscode from 'vscode';
import { contextVariables, NOTIFICATION, NOTIFICATION_BUTTON, PRICING_URL_PATH, RETRY_REQUEST_AFTER } from '../constants';
import { checkSubDir } from './common';
import { pathUtils } from './path_utils';
import { CodeSyncState, CODESYNC_STATES } from "./state_utils";
import { getRepoPlanInfo } from './sync_repo_utils';
import { generateWebUrl } from './url_utils';
import { ConfigUtils } from './config_utils';
import { RepoPlanLimitsUtils } from './repo_utils';
import { IRepoPlanInfo } from '../interface';

export class PlanLimitsHandler {

	accessToken: string; // Required
	repoId: number; // Required
	repoPath: string; // Optional
	currentRepoPath: string; // Custom
	
	constructor(accessToken: string, repoId: number, repoPath="") {
		this.accessToken = accessToken;
		this.repoId = repoId;
		this.repoPath = repoPath;
		this.currentRepoPath = pathUtils.getRootPath();
	}

	_getRepoPlanInfo = async () : Promise<IRepoPlanInfo> => {
		// Get Repo Plan Info from server
		const planInfo = <IRepoPlanInfo>{};
		planInfo.pricingUrl = generateWebUrl(PRICING_URL_PATH);
		planInfo.isOrgRepo = false;
		planInfo.canAvailTrial = false;
		const json = <any> await getRepoPlanInfo(this.accessToken, this.repoId);
		if (!json.error) {
			planInfo.pricingUrl = generateWebUrl("", json.response.url);
			planInfo.isOrgRepo = json.response.is_org_repo;
			planInfo.canAvailTrial = json.response.can_avail_trial;
		}
		return planInfo;
	}

	async run() {
		console.log("planLimitsHandler:run");
		const configUtils = new ConfigUtils();
		const config = configUtils.config;
		if (!config) return;
		const repoPath = this.repoPath || configUtils.getRepoPathByRepoId(this.repoId);
		if (!repoPath) return;
		const repoPlanInfo = await this._getRepoPlanInfo();
		// Set RepoPlanLimitsState
		const repoPlanLimitUtils = new RepoPlanLimitsUtils(repoPath);
		repoPlanLimitUtils.setState(repoPlanInfo.canAvailTrial);
		// Mark upgradePricingPlan to show button in left panel only if it is currently opened repo
		if (this.currentRepoPath === repoPath) {
			vscode.commands.executeCommand('setContext', contextVariables.upgradePricingPlan, true);
			vscode.commands.executeCommand('setContext', contextVariables.canAvailTrial, repoPlanInfo.canAvailTrial);
			CodeSyncState.set(CODESYNC_STATES.PRICING_URL, repoPlanInfo.pricingUrl);
			CodeSyncState.set(CODESYNC_STATES.CAN_AVAIL_TRIAL, repoPlanInfo.canAvailTrial);	
		}
		// Create msg for the notification
		let msg = NOTIFICATION.FREE_TIER_LIMIT_REACHED;
		const subMsg = repoPlanInfo.isOrgRepo ? NOTIFICATION.UPGRADE_ORG_PLAN : NOTIFICATION.UPGRADE_PRICING_PLAN;
		msg = `${msg} ${repoPath}. ${subMsg}`;
		let button = repoPlanInfo.isOrgRepo ? NOTIFICATION_BUTTON.UPGRADE_TO_TEAM : NOTIFICATION_BUTTON.UPGRADE_TO_PRO;
		if (repoPlanInfo.canAvailTrial) {
			button = repoPlanInfo.isOrgRepo ? NOTIFICATION_BUTTON.TRY_TEAM_FOR_FREE : NOTIFICATION_BUTTON.TRY_PRO_FOR_FREE;
		}
		// Show alert msg
		vscode.window.showErrorMessage(msg, button).then(async selection => {
			if (!selection) return;
			vscode.env.openExternal(vscode.Uri.parse(repoPlanInfo.pricingUrl));
		});
	}
}
