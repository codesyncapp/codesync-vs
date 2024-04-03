import vscode from 'vscode';
import { Auth0URLs, NOTIFICATION, WebPaths } from "../constants";
import { createRedirectUri, generateAuthUrl, generateWebUrl } from "../utils/url_utils";
import { markUsersInactive } from '../utils/auth_utils';
import { UserState } from '../utils/user_utils';


export const authHandler = (skipAskConnect=false) => {
	(global as any).skipAskConnect = skipAskConnect;
	const redirectURI = createRedirectUri(Auth0URLs.LOGIN_CALLBACK_PATH);
	const additionalParams = {
		"login-callback": redirectURI
	};
	const authUrl = generateWebUrl(WebPaths.AUTH, additionalParams);
	const userState = new UserState();
	userState.setWaitingForLogin();
	vscode.window.showInformationMessage(NOTIFICATION.WAITING_FOR_LOGIN_CONFIRMATION);
	vscode.env.openExternal(vscode.Uri.parse(authUrl));
};


export const logoutHandler = () => {
    const logoutUrl = generateAuthUrl(Auth0URLs.LOGOUT);
    vscode.env.openExternal(vscode.Uri.parse(logoutUrl));
    markUsersInactive();
	if ((global as any).socketConnection) {
		(global as any).socketConnection.close();
		(global as any).socketConnection = null;
	}
	if ((global as any).websocketClient) {
		(global as any).websocketClient = null;
	}
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
