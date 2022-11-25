import fetch from "node-fetch";

import { API_ROUTES } from "../constants";

export const updateRepo = async (accessToken: string, repoId: number, data: any) => {
	let error = "";
	let response = <any> await fetch(`${API_ROUTES.REPOS}/${repoId}`, {
		method: 'PATCH',
		body: JSON.stringify(data),
		headers: {
			'Content-Type': 'application/json',
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

export const getRepoPlanInfo = async (accessToken: string, repoId: number) => {
	let error = "";
	let response = <any> await fetch(`${API_ROUTES.REPOS}/${repoId}/upgrade_plan`, {
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

