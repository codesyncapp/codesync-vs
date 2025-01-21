import path from 'path';
import vscode from 'vscode';
import { initHandler } from '../connect_repo/connect_repo_handler';
import { getPublicPrivateMsg, getDirectorySyncIgnoredMsg, NOTIFICATION, getConnectRepoMsgAfterJoin, getDisconnectedRepoMsg, NOTIFICATION_BUTTON, getUpgradePlanMsg, WebPaths} from '../constants';
import { openSyncIgnoreHandler, disconnectRepoHandler, reconnectRepoHandler } from '../handlers/commands_handler';
import { UserState } from './user_utils';
import { generateWebUrl } from './url_utils';
import { authHandler, requestDemoUrl } from '../handlers/user_commands';
import { getCanAwailTrial } from './pricing_utils';
import { getOrgTeams, getRepoAvailableOrganizations } from './api_utils';
import { CodeSyncLogger } from '../logger';

export const showSignUpButtons = () => {
	vscode.window.showInformationMessage(
		NOTIFICATION.WELCOME_MSG, ...[
		NOTIFICATION.LOGIN,
		NOTIFICATION.REQUEST_DEMO,
		NOTIFICATION.IGNORE
	]).then(async selection => {
		if (selection === NOTIFICATION.LOGIN) {
			authHandler();
		} else if (selection === NOTIFICATION.REQUEST_DEMO) {
			requestDemoUrl();
		}
	});
};

export const showConnectRepo = (repoPath: string, email="", accessToken="") => {
	const skipAskConnect = (global as any).skipAskConnect;
	if (skipAskConnect && email && accessToken) {
		const handler = new initHandler(repoPath, accessToken, email);
		handler.connectRepo();
		(global as any).skipAskConnect = false;
		return;
	}
	const msg = email ? getConnectRepoMsgAfterJoin(email) : NOTIFICATION.CONNECT_REPO;
	vscode.window.showInformationMessage(msg, ...[
		NOTIFICATION.CONNECT
	]).then(async selection => {
		if (selection === NOTIFICATION.CONNECT) {

			if (email && accessToken) {
				const handler = new initHandler(repoPath, accessToken, email);
				await handler.connectRepo();
				return;
			}

			await showChooseAccount(repoPath);
		}
	});
};

export const showDisconnectedRepo = (repoPath: string) => {
	const msg = getDisconnectedRepoMsg(repoPath);
	vscode.window.showErrorMessage(msg, ...[
		NOTIFICATION_BUTTON.RECONNECT_REPO,
	]).then(async selection => {
		if (selection === NOTIFICATION_BUTTON.RECONNECT_REPO) {
			reconnectRepoHandler();
		}
	});
};


// TODO: Probably add a separate function
export const showChooseAccount = async (repoPath: string) => {
	// Check if access token is present against users
	const userState = new UserState();
	const activeUser = userState.getUser();
	if (!activeUser) {
		vscode.window.showErrorMessage(NOTIFICATION.NO_VALID_ACCOUNT);
		return;
	}
	// By Default choosing first account
	const handler = new initHandler(repoPath, activeUser.access_token, activeUser.email);
	await handler.connectRepo();
	return handler;
	// TODO: Option to choose different account
	// const emails = validUsers.map(account => account.email);
	// const options = [...emails, NOTIFICATION.USE_DIFFERENT_ACCOUNT];
	// vscode.window.showInformationMessage(
	// 	NOTIFICATION.CHOOSE_ACCOUNT,
	// 	...options)
	// 	.then(async selection => {
	// 		if (selection === NOTIFICATION.USE_DIFFERENT_ACCOUNT) {
	// 			(global as any).skipAskConnect = true;
	// 			return logoutHandler();
	// 		}
	// 	const index = validUsers.findIndex(user => user.email === selection);
	// 	const user = validUsers[index];
	// 	// We have token, repoPath Trigger Init
	// 	await connectRepo(repoPath, user.access_token);
	// });
};


export const askPublicPrivate = async (repoPath: string) => {
	const msg = getPublicPrivateMsg(repoPath);
	const buttonSelected = await vscode.window.showInformationMessage(msg, { modal: true }, ...[
		NOTIFICATION.PUBLIC,
		NOTIFICATION.PRIVATE
	]).then(selection => selection);
	return buttonSelected;
};


export const askPersonalOrOrgRepo = async (accessToken: string, repoPath: string) => {
	const repoName = path.basename(repoPath);
	let orgId = null;
	let teamId = null;
	const respJson = {
		orgId, 
		teamId,
		isCancelled: false,
		error: false
	};
	const orgResponse = await getRepoAvailableOrganizations(accessToken, repoName);
	if (orgResponse.error) {
		CodeSyncLogger.error("Error getting user orgs from the API", orgResponse.error);
		respJson.error = true;
		return respJson;
	}
	if (orgResponse.orgs.length === 0) return respJson;
	const orgNames = orgResponse.orgs.map((org: { name: string; }) => org.name);
	const selectedOrg = await vscode.window.showInformationMessage(
		NOTIFICATION.ASK_ORG_REPO, { modal: true }, NOTIFICATION_BUTTON.REPO_IS_PERSONAL, ...orgNames
	).then(selection => selection);
	if (!selectedOrg) {
		respJson.isCancelled = true;
		return respJson;
	}
	if (selectedOrg === NOTIFICATION_BUTTON.REPO_IS_PERSONAL) return respJson;
	orgId = orgResponse.orgs.filter((org: { name: string, id: number; }) => org.name === selectedOrg)[0].id;
	respJson.orgId = orgId;
	// Get the Org Teams
	const teamResponse = await getOrgTeams(accessToken, orgId);
	if (teamResponse.error) {
		CodeSyncLogger.error("Error getting org teams from the API", teamResponse.error);
		respJson.error = true;
		return respJson;
	}
	if (teamResponse.teams.length === 0) return respJson;
	const teamNames = teamResponse.teams.map((team: { name: string; }) => team.name);
	const selectedTeam = await vscode.window.showInformationMessage(
		NOTIFICATION.ASK_TEAM_REPO, { modal: true }, ...teamNames
	).then(selection => selection);
	if (selectedTeam) {
		teamId = teamResponse.teams.filter((team: { name: string, id: number; }) => team.name === selectedTeam)[0].id;
	}
	respJson.orgId = orgId;
	respJson.teamId = teamId;
	return respJson;
};


export const showSyncIgnoredRepo = (repoPath: string, parentRepoPath: string) => {
	const msg = getDirectorySyncIgnoredMsg(repoPath, parentRepoPath);
	vscode.window.showInformationMessage(msg, 
		NOTIFICATION.OPEN_SYNCIGNORE, 
		NOTIFICATION.DISCONNECT_PARENT_REPO).then(async selection => {
		if (!selection) return;
		switch (selection) {
			case NOTIFICATION.OPEN_SYNCIGNORE:
				openSyncIgnoreHandler();
				break;
			case NOTIFICATION.DISCONNECT_PARENT_REPO: 
				disconnectRepoHandler();
				break;
			default:
			}
		});
};

export const showFreeTierLimitReached = async (repoPath: string, isNewPrivateRepo=false, accessToken="") => {
	const canAvailTrial = await getCanAwailTrial(accessToken);
	const msg = getUpgradePlanMsg(repoPath, isNewPrivateRepo);
	const button = canAvailTrial ? NOTIFICATION_BUTTON.TRY_PRO_FOR_FREE : NOTIFICATION_BUTTON.UPGRADE_TO_PRO;
	const pricingUrl = generateWebUrl(WebPaths.PRICING);
	// Show alert msg
	vscode.window.showErrorMessage(msg, button).then(async selection => {
		if (!selection) return;
		vscode.env.openExternal(vscode.Uri.parse(pricingUrl));
	});
};
