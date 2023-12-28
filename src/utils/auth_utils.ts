'use strict';

import fs from "fs";
import vscode from 'vscode';
import yaml from 'js-yaml';
import detectPort from "detect-port";

import {ErrorCodes, readYML} from './common';
import {isRepoSynced} from "../events/utils";
import {showConnectRepo} from "./notifications";
import {createUserWithApi} from "./api_utils";
import {generateSettings} from "../settings";
import {reactivateAccountHandler, trackRepoHandler} from "../handlers/commands_handler";
import {Auth0URLs, contextVariables, ECONNREFUSED, getRepoInSyncMsg, HTTP_STATUS_CODES, NOTIFICATION, NOTIFICATION_BUTTON} from "../constants";
import { CodeSyncLogger } from "../logger";
import { generateAuthUrl } from "./url_utils";
import { CODESYNC_STATES, CodeSyncState } from "./state_utils";
import { pathUtils } from "./path_utils";


export const isPortAvailable = async (port: number) => {
    return detectPort(port)
        .then(_port => {
            return port === _port;
        })
        .catch(err => {
            console.log(err);
            return false;
        });
};

export const redirectToBrowser = (skipAskConnect=false) => {
    (global as any).skipAskConnect = skipAskConnect;
    const authorizeUrl = generateAuthUrl(Auth0URLs.AUTHORIZE);
    vscode.env.openExternal(vscode.Uri.parse(authorizeUrl));
};

const postSuccessLoginAddUser = (userEmail: string, accessToken: string) => {
    if (!userEmail) return;
    const settings = generateSettings();
    // Save access token of user against email in user.yml
    const users = readYML(settings.USER_PATH) || {};
    if (userEmail in users) {
        users[userEmail].access_token = accessToken;
        users[userEmail].is_active = true;
    } else {
        users[userEmail] = {
            access_token: accessToken,
            is_active: true
        };
    }
    fs.writeFileSync(settings.USER_PATH, yaml.dump(users));
};

export const postSuccessLogin = (userEmail: string, accessToken: string) => {
    postSuccessLoginAddUser(userEmail, accessToken);
    vscode.commands.executeCommand('setContext', contextVariables.showLogIn, false);
    vscode.commands.executeCommand('setContext', contextVariables.showReactivateAccount, false);
    CodeSyncState.set(CODESYNC_STATES.ACCOUNT_DEACTIVATED, false);
    const repoPath = pathUtils.getRootPath() || "";
    if (!repoPath) return;
    const repoInSync = isRepoSynced(repoPath);
    vscode.commands.executeCommand('setContext', contextVariables.showConnectRepoView, !repoInSync);
	if (!repoInSync) {
        // Show notification to user to Sync the repo
        return showConnectRepo(repoPath, userEmail, accessToken);
    }
    // Show notification that repo is in sync
    vscode.window.showInformationMessage(getRepoInSyncMsg(repoPath), ...[
        NOTIFICATION.TRACK_IT
    ]).then(selection => {
        if (!selection) { return; }
        if (selection === NOTIFICATION.TRACK_IT) {
            trackRepoHandler();
        }
    });
};

const postDeactivatedAccount = (userEmail: string, accessToken: string) => {
    postSuccessLoginAddUser(userEmail, accessToken);
    vscode.commands.executeCommand('setContext', contextVariables.showLogIn, false);
    vscode.commands.executeCommand('setContext', contextVariables.showReactivateAccount, true);
    vscode.commands.executeCommand('setContext', contextVariables.showConnectRepoView, false);
    CodeSyncState.set(CODESYNC_STATES.ACCOUNT_DEACTIVATED, true);
};

const checkDeactivatedAccount = (email: string, accessToken: string, statusCode: number) => {
    if (statusCode !== ErrorCodes.USER_ACCOUNT_DEACTIVATED) return false;
    postDeactivatedAccount(email, accessToken);
    vscode.window.showErrorMessage(NOTIFICATION.ACCOUNT_DEACTIVATED, NOTIFICATION_BUTTON.REACTIVATE_ACCOUNT).then(selection => {
        if (!selection) return;
        if (selection === NOTIFICATION_BUTTON.REACTIVATE_ACCOUNT) {
            reactivateAccountHandler();
        }
    });
    return true;
};

export const isAccountActive = async (email: string, accessToken: string) => {
    const isValidAccount = true;
    const userResponse = await createUserWithApi(accessToken);
    if (!userResponse.error) return isValidAccount;
    if (userResponse.statusCode === HTTP_STATUS_CODES.UNAUTHORIZED) {
        askAndTriggerSignUp();
        return false;
    }
    const isDeactivated = checkDeactivatedAccount(email, accessToken, userResponse.statusCode);
    if (isDeactivated) return false;
    return !userResponse.error.toString().includes(ECONNREFUSED);
};

export const createUser = async (accessToken: string, idToken: string) => {
    const auth0User = parseJwt(idToken);
    const userResponse = await createUserWithApi(accessToken);
    if (userResponse.error) {
        const isDeactivated = checkDeactivatedAccount(auth0User.email, accessToken, userResponse.statusCode);
        if (isDeactivated) return {
                success: true,
                isDeactivated: true
        };
        vscode.window.showErrorMessage(NOTIFICATION.SIGNUP_FAILED);
        CodeSyncLogger.critical("Error creaing user from API", userResponse.error);    
        return {
            success: false,
            isDeactivated: false
        };
    }
    const userEmail = userResponse.email;
    postSuccessLogin(userEmail, accessToken);
    return {
        success: true,
        isDeactivated: false
    };
};

export const logout = () => {
    const logoutUrl = generateAuthUrl(Auth0URLs.LOGOUT);
    markUsersInactive();
    return logoutUrl;
};

export const markUsersInactive = (notify=true) => {
    vscode.commands.executeCommand('setContext', contextVariables.showLogIn, true);
    // Mark all users as is_active=false in user.yml
    const settings = generateSettings();
    const users = readYML(settings.USER_PATH);
    Object.keys(users).forEach((email) => {
        users[email].is_active = false;
    });
    fs.writeFileSync(settings.USER_PATH, yaml.dump(users));
    if (!notify) return;
    setTimeout(() => {
        vscode.window.showInformationMessage(NOTIFICATION.LOGGED_OUT_SUCCESSFULLY);
    }, 1000);
};

export const askAndTriggerSignUp = () => {
    // Trigger sign up process
    vscode.window.showErrorMessage(
        NOTIFICATION.AUTHENTICATION_FAILED, ...[
        NOTIFICATION.LOGIN,
        NOTIFICATION.IGNORE
    ]).then(selection => {
        if (selection === NOTIFICATION.LOGIN) {
            redirectToBrowser(true);
        }
    });
};


const parseJwt = (token: string) => {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
};