import fetch from "node-fetch";

import { API_ROUTES } from "../constants";


export const checkServerDown = async () => {
	let isDown = false;
	const response = <any>await fetch(API_ROUTES.HEALTHCHECK)
		.then(res => res.json())
		.then(json => json)
		.catch(err => {
			isDown = true;
		});
	return isDown || !response.status;
};


export const createUserWithApi = async (accessToken: string) => {
	let error = "";
	let email = "";
	let statusCode = 200;
	const response = <any>await fetch(API_ROUTES.USERS, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Basic ${accessToken}`
		}
	}
	)
		.then(res => {
			statusCode = res.status;
			return res.json();
		})
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
		error,
		statusCode: statusCode
	};
};


export const getTeamActivity = async (accessToken: string) => {
	let error = "";
	let is_team_activity = false;
	let activities = <any>[];
	const response = <any>await fetch(
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

export const getUserSubcription = async (accessToken: string) => {
	let error = "";

	let response = <any> await fetch(API_ROUTES.USER_PRICING, {
		headers: {
			'Authorization': `Basic ${accessToken}`
		},
	})
		.then(res => res.json())
		.then(json => json)
		.catch(err => error = err);

	if (response.error) {
		error = response.error.message;
	}
	if (error) {
		response = {};
	}
	return {
		response,
		error
	};
};
