import * as fs from 'fs';
import * as yaml from 'js-yaml';
import fetch from "node-fetch";
import { client } from "websocket";

import { putLogEvent } from './logger';
import { readYML } from './utils/common';
import { IDiff, IFileToDiff, IRepoDiffs } from './interface';
import { RESTART_DAEMON_AFTER, DIFFS_REPO, API_HEALTHCHECK, DIFF_FILES_PER_ITERATION,
	REQUIRED_DIFF_KEYS, DIFF_SIZE_LIMIT, REQUIRED_FILE_RENAME_DIFF_KEYS,
	REQUIRED_DIR_RENAME_DIFF_KEYS, CONFIG_PATH, WEBSOCKET_ENDPOINT} from "./constants";


const recallDaemon = () => {
	console.log('recallDaemon');
	// Recall daemon after X seconds
	setTimeout(() => {
		handleBuffer();
	}, RESTART_DAEMON_AFTER);	
};

const isValidDiff = (diffData: IDiff) => {
	const missingKeys = REQUIRED_DIFF_KEYS.filter(key => !(key in diffData));
	if (missingKeys.length) { return false; }
	const isRename = diffData.is_rename;
	const isDirRename = diffData.is_dir_rename;
	const diff = diffData.diff;
	if (diff && diff.length > DIFF_SIZE_LIMIT) { return false; }
	if (isRename || isDirRename) {
		if (!diff) { return false; }
		let diffJSON = {};
		try {
			diffJSON = yaml.load(diff);
		} catch (e) {
			return false;
		}
		if (isRename) {
			const missingRenameKeys = REQUIRED_FILE_RENAME_DIFF_KEYS.filter(key => !(key in diffJSON));
			if (missingRenameKeys.length) { return false; }
		}
		if (isDirRename) {
			const missingDirRenameKeys = REQUIRED_DIR_RENAME_DIFF_KEYS.filter(key => !(key in diffJSON));
			if (missingDirRenameKeys.length) { return false; }
		}
	}
	return true;
};

const checkServerDown = async () => {
	let isDown = false;
	const response = await fetch(API_HEALTHCHECK)
	.then(res => res.json())
    .then(json => json)
	.catch(err => isDown = true);
	return isDown || !response.status;
};

const connect = async() => {
    return new Promise(function(resolve, reject) {
		const WebSocketClient = new client();
		WebSocketClient.connect(WEBSOCKET_ENDPOINT);

		WebSocketClient.on('connectFailed', function(error) {
			console.log('Connect Error: ' + error.toString());
			reject(WebSocketClient);
		});
		
		WebSocketClient.on('connect', function(connection) {
			console.log('WebSocket Client Connected');
			resolve(WebSocketClient);
		});

    });
};

export async function handleBuffer() {
	try {
		let diffFiles = fs.readdirSync(DIFFS_REPO);
		// Pick only yml files
		diffFiles = diffFiles.filter(file => file.endsWith('.yml'));
		if (!diffFiles.length) { return recallDaemon(); }
	
		// Read config.json
		const configJSON = readYML(CONFIG_PATH);
		if (!configJSON) { return; }

		diffFiles = diffFiles.slice(0, DIFF_FILES_PER_ITERATION);

		const isServerDown = await checkServerDown();
		if (isServerDown) { return recallDaemon(); }

		const repoDiffs: IRepoDiffs[] = [];

		diffFiles.forEach((diffFile) => {
			const filePath = `${DIFFS_REPO}/${diffFile}`;
			const diffData = readYML(filePath);
			if (!diffData) { return; }
			if (!isValidDiff(diffData)) { 
				putLogEvent(`Skipping invalid diff file: ${diffData}, file: ${diffFile}`);
				fs.unlinkSync(filePath);
				return;
			}
			if (!(diffData.repo_path in configJSON.repos)) {
				putLogEvent(`Repo ${diffData.repo_path} is in buffer.yml but not in config.yml`);
				return;
			}
			const configRepo = configJSON.repos[diffData.repo_path];
			if (!(diffData.branch in configRepo.branches)) {
				putLogEvent(`Branch: ${diffData.branch} is not synced for Repo ${diffData.repo_path}`, 
				configRepo.email);
			}

			// Group diffs by repo_path
			const fileToDiff = <IFileToDiff>{};
			fileToDiff.file_path = filePath;
			fileToDiff.diff = diffData;

			const index = repoDiffs.findIndex((repoDiff) => repoDiff.path === diffData.repo_path);
			if (index > -1) {
				repoDiffs[index].file_to_diff.push(fileToDiff);
			} else {
				const newRepoDiff = <IRepoDiffs>{};
				newRepoDiff.path = diffData.repo_path;
				newRepoDiff.file_to_diff = [fileToDiff];
				repoDiffs.push(newRepoDiff);
			}
		});

		// await connect().then(function(client: any) {

		const WebSocketClient = new client();
		WebSocketClient.connect(WEBSOCKET_ENDPOINT);

		WebSocketClient.on('connectFailed', function(error) {
			console.log('Connect Error: ' + error.toString());
		});
		
		WebSocketClient.on('connect', function(connection) {
			// Iterate repoDiffs and send to server
			repoDiffs.forEach((repoDiff) => {
				const configRepo = configJSON.repos[repoDiff.path];
				repoDiff.file_to_diff.forEach((fileToDiff) => {
					const diffData = fileToDiff.diff;
					const configFiles = configRepo['branches'][diffData.branch];
					const relPath = diffData.file_relative_path;
					const isBinary = diffData.is_binary;
					const isDeleted = diffData.is_deleted;
					const isRename = diffData.is_rename;
					if (!isBinary && !isDeleted && !diffData.diff) {
						putLogEvent(`Empty diff found in file: ${fileToDiff.file_path}`);
						fs.unlinkSync(fileToDiff.file_path);
					}
					const fileId = configFiles[relPath];
					// Diff data to be sent to server
					const diffToSend = {
						'file_id': fileId,
						'diff': diffData.diff,
						'is_deleted': isDeleted,
						'is_rename': isRename,
						'is_binary': isBinary,
						'created_at': diffData.created_at,
						'path': relPath
					};
					const accessToken = configRepo.token;
					// const response = connection.send(accessToken);

					// connection.on('message', function(message) {
					// 	if (message.type === 'utf8') {
					// 		console.log("Received: '" + JSON.parse(message) + "'");
					// 	}
					// });
					// const response = connection.send(JSON.stringify({'diffs': [diffToSend]}));
					// console.log(response);
				});
	
			});
		});

		// }).catch(function(err) {
		// 	// error here
		// 	console.log("Socket connection failed: ", err);
		// });
		console.log("Iteration completed");
		
	} catch {
		console.log("Daemon failed");
	}

	recallDaemon();

}
