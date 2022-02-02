import fetch from "node-fetch";

import { API_HEALTHCHECK, API_USERS } from "../constants";

export const checkServerDown = async () => {
	let isDown = false;
	const response = await fetch(API_HEALTHCHECK)
	.then(res => res.json())
    .then(json => json)
	.catch(err => {
		isDown = true;
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
	if (response && !(response.error)) {
		isTokenValid = true;
	}
	return {
		isTokenValid,
		response
	};
};

export const createUserWithApi = async (accessToken: string) => {
	let error = "";
	let email = "";
	const response = await fetch(API_USERS, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Basic ${accessToken}`
			}
		}
	)
		.then(res => res.json())
		.then(json => json)
		.catch(err => error = err);

	if (response.error) {
		error = response.error.message;
	}

	if (!error) {
		email = response.user.email;
	}

	return {
		email,
		error
	};
};
