'use strict';

import fs from "fs";
import vscode from 'vscode';
import yaml from 'js-yaml';
import express from "express";
import detectPort from "detect-port";

import { readYML } from './common';
import { Auth0URLs, LOGIN_SUCCESS_CALLBACK, NOTIFICATION, USER_PATH } from "../constants";
import { repoIsNotSynced } from "../events/utils";
import { showConnectRepo } from "./notifications";
import { createUserWithApi } from "./api_utils";

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

export const initExpressServer = () => {
    // Create an express server
    const expressApp = express();
    const port = (global as any).port;

    // define a route handler for the default home page
    expressApp.get("/", async (req: any, res: any) => {
        res.send("OK");
    });

    // define a route handler for the authorization callback
    expressApp.get(LOGIN_SUCCESS_CALLBACK, async (req: any, res: any) => {
        const repoPath = vscode.workspace.rootPath || "";
        await createUser(req.query.access_token, req.query.id_token, repoPath);
        res.send(NOTIFICATION.LOGIN_SUCCESS);
    });

    // start the Express server
    expressApp.listen(port, () => {
        console.log(`server started at ${port}`);
    });
};

export const createRedirectUri = () => {
    const port = (global as any).port;
    return `http://localhost:${port}${LOGIN_SUCCESS_CALLBACK}`;
};

export const redirectToBrowser = (skipAskConnect=false) => {
    (global as any).skipAskConnect = skipAskConnect;
    const redirectUri = createRedirectUri();
    const authorizeUrl = `${Auth0URLs.AUTHORIZE}?redirect_uri=${redirectUri}`;
    vscode.env.openExternal(vscode.Uri.parse(authorizeUrl));
};

export const createUser = async (accessToken: string, idToken: string, repoPath: string, userFilePath=USER_PATH) => {
    const userResponse = await createUserWithApi(accessToken, idToken);
    if (userResponse.error) {
        vscode.window.showErrorMessage("Sign up to CodeSync failed");
        return;
    }
    const user = userResponse.user;
    // Save access token of user against email in user.yml
    const users = readYML(userFilePath) || {};
    if (user.email in users) {
        users[user.email].access_token = accessToken;
    } else {
        users[user.email] = {access_token: accessToken};
    }
    fs.writeFileSync(userFilePath, yaml.safeDump(users));

    vscode.commands.executeCommand('setContext', 'showLogIn', false);

    if (!repoPath) { return; }

	if (repoIsNotSynced(repoPath)) {
        // Show notification to user to Sync the repo
        showConnectRepo(repoPath, user.email, accessToken);
    }
};

export const logout = () => {
    const redirectUri = createRedirectUri();
    const params = new URLSearchParams({
        redirect_uri: redirectUri
    });
    const logoutUrl = `${Auth0URLs.LOGOUT}?${params}`;
    vscode.env.openExternal(vscode.Uri.parse(logoutUrl));
    return logoutUrl;
};

export const askAndTriggerSignUp = () => {
    // Trigger sign up process
    vscode.window.showWarningMessage(
        NOTIFICATION.AUTHENTICATION_FAILED, ...[
        NOTIFICATION.LOGIN,
        NOTIFICATION.IGNORE
    ]).then(selection => {
        if (selection === NOTIFICATION.LOGIN) {
            redirectToBrowser(true);
        }
    });
};
