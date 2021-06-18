import * as fs from "fs";
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import fetch from "node-fetch";
import jwt_decode from "jwt-decode";

import { API_USERS, Auth0URLs, USER_PATH } from "../constants";
import { readYML } from './common';
import { IAuth0User } from '../interface';


export async function handleRedirect(req: any, redirectUri: string) {
	const json = await authorizeUser(req, redirectUri);
	if (json.error) {
		return;
	}
	// create user
	await createUser(json.response);
}

export async function authorizeUser(req: any, redirectUri: string) {
	let error = '';
	const authorizationCode = req.query.code;
	const data = new URLSearchParams();
	data.append('grant_type', 'authorization_code');
	// TODO: Move to config.json
	data.append('client_id', 'FKx1oF94M0OuoDW0YDyAx6tlelUvR3wm');
	data.append('client_secret', 'CdaU65M2wJ7G_HJo3eL_NNA-3IOuAbx0llsW46gGoE7FzTIwnqpGsM57tM2AfoMQ');
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
}

export async function createUser(response: any) {
	let error = "";
	const accessToken = response.access_token;
	let user = <IAuth0User>{};
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

	if (error || 'error' in response) {
		vscode.window.showErrorMessage("Sign up to CodeSync failed");
		return;
	}

	// Save access token of user against email in user.yml
	const users = readYML(USER_PATH);
	if (user.email in users) {
		users[user.email].access_token = accessToken;
	} else {
		users[user.email] = { access_token: accessToken };
	}
	fs.writeFileSync(USER_PATH, yaml.safeDump(users));
	vscode.window.showInformationMessage("Successfully logged in to CodeSync");
}