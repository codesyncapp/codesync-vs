'use strict';

import * as fs from "fs";
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as express from "express";
import * as detectPort from "detect-port";
import * as querystring from 'querystring';

import fetch from "node-fetch";
import jwt_decode from "jwt-decode";

import {readYML} from './common';
import {IAuth0User} from '../interface';
import {API_USERS, Auth0URLs, USER_PATH} from "../constants";


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


export const initExpressServer = (port: number) => {
    // Create an express server
    const expressApp = express();

    // define a route handler for the default home page
    expressApp.get("/", async (req: any, res: any) => {
        await handleRedirect(req, port);
        res.send("Successfully Logged in. Check your IDE");
    });

    // start the Express server
    expressApp.listen(port, () => {
        console.log(`server started at ${createRedirectUri(port)}`);
    });
};

export async function handleRedirect(req: any, port: number) {
    const json = await authorizeUser(req, port);
    if (json.error) {
        return;
    }
    // create user
    await createUser(json.response);
}

export function createRedirectUri(port: number) {
    return `${Auth0URLs.REDIRECT_URI}:${port}`;
}

export const createAuthorizeUrl = (port: number) => {
    // response_type=code&client_id=clientId&redirect_uri=http://localhost:8080&scope=openid%20profile%20email
    const params = {
        response_type: "code",
        client_id: Auth0URLs.CLIENT_KEY,
        redirect_uri: createRedirectUri(port),
        scope: "openid profile email"
    };
    const queryParams = querystring.stringify(params);
    return `${Auth0URLs.AUTHORIZE}?${queryParams}`;
};

export const authorizeUser = async (req: any, port: number) => {
    let error = '';
    const redirectUri = createRedirectUri(port);
    const authorizationCode = req.query.code;
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
        error
    };
};

export const createUser = async (response: any) => {
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
    const users = readYML(USER_PATH);
    if (user.email in users) {
        users[user.email].access_token = accessToken;
    } else {
        users[user.email] = {access_token: accessToken};
    }
    fs.writeFileSync(USER_PATH, yaml.safeDump(users));
    vscode.window.showInformationMessage("Successfully logged in to CodeSync");
};
