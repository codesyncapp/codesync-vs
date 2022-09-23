import fs from 'fs';
import os from 'os';
import yaml from 'js-yaml';
import AWS from 'aws-sdk';
import vscode from "vscode";
import macaddress from "macaddress";

import { PutLogEventsRequest } from 'aws-sdk/clients/cloudwatchlogs';
import {
	DIFF_SOURCE,
	LOG_AFTER_X_TIMES
} from './constants';
import { readYML, isEmpty } from './utils/common';
import { generateSettings, LOGS_METADATA, PLUGIN_USER } from "./settings";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const VERSION = vscode.extensions.getExtension('codesync.codesync').packageJSON.version;

let cloudwatchlogs = <AWS.CloudWatchLogs>{};
let macAddress = "";
macaddress.one().then(mac => macAddress = mac);

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

	static debug (msg: string, additionalMsg="", logStream?: string, retryCount=0) {
		putLogEvent(msg, logErrorMsgTypes.DEBUG, additionalMsg, logStream, retryCount);
	}

	static info (msg: string, additionalMsg="", logStream?: string, retryCount=0) {
		putLogEvent(msg, logErrorMsgTypes.INFO, additionalMsg, logStream, retryCount);
	}

	static warning (msg: string, additionalMsg="", logStream?: string, retryCount=0) {
		putLogEvent(msg, logErrorMsgTypes.WARNING, additionalMsg, logStream, retryCount);
	}

	static error (msg: string, additionalMsg="", logStream?: string, retryCount=0) {
		putLogEvent(msg, logErrorMsgTypes.ERROR, additionalMsg, logStream, retryCount);
	}

	static critical (msg: string, additionalMsg="", logStream?: string, retryCount=0) {
		putLogEvent(msg, logErrorMsgTypes.CRITICAL, additionalMsg, logStream, retryCount);
	}

}

const putLogEvent = (msg: string, eventType: string, additionalMsg="", logStream?: string, retryCount=0) => {
	let eventMsg = msg;
	if (additionalMsg) {
		eventMsg = `${msg}, ${additionalMsg}`;
	}
	console.log(eventMsg);

	let email = "";
	let accessKey = "";
	let secretKey = "";

	const settings = generateSettings();

	if (!fs.existsSync(settings.USER_PATH) || !fs.existsSync(settings.SEQUENCE_TOKEN_PATH)) return;

	const users = readYML(settings.USER_PATH);
	const sequenceTokenConfig = readYML(settings.SEQUENCE_TOKEN_PATH);

	if (logStream) {
		const user = users[logStream];
		if (user && user.is_active) {
			email = logStream;
			accessKey = user.access_key;
			secretKey = user.secret_key;
		}
	} else {
		const activeUserEmail = Object.keys(users).filter(_email => users[_email].is_active)[0];
		if (activeUserEmail) {
			email = activeUserEmail;
			accessKey = users[activeUserEmail].access_key;
			secretKey = users[activeUserEmail].secret_key;
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
	
	const sequenceToken = email in sequenceTokenConfig ? sequenceTokenConfig[email] : "";

	if (isEmpty(cloudwatchlogs)) {
		cloudwatchlogs = new AWS.CloudWatchLogs({
			accessKeyId: accessKey,
			secretAccessKey: secretKey,
			region: LOGS_METADATA.AWS_REGION
		});
	}

	const logGroupName = LOGS_METADATA.GROUP;
	const logStreamName = email;

	const CWEventMsg = {
		msg: eventMsg,
		type: eventType,
		source: DIFF_SOURCE,
		version: VERSION,
		platform: os.platform(),
		mac_address: macAddress
		// TODO: Uniquly identify common user
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
		logStreamName,
	};

	if (sequenceToken) {
		params.sequenceToken = sequenceToken;
	}

	cloudwatchlogs.putLogEvents(params as unknown as PutLogEventsRequest, function(err: any, data) {

		if (!err) {
			// successful response
			updateSequenceToken(email, data.nextSequenceToken || "");
			return;
		}
		// an error occurred
		/*
		DataAlreadyAcceptedException: The given batch of log events has already been accepted.
		The next batch can be sent with sequenceToken: 49615429905286623782064446503967477603282951356289123634
		*/
		const errString = err.toString();
		if (errString.includes('DataAlreadyAcceptedException') || errString.includes('InvalidSequenceTokenException')) {
			const matches = errString.match(/(\d+)/);
			if (matches[0]) {
				sequenceTokenConfig[email] = matches[0];
				fs.writeFileSync(settings.SEQUENCE_TOKEN_PATH, yaml.safeDump(sequenceTokenConfig));
				if (retryCount) {
					if (retryCount < 10) {
						retryCount += 1;
						putLogEvent(msg, eventType, additionalMsg, email, retryCount);
					}
				} else {
					putLogEvent(msg, eventType, additionalMsg, email, 1);
				}
			} else {
				console.log(err, err.stack);
			}
		} else {
			console.log(err, err.stack);
		}
	});
};

export const updateSequenceToken = (email: string, nextSequenceToken: string) => {
	const settings = generateSettings();
	const sequenceTokenConfig = readYML(settings.SEQUENCE_TOKEN_PATH);
	sequenceTokenConfig[email] = nextSequenceToken;
	fs.writeFileSync(settings.SEQUENCE_TOKEN_PATH, yaml.safeDump(sequenceTokenConfig));
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
