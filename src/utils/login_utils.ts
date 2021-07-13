'use strict';

import * as fs from "fs";
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as express from "express";
import * as detectPort from "detect-port";
import * as querystring from 'querystring';

import fetch from "node-fetch";
import jwt_decode from "jwt-decode";

import { readYML } from './common';
import { IAuth0User } from '../interface';
import { API_USERS, Auth0URLs, NOTIFICATION, USER_PATH } from "../constants";
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
        if (!req.query.code) { 
            res.send(NOTIFICATION.LOGIN_SUCCESS); 
            return;
        }
        await handleRedirect(req);
        res.send(NOTIFICATION.LOGIN_SUCCESS);
    });

    // start the Express server
    expressApp.listen(port, () => {
        console.log(`server started at ${createRedirectUri(port)}`);
    });
};

export const redirectToBrowser = (skipAskConnect = false) => {
    const authorizeUrl = createAuthorizeUrl(skipAskConnect);
    vscode.env.openExternal(vscode.Uri.parse(authorizeUrl));
};

export async function handleRedirect(req: any) {
    const port = (global as any).port;
    const json = await authorizeUser(req);
    if (json.error) {
        return;
    }
    // create user
    await createUser(json.response, json.skipAskConnect);
}

export function createRedirectUri(port: number) {
    return `${Auth0URLs.REDIRECT_URI}:${port}`;
}

export const createAuthorizeUrl = (skipAskConnect=false) => {
    const port = (global as any).port;
    // response_type=code&client_id=clientId&redirect_uri=http://localhost:8080&scope=openid%20profile%20email
    const params = {
        response_type: "code",
        client_id: Auth0URLs.CLIENT_KEY,
        redirect_uri: createRedirectUri(port),
        scope: "openid profile email",
        state: querystring.stringify( { skipAskConnect })
    };
    const queryParams = querystring.stringify(params);
    return `${Auth0URLs.AUTHORIZE}?${queryParams}`;
};

export const authorizeUser = async (req: any) => {
    const port = (global as any).port;
    let error = '';
    const redirectUri = createRedirectUri(port);
    const authorizationCode = req.query.code;
    const skipAskConnect = req.query.state.split("skipAskConnect=")[1] === 'true';
    const data = new URLSearchParams();
    data.append('grant_type', 'authorization_code');
    data.append('client_id', Auth0URLs.CLIENT_KEY);
    data.append('client_secret', Auth0URLs.CLIENT_SECRET);
    data.append('code', authorizationCode);
    data.append('redirect_uri', redirectUri);
    const response = await fetch(Auth0URLs.GET_TOKEN, {
            method: 'POST',
            headers: {'content-type': 'application/x-www-form-urlencoded'},
            body: data.toString()
        }
    )
        .then(res => res.json())
        .then(json => json)
        .catch(err => error = err);

    return {
        response,
        error,
        skipAskConnect
    };
};

export const createUser = async (response: any, skipAskConnect=false) => {
    let error = "";
    let user = <IAuth0User>{};
    const accessToken = response.access_token;
    user = jwt_decode(response.id_token);
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

    const repoPath = vscode.workspace.rootPath;
    if (!repoPath) { return; }

    vscode.commands.executeCommand('setContext', 'showLogIn', false);

	if (repoIsNotSynced(repoPath)) { 
        // Show notification to user to Sync the repo
        showConnectRepo(repoPath, user.email, accessToken, skipAskConnect);
    }
};

export const logout = async (port: number) => {
    let error = "";
    const response = await fetch(
        `${Auth0URLs.LOGOUT}&client_id=${Auth0URLs.CLIENT_KEY}`
        )
        .then(res => res)
        .then(json => json)
        .catch(err => error = err);

    return {
        response,
        error
    };
};
