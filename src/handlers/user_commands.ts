import vscode from 'vscode';
import { Auth0URLs, NOTIFICATION, WebPaths } from "../constants";
import { createRedirectUri, generateAuthUrl, generateLogoutUrl, generateWebUrl } from "../utils/url_utils";
import { UserState } from '../utils/user_utils';


export const authHandler = (skipAskConnect=false) => {
	(global as any).skipAskConnect = skipAskConnect;
	const authUrl = generateAuthUrl();
	const userState = new UserState();
	userState.setWaitingForLogin();
	vscode.window.showInformationMessage(NOTIFICATION.WAITING_FOR_LOGIN_CONFIRMATION);
	vscode.env.openExternal(vscode.Uri.parse(authUrl));
};


export const logoutHandler = () => {
	const userState = new UserState();
	const activeUser = userState.getUser();
	if (!activeUser) return vscode.window.showErrorMessage(NOTIFICATION.NO_VALID_ACCOUNT);
    const logoutUrl = generateLogoutUrl(activeUser.access_token);
	vscode.env.openExternal(vscode.Uri.parse(logoutUrl));
    return logoutUrl;
};


export const reactivateAccountHandler = () => {
	const userState = new UserState();
	const activeUser = userState.getUser();
	if (!activeUser) return vscode.window.showErrorMessage(NOTIFICATION.NO_VALID_ACCOUNT);
	const redirectURI = createRedirectUri(Auth0URLs.REACTIVATE_CALLBACK_PATH);
	const additionalParams = {
		"callback": redirectURI
	};
	const reactivateWebUrl = generateWebUrl(WebPaths.USER_PROFILE_SETTINGS, additionalParams);
	vscode.env.openExternal(vscode.Uri.parse(reactivateWebUrl));
};
