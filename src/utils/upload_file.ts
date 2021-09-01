import fs from 'fs';
import FormData from "form-data";
import fetch from "node-fetch";
import { isBinaryFileSync } from "isbinaryfile";
import { API_FILES } from "../constants";


export const uploadFile = async (token: string, data: any) => {
	let error = "";
	let response = await fetch(API_FILES, {
			method: 'post',
			body: JSON.stringify(data),
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Basic ${token}`
			},
		}
	)
	.then(res => res.json())
	.then(json => json)
	.catch(err => error = err);

	if ("error" in response) {
		error = response.error;
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
		const content = fs.readFileSync(filePath, "utf8");
		const formData = new FormData();
		Object.keys(presignedUrl.fields).forEach(key => {
			formData.append(key, presignedUrl.fields[key]);
		});
		// Actual file has to be appended last.
		formData.append("file", content);
		formData.submit(presignedUrl.url, function(err, res) {
			if (err) reject(err);
			resolve(null);
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
			error: json.error
		};
	}
	if (fileInfo.size && json.response.url) {
		const s3jsonError = await uploadFileTos3(filePath, json.response.url);
		if (s3jsonError) {
			return {
				error: s3jsonError
			};
		}
	}
	return {
		error: null,
		fileId: json.response.id
	};
};
