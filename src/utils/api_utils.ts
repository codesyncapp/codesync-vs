import fetch from "node-fetch";

import { apiRoutes } from "../constants";
import { generateApiUrl } from "./url_utils";


export const checkServerDown = async () => {
	let isDown = false;
	const response = <any>await fetch(apiRoutes().HEALTHCHECK)
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
	const response = <any>await fetch(apiRoutes().USERS, {
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
		apiRoutes().TEAM_ACTIVITY, {
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

	let response = <any>await fetch(apiRoutes().USER_PRICING, {
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


export const getRepoAvailableOrganizations = async (accessToken: string, repoName: string) => {
	let error = "";
	let orgs = <any>[];
	const url = `${apiRoutes().USER_ORGANIZATIONS}&repo_name=${repoName}`;
	const response = <any>await fetch(url, {
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
		orgs = response.orgs;
	}

	return {
		orgs,
		error
	};
};

export const getOrgTeams = async (accessToken: string, orgId: number) => {
	let error = "";
	let teams = <any>[];
	const orgTeamsUrl = generateApiUrl(`/orgs/${orgId}/teams`);
	const response = <any>await fetch(
		orgTeamsUrl, {
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
		teams = response.teams;
	}

	return {
		teams,
		error
	};
};