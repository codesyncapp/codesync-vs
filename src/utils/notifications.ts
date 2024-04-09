import vscode from 'vscode';
import { initHandler } from '../init/init_handler';
import { getPublicPrivateMsg, getDirectorySyncIgnoredMsg, NOTIFICATION, getConnectRepoMsgAfterJoin, getDisconnectedRepoMsg, NOTIFICATION_BUTTON, getUpgradePlanMsg, WebPaths} from '../constants';
import { trackRepoHandler, openSyncIgnoreHandler, disconnectRepoHandler, reconnectRepoHandler } from '../handlers/commands_handler';
import { UserState } from './user_utils';
import { generateWebUrl } from './url_utils';
import { authHandler } from '../handlers/user_commands';


export const showSignUpButtons = () => {
	vscode.window.showInformationMessage(
		NOTIFICATION.WELCOME_MSG, ...[
		NOTIFICATION.JOIN,
		NOTIFICATION.IGNORE
	]).then(async selection => {
		if (selection === NOTIFICATION.JOIN) {
			authHandler();
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

export const showSyncIgnoredRepo = (repoPath: string, parentRepoPath: string) => {
	const msg = getDirectorySyncIgnoredMsg(repoPath, parentRepoPath);
	vscode.window.showInformationMessage(msg, 
		NOTIFICATION.OPEN_SYNCIGNORE, 
		NOTIFICATION.TRACK_PARENT_REPO, 
		NOTIFICATION.DISCONNECT_PARENT_REPO).then(async selection => {
		if (!selection) return;
		switch (selection) {
			case NOTIFICATION.TRACK_PARENT_REPO:
				trackRepoHandler();
				break;
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

export const showFreeTierLimitReached = (repoPath: string, isNewPrivateRepo=false) => {
	const msg = getUpgradePlanMsg(repoPath, isNewPrivateRepo);
	// TODO: get canAvailTrial from /users/pricing/subscription API call
	const button = NOTIFICATION_BUTTON.UPGRADE_TO_PRO;
	const pricingUrl = generateWebUrl(WebPaths.PRICING);
	// Show alert msg
	vscode.window.showErrorMessage(msg, button).then(async selection => {
		if (!selection) return;
		vscode.env.openExternal(vscode.Uri.parse(pricingUrl));
	});
};
