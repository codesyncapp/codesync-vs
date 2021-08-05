import fetch from "node-fetch";

import { API_ENDPOINT } from "../constants";

export const updateRepo = async (accessToken: string, repoId: number, data: any) => {
	let error = "";
	const response = await fetch(`${API_ENDPOINT}/repos/${repoId}`, {
		method: 'patch',
		body: JSON.stringify(data),
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Basic ${accessToken}`
		},
	})
		.then(res => res.json())
		.then(json => json)
		.catch(err => error = err);

	return {
		response,
		error
	};

};
