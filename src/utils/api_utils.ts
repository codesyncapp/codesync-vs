import fetch from "node-fetch";

import { API_ROUTES } from "../constants";
import { PLUGIN_USER } from "../settings";

export const checkServerDown = async () => {
	let isDown = false;
	const response = <any> await fetch(API_ROUTES.HEALTHCHECK)
	.then(res => res.json())
    .then(json => json)
	.catch(err => {
		isDown = true;
	});
	return isDown || !response.status;
};


export const getUserForToken = async (accessToken: string) => {
	let isTokenValid = false;
	const response = <any> await fetch(
		API_ROUTES.USERS, {
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
	const response = <any> await fetch(API_ROUTES.USERS, {
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

export const getPluginUser = async () => {
	let error = "";
	const response = <any> await fetch(PLUGIN_USER.url)
		.then(res => res.json())
		.then(json => json)
		.catch(err => error = err);

	if (response.error) {
		error = response.error.message;
	}

	return {
		user: {...response},
		error
	};
};


export const getTeamActivity = async (accessToken: string) => {
	let error = "";
	let is_team_activity = false;
	let activities = <any>[];
	const response = <any> await fetch(
		API_ROUTES.TEAM_ACTIVITY, {
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Basic ${accessToken}`
			}
	})
		.then(res => res.json())
		.then(json => json)
		.catch(err => error = err);
	if (response.error) {
		error = response.error.message;
	} else {
		activities = response.activities;
		is_team_activity = response.is_team_activity;
	}

	return {
		activities,
		is_team_activity,
		error
	};
};
