import fetch from "node-fetch";

import { API_ROUTES, generateAPIUrl } from "../constants";

export const updateRepo = async (accessToken: string, repoId: number, data: any) => {
	let error = "";
	const url = generateAPIUrl(`${API_ROUTES.REPOS}/${repoId}`);
	let response = <any> await fetch(url, {
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
	const url = generateAPIUrl(`${API_ROUTES.REPOS}/${repoId}/upgrade_plan`);
	let response = <any> await fetch(url, {
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

