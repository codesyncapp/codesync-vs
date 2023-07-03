import fs from 'fs';
import FormData from "form-data";
import fetch from "node-fetch";
import { isBinaryFileSync } from "isbinaryfile";
import { API_ROUTES } from "../constants";
import { getPlanLimitReached, resetPlanLimitReached, setPlanLimitReached } from './pricing_utils';
import { formatDatetime, readFile } from './common';


export const uploadRepoToServer = async (token: string, data: any) => {
	/*
    Response from server looks like
        {
            'repo_id': repo_id,
            'branch_id': branch_id,
			'file_path_and_id': {
				"file_1": 1,
				"directory/file_2": 2,
			},
			'urls': {
				"file_1": PRE_SIGNED_URL,
				"directory/file_2": PRE_SIGNED_URL,
			},
            'user': {
                'email': email,
                'iam_access_key': <key>,
                'iam_secret_key': <key>
            }
        }
	*/
	let error = '';
	let statusCode = null;
	let response = await fetch(
		API_ROUTES.REPO_INIT, {
			method: 'POST',
			body: JSON.stringify(data),
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Basic ${token}`
			},
		}
	)
	.then(res => {
		statusCode = res.status;
		return res.text();
	})
	.then(text => {
		try {
			return JSON.parse(text); // Try to parse the response as JSON
		} catch(err) {
			return {error: {message: text ? text : "Failed to parse to JSON response"}};
		}
	})
	.catch(err => error = err);

	if (statusCode === 402) {
		// Check if key is set or not
		await setPlanLimitReached(token);
	} else {
		const { planLimitReached } = getPlanLimitReached();
		if (planLimitReached) resetPlanLimitReached();
	}
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

export const uploadFile = async (token: string, data: any) => {
	/*
	Response from server looks like

    	{
    		'id': file_id,
    		'url': url
		}
	*/
	let error = "";
	let statusCode = 200;
	let response = await fetch(
		API_ROUTES.FILES, {
			method: 'POST',
			body: JSON.stringify(data),
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Basic ${token}`
			},
		}
	)
	.then(res => {
		statusCode = res.status;
		return res.text();
	})
	.then(text => {
		try {
			return {...JSON.parse(text), statusCode}; // Try to parse the response as JSON
		} catch(err) {
			return {error: {message: text ? text : "Failed to parse to JSON response", statusCode}};
		}
	})
	.catch(err => error = err);

	if (statusCode === 402) {
		// Check if key is set or not
		await setPlanLimitReached(token);
	} else {
		const { planLimitReached } = getPlanLimitReached();
		if (planLimitReached) resetPlanLimitReached();
	}

	if (response.error) {
		error = response.error.message;
	}
	if (error) {
		response = {};
	}
	return {
		response,
		error,
		statusCode
	};
};

export const uploadFileTos3 = async (filePath: string, presignedUrl: any) => {
	if (!fs.existsSync(filePath)) {
		return {
			error: `file not found on : ${filePath}`
		};
	}

	return await new Promise((resolve, reject) => {
		// reject raises an expcetion so not using it
		let content;
		try {
			content = readFile(filePath);
		} catch (e) {
			resolve({error: `Could not read file: ${filePath}`});
		}
		const formData = new FormData();
		Object.keys(presignedUrl.fields).forEach(key => {
			formData.append(key, presignedUrl.fields[key]);
		});
		// Actual file has to be appended last.
		formData.append("file", content);
		console.log("presignedUrl", presignedUrl);
		formData.submit(presignedUrl.url, function(err, res) {
			console.log("ERROR", err, res);
			if (err) resolve({error: err});
			resolve({error: null});
		});
	});
};

export const uploadFileToServer = async (accessToken: string, repoId: number, branch: string, filePath: string,
										relPath: string, addedAt: string) => {
	/*
	Uploads new file to server returns its ID
	*/
	// Get file info
	const fileInfo = fs.lstatSync(filePath);
	const isBinary = isBinaryFileSync(filePath);
	const data = {
		repo_id: repoId,
		branch: branch,
		is_binary: isBinary,
		size: fileInfo.size,
		file_path: relPath,
		created_at: formatDatetime(fileInfo.ctimeMs),
		added_at: addedAt
	};
	const json = await uploadFile(accessToken, data);
	if (json.error) {
		return {
			error: `serverError: ${json.error}`,
			statusCode: json.statusCode
		};
	}
	if (fileInfo.size && json.response.url) {
		const s3json = await uploadFileTos3(filePath, json.response.url);
		const error = (s3json as any).error;
		if (error) {
			return {
				error: `s3Error: ${error}`,
				fileId: json.response.id,
				statusCode: json.statusCode
			};
		}
	}
	return {
		error: null,
		fileId: json.response.id,
		statusCode: json.statusCode
	};
};
