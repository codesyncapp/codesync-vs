import fs, { stat } from 'fs';
import FormData from "form-data";
import fetch from "node-fetch";
import { isBinaryFileSync } from "isbinaryfile";
import { API_ROUTES, HttpStatusCodes } from "../constants";
import { PlanLimitsHandler } from './pricing_utils';
import { formatDatetime, readFile } from './common';
import { s3UploaderUtils } from '../init/s3_uploader';
import { RepoPlanLimitsState } from './repo_state_utils';


export const uploadRepoToServer = async (accessToken: string, data: any, repoId=null) => {
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
	let error = "";
	let errorCode = 0;
	let statusCode = 200;
	let response = await fetch(
		API_ROUTES.REPO_INIT, {
			method: 'POST',
			body: JSON.stringify(data),
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Basic ${accessToken}`
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
			statusCode = 500;
			return {error: {message: text ? text : "Failed to parse to JSON response"}, statusCode};
		}
	})
	.catch(err => error = err);

	if (response.error) {
		error = response.error.message;
		errorCode = response.error.error_code;
	}
	if (error) {
		response = {};
	}
	const limitsHandler = new PlanLimitsHandler(accessToken, repoId||0, data.repo_path);
	const msgShown = await limitsHandler.uploadRepo(statusCode, errorCode);

	return {
		response,
		error,
		msgShown
	};
};

export const uploadFile = async (accessToken: string, data: any, repoPath: string) => {
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
				'Authorization': `Basic ${accessToken}`
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
			statusCode = 500;
			return {error: {message: text ? text : "Failed to parse to JSON response", statusCode}};
		}
	})
	.catch(err => error = err);

	if (statusCode === HttpStatusCodes.PAYMENT_REQUIRED) {
		// Check if key is set or not
		const limitsHandler = new PlanLimitsHandler(accessToken, data.repo_id, repoPath);
        await limitsHandler.run();
	} else {
		const repoLimitsState = new RepoPlanLimitsState(repoPath);
        repoLimitsState.reset();
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
			error: `uploadFileTos3: File=${filePath} not found`
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
		formData.submit(presignedUrl.url, function(err, res) {
			if (err) resolve({error: err});
			resolve({error: null});
		});
	});
};


export const uploadFileToServer = async (accessToken: string, repoId: number, branch: string, filePath: string,
										relPath: string, addedAt: string, repoPath: string, commitHash: string|null) => {
	/*
	Uploads new file to server returns its ID
	*/
	// Get file info
	const fileInfo = fs.lstatSync(filePath);
	const isBinary = isBinaryFileSync(filePath);
	const data = {
		repo_id: repoId,
		branch: branch,
		commit_hash: commitHash,
		is_binary: isBinary,
		size: fileInfo.size,
		file_path: relPath,
		created_at: formatDatetime(fileInfo.ctimeMs),
		added_at: addedAt
	};
	const json = await uploadFile(accessToken, data, repoPath);
	if (json.error) {
		return {
			error: `serverError: ${json.error}`,
			statusCode: json.statusCode
		};
	}
	if (fileInfo.size && json.response.url) {
		const filePathAndURL = <any>{};
		filePathAndURL[relPath] = json.response.url;
		const uploader = new s3UploaderUtils();
		uploader.saveURLs(repoPath, branch, filePathAndURL);
	}

	return {
		error: null,
		fileId: json.response.id,
		statusCode: json.statusCode
	};
};
