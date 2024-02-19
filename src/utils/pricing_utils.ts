import vscode from 'vscode';
import { contextVariables, HttpStatusCodes, NOTIFICATION, NOTIFICATION_BUTTON, PRICING_URL_PATH } from '../constants';
import { ErrorCodes } from './common';
import { pathUtils } from './path_utils';
import { CodeSyncState, CODESYNC_STATES } from "./state_utils";
import { getRepoPlanInfo } from './sync_repo_utils';
import { generateWebUrl } from './url_utils';
import { ConfigUtils } from './config_utils';
import { RepoPlanLimitsState } from './repo_utils';
import { IRepoPlanInfo } from '../interface';
import { showFreeTierLimitReached } from './notifications';

export class PlanLimitsHandler {

	accessToken: string; // Required
	repoId: number; // Required
	repoPath: string; // Optional
	currentRepoPath: string; // Custom
	isCurrentRepo: boolean;
	
	constructor(accessToken: string, repoId: number, repoPath="") {
		this.accessToken = accessToken;
		this.repoId = repoId;
		this.repoPath = repoPath;
		this.currentRepoPath = pathUtils.getRootPath();
		this.isCurrentRepo = false;
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
		const configUtils = new ConfigUtils();
		const config = configUtils.config;
		if (!config) return;
		const repoPath = this.repoPath || configUtils.getRepoPathByRepoId(this.repoId);
		if (!repoPath) return;
		const repoPlanInfo = await this._getRepoPlanInfo();
		// Set RepoPlanLimitsState
		const repoLimitsState = new RepoPlanLimitsState(repoPath);
		repoLimitsState.set(repoPlanInfo.canAvailTrial);
		// Mark upgradePricingPlan to show button in left panel only if it is currently opened repo
		this.isCurrentRepo = this.currentRepoPath === repoPath;
		if (this.isCurrentRepo) {
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
	
	uploadRepo = async (statusCode: number, errorCode: number) => {
		if (statusCode === HttpStatusCodes.OK){
			const repoLimitsState = new RepoPlanLimitsState(this.repoPath);
			repoLimitsState.reset();
			return true;
		}
		if (statusCode === HttpStatusCodes.PAYMENT_REQUIRED) {
			// No need to set state for Connecting Repo since it is performed by User Action
			// This is "Branch Upload"
			if (this.repoId) return await this.run();
			// This is "Connect Repo"
			const isNewPrivateRepo = errorCode === ErrorCodes.PRIVATE_REPO_COUNT_LIMIT_REACHED;
			showFreeTierLimitReached(this.repoPath, isNewPrivateRepo);
			return true;
		}
		return false;
	}	
}
