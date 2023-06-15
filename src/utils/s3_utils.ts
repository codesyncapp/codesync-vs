import fetch from "node-fetch";
import { PLUGIN_USER, SYNCIGNORE_URL } from "../settings";


export const getPluginUser = async () => {
	let error = "";
	const response = <any> await fetch(PLUGIN_USER.url)
		.then(res => res.json())
		.then(json => json)
		.catch(err => error = err);
	return {
		user: {...response},
		error
	};
};

export const getSyncignore = async () => {
	let error = "";
	const response = <any> await fetch(SYNCIGNORE_URL)
		.then(res => res.text())
		.then(content => content)
		.catch(err => error = err);

	return {
		content: response,
		error
	};
};
