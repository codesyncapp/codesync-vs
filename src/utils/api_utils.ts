import fetch from "node-fetch";

import { API_HEALTHCHECK, API_USERS, CONNECTION_ERROR_MESSAGE } from "../constants";
import { putLogEvent } from "../logger";
import { IAuth0User } from "../interface";
import jwt_decode from "jwt-decode";



export const checkServerDown = async (userEmail?: string) => {
	let isDown = false;
	const response = await fetch(API_HEALTHCHECK)
	.then(res => res.json())
    .then(json => json)
	.catch(err => {
		isDown = true;
		putLogEvent(CONNECTION_ERROR_MESSAGE, userEmail);
	});
	return isDown || !response.status;
};


export const getUserForToken = async (accessToken: string) => {
	let isTokenValid = false;
	const response = await fetch(
		API_USERS, {
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Basic ${accessToken}`
		},
	})
	.then(res => res.json())
	.then(json => json)
	.catch(err => {
		isTokenValid = false;
	});
	if (response) {
		isTokenValid = !("error" in response);
	}
	return {
		isTokenValid,
		response
	};
};

export const createUserWithApi = async (accessToken: string, idToken: string) => {
	let error = "";
	let user = <IAuth0User>{};
	user = jwt_decode(idToken);
	const response = await fetch(API_USERS, {
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

	if ("error" in response) {
		error = response.error;
	}
	return {
		user,
		error
	};
};
