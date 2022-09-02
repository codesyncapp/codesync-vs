import fs from 'fs';
import vscode from 'vscode';
import FormData from "form-data";
import fetch from "node-fetch";
import { isBinaryFileSync } from "isbinaryfile";
import { API_ROUTES } from "../constants";
import { setPlanLimitReached } from './pricing_utils';


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
		return res.json();
	})
	.then(json => json)
	.catch(err => error = err);

	if (statusCode === 402) {
		// Check if key is set or not
		await setPlanLimitReached(token);
	} else {
		vscode.commands.executeCommand('setContext', 'upgradePricingPlan', false);
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
	let statusCode = null;
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
		return res.json();
	})
	.then(json => json)
	.catch(err => error = err);

	if (statusCode === 402) {
		// Check if key is set or not
		await setPlanLimitReached(token);
	} else {
		vscode.commands.executeCommand('setContext', 'upgradePricingPlan', false);
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

export const uploadFileTos3 = async (filePath: string, presignedUrl: any) => {
	if (!fs.existsSync(filePath)) {
		return {
			error: `file not found on : ${filePath}`
		};
	}

	return new Promise((resolve, reject) => {
		// reject raises an expcetion so not using it
		let content;
		try {
			content = fs.readFileSync(filePath, "utf8");
		} catch (e) {
			resolve({error: `Could not read file: ${filePath}`});
		}
		const formData = new FormData();
		Object.keys(presignedUrl.fields).forEach(key => {
			formData.append(key, presignedUrl.fields[key]);
		});
		// Actual file has to be appended last.
		formData.append("file", content);
		formData.submit(presignedUrl.url, function(err, res) {
			if (err) {
				resolve({error: err});
			}
			resolve({error: null});
		});
	});
};

export const uploadFileToServer = async (accessToken: string, repoId: number, branch: string, filePath: string,
										relPath: string, createdAt: string) => {
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
		created_at: createdAt,
	};
	const json = await uploadFile(accessToken, data);
	if (json.error) {
		return {
			error: `serverError: ${json.error}`
		};
	}
	if (fileInfo.size && json.response.url) {
		const s3json = await uploadFileTos3(filePath, json.response.url);
		const error = (s3json as any).error;
		if (error) {
			return {
				error: `s3Error: ${error}`,
				fileId: json.response.id
			};
		}
	}
	return {
		error: null,
		fileId: json.response.id
	};
};
