import fs from 'fs';
import os from 'os';
import macaddress from "macaddress";
import { 
	CloudWatchLogsClient,
	PutLogEventsCommand,
	PutLogEventsRequest
} from "@aws-sdk/client-cloudwatch-logs";

import {
	VSCODE,
	LOG_AFTER_X_TIMES,
	VERSION
} from './constants';
import { readYML, isEmpty, getActiveUsers } from './utils/common';
import { generateSettings, LOGS_METADATA, PLUGIN_USER } from "./settings";

let macAddress = "";
macaddress.one().then(mac => macAddress = mac);

let cloudWatchClient = <CloudWatchLogsClient>{};

const logErrorMsgTypes = {
	CRITICAL: "CRITICAL",
	ERROR: "ERROR",
	WARNING: "WARNING",
	INFO: "INFO",
	DEBUG: "DEBUG"
};

export class CodeSyncLogger {
	/*
	  DEBUG: for developer oriented messages, only usable for brief testing of new features and should be removed once new features are fully tested.
	  INFO: Informational messages, could be useful while debugging but can be ignore during normal execution.
	  WARNING: Mild errors that do not affect the user but should be fixed in some time frame
	  ERROR: Errors that cause a bad UX and should be fixed soon.
	  CRITICAL: Errors that are blocking for the normal operation of the plugin and should be fixed immediately.
	*/

	static async debug (msg: string, additionalMsg="", logStream?: string, retryCount=0) {
		await putLogEvent(msg, logErrorMsgTypes.DEBUG, additionalMsg, logStream, retryCount);
	}

	static async info (msg: string, additionalMsg="", logStream?: string, retryCount=0) {
		await putLogEvent(msg, logErrorMsgTypes.INFO, additionalMsg, logStream, retryCount);
	}

	static async warning (msg: string, additionalMsg="", logStream?: string, retryCount=0) {
		await putLogEvent(msg, logErrorMsgTypes.WARNING, additionalMsg, logStream, retryCount);
	}

	static async error (msg: string, additionalMsg="", logStream?: string, retryCount=0) {
		await putLogEvent(msg, logErrorMsgTypes.ERROR, additionalMsg, logStream, retryCount);
	}

	static async critical (msg: string, additionalMsg="", logStream?: string, retryCount=0) {
		await putLogEvent(msg, logErrorMsgTypes.CRITICAL, additionalMsg, logStream, retryCount);
	}

}

const putLogEvent = async (msg: string, eventType: string, additionalMsg="", logStream?: string, retryCount=0) => {
	let eventMsg = msg;
	if (additionalMsg) {
		eventMsg = `${msg}, ${additionalMsg}`;
	}
	console.log(eventMsg);

	let email = "";
	let accessKey = "";
	let secretKey = "";

	const settings = generateSettings();

	if (!fs.existsSync(settings.USER_PATH)) return;

	const users = readYML(settings.USER_PATH);

	if (logStream) {
		const user = users[logStream];
		if (user && user.is_active) {
			email = logStream;
			accessKey = user.access_key;
			secretKey = user.secret_key;
		}
	} else {
		const activeUser = getActiveUsers()[0];
		if (activeUser) {
			email = activeUser.email;
			accessKey = users[email].access_key;
			secretKey = users[email].secret_key;
		}
	}
	
	// Set default user for logging
	if (!(accessKey && secretKey && email)) {
		email = PLUGIN_USER.logStream;
		const pluginUser = users[email];
		if (!pluginUser) return;
		accessKey = pluginUser.access_key;
		secretKey = pluginUser.secret_key;
	}

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	// Recreate client if accessKey is changed
	if (isEmpty(cloudWatchClient) || cloudWatchClient.config.accessKeyId != accessKey) {
		const config = {
			accessKeyId: accessKey,
			secretAccessKey: secretKey,
			region: LOGS_METADATA.AWS_REGION
		};
		cloudWatchClient = new CloudWatchLogsClient(config);
	}

	const logGroupName = LOGS_METADATA.GROUP;
	const logStreamName = email;

	const CWEventMsg = {
		msg: eventMsg,
		type: eventType,
		source: VSCODE,
		version: VERSION,
		platform: os.platform(),
		mac_address: macAddress
	};
	const logEvents = [ /* required */
		{
			message: JSON.stringify(CWEventMsg), /* required */
			timestamp: new Date().getTime() /* required */
		}
	];

	const params = <PutLogEventsRequest>{
		logEvents,
		logGroupName,
		logStreamName
	};

	const command = new PutLogEventsCommand(params);
	try {
		await cloudWatchClient.send(command);
	} catch (err) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		console.log(`Failed to log: ${err}`);
		if (retryCount) {
			if (retryCount < 10) {
				retryCount += 1;
				putLogEvent(msg, eventType, additionalMsg, email, retryCount);
			}
		} else {
			putLogEvent(msg, eventType, additionalMsg, email, 1);
		}
	}
};


export const logErrorMsg = (msg: string, errCount: number) => {
	if (errCount === 0 || errCount > LOG_AFTER_X_TIMES) {
		CodeSyncLogger.error(msg);
	}
	if (errCount > LOG_AFTER_X_TIMES) {
		errCount = 0;
		return errCount;
	}
	errCount += 1;
	return errCount;
};
