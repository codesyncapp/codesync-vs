'use strict';

import * as fs from "fs";
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as express from "express";
import * as detectPort from "detect-port";

import fetch from "node-fetch";
import jwt_decode from "jwt-decode";

import { readYML } from './common';
import { IAuth0User } from '../interface';
import { API_USERS, AUTH0_AUTHORIZE, AUTH0_LOGOUT, LOGIN_SUCCESS_CALLBACK, NOTIFICATION, USER_PATH } from "../constants";
import { repoIsNotSynced } from "./event_utils";
import { showConnectRepo } from "./notifications";

export const isPortAvailable = async (port: number) => {
    return detectPort(port)
        .then(_port => {
            if (port !== _port) { console.log(`${port} not available`); }
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
        await createUser(req.query.access_token, req.query.id_token);
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
    const authorizeUrl = `${AUTH0_AUTHORIZE}?redirect_uri=${redirectUri}`;
    vscode.env.openExternal(vscode.Uri.parse(authorizeUrl));
};

export const createUser = async (accessToken: string, idToken: string) => {
    let error = "";
    let user = <IAuth0User>{};
    user = jwt_decode(idToken);
    const userResponse = await fetch(API_USERS, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'Authorization': `Basic ${accessToken}`
            },
            body: JSON.stringify(user)
        }
    )
        .then(res => res.json())
        .then(json => json)
        .catch(err => error = err);

    if (error || 'error' in userResponse) {
        vscode.window.showErrorMessage("Sign up to CodeSync failed");
        return;
    }

    // Save access token of user against email in user.yml
    const users = readYML(USER_PATH) || {};
    if (user.email in users) {
        users[user.email].access_token = accessToken;
    } else {
        users[user.email] = {access_token: accessToken};
    }
    fs.writeFileSync(USER_PATH, yaml.safeDump(users));

    vscode.commands.executeCommand('setContext', 'showLogIn', false);

    const repoPath = vscode.workspace.rootPath;
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
    const logoutUrl = `${AUTH0_LOGOUT}?${params}`;
    vscode.env.openExternal(vscode.Uri.parse(logoutUrl));
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
