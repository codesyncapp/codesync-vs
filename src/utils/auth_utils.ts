'use strict';

import fs from "fs";
import vscode from 'vscode';
import yaml from 'js-yaml';
import detectPort from "detect-port";

import {readYML} from './common';
import {isRepoSynced} from "../events/utils";
import {showConnectRepo} from "./notifications";
import {createUserWithApi} from "./api_utils";
import {generateSettings} from "../settings";
import {trackRepoHandler} from "../handlers/commands_handler";
import {Auth0URLs, getRepoInSyncMsg, NOTIFICATION} from "../constants";


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

export const createRedirectUri = () => {
    const port = (global as any).port;
    return `http://localhost:${port}${Auth0URLs.LOGIN_CALLBACK_PATH}`;
};

export const redirectToBrowser = (skipAskConnect=false) => {
    (global as any).skipAskConnect = skipAskConnect;
    const redirectUri = createRedirectUri();
    const authorizeUrl = `${Auth0URLs.AUTHORIZE}?redirect_uri=${redirectUri}`;
    vscode.env.openExternal(vscode.Uri.parse(authorizeUrl));
};

export const createUser = async (accessToken: string, repoPath: string) => {
    const userResponse = await createUserWithApi(accessToken);
    if (userResponse.error) {
        vscode.window.showErrorMessage("Sign up to CodeSync failed");
        return;
    }
    const userEmail = userResponse.email;
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
    fs.writeFileSync(settings.USER_PATH, yaml.safeDump(users));

    vscode.commands.executeCommand('setContext', 'showLogIn', false);

    if (!repoPath) { return; }

	if (!isRepoSynced(repoPath)) {
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

export const logout = () => {
    const redirectUri = createRedirectUri();
    const params = new URLSearchParams({
        redirect_uri: redirectUri
    });
    const logoutUrl = `${Auth0URLs.LOGOUT}?${params}`;
    vscode.env.openExternal(vscode.Uri.parse(logoutUrl));
    markUsersInactive();
    return logoutUrl;
};

const markUsersInactive = () => {
    vscode.commands.executeCommand('setContext', 'showLogIn', true);
    // Mark all users as is_active=false in user.yml
    const settings = generateSettings();
    const users = readYML(settings.USER_PATH);
    Object.keys(users).forEach((email) => {
        users[email].is_active = false;
    });
    fs.writeFileSync(settings.USER_PATH, yaml.safeDump(users));
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
