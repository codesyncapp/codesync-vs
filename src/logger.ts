import fs from 'fs';
import os from 'os';
import yaml from 'js-yaml';
import AWS from 'aws-sdk';
import vscode from "vscode";

import { PutLogEventsRequest } from 'aws-sdk/clients/cloudwatchlogs';
import {
	AWS_REGION,
	CLIENT_LOGS_GROUP_NAME,
	DIFF_SOURCE,
	LOG_AFTER_X_TIMES
} from './constants';
import { readYML, isEmpty } from './utils/common';
import { generateSettings } from "./settings";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const VERSION = vscode.extensions.getExtension('codesync.codesync').packageJSON.version;

let cloudwatchlogs = <AWS.CloudWatchLogs>{};
const logErrorMsgTypes = {
	CRITICAL: "CRITICAL",
	ERROR: "ERROR",
	WARNING: "WARNING",
	INFO: "INFO",
	DEBUG: "DEBUG"
};

export class CodeSyncLogger {
	static info (msg: string, userEmail?: string, additionalMsg="", retryCount=0) {
		putLogEvent(msg, logErrorMsgTypes.INFO, userEmail, additionalMsg, retryCount);
	}

	static error (msg: string, userEmail?: string, additionalMsg="", retryCount=0) {
		putLogEvent(msg, logErrorMsgTypes.ERROR, userEmail, additionalMsg, retryCount);
	}
}

const putLogEvent = (msg: string, eventType: string, userEmail?: string, additionalMsg="", retryCount=0) => {
	let errorMsg = msg;
	if (additionalMsg) {
		errorMsg = `${msg}, ${additionalMsg}`;
	}
	console.log(errorMsg);
	const settings = generateSettings();
	if (!fs.existsSync(settings.USER_PATH)) return;
	const users = readYML(settings.USER_PATH);
	const sequenceTokenConfig = readYML(settings.SEQUENCE_TOKEN_PATH);
	let accessKey = '';
	let secretKey = '';
	let sequenceToken = '';
	let email = '';

	if (userEmail && userEmail in users) {
		const user = users[userEmail];
		email = userEmail;
		accessKey = user.access_key;
		secretKey = user.secret_key;
		sequenceToken = sequenceTokenConfig[userEmail];
	} else {
		Object.keys(users).forEach(function (_email, index) {
			if (index === 0) {
				email = _email;
				const user = users[email];
				accessKey = user.access_key;
				secretKey = user.secret_key;
				sequenceToken = sequenceTokenConfig[email];
			}
		});
	}

	if (!(accessKey && secretKey && email)) {
		return;
	}
	if (isEmpty(cloudwatchlogs)) {
		cloudwatchlogs = new AWS.CloudWatchLogs({
			accessKeyId: accessKey,
			secretAccessKey: secretKey,
			region: AWS_REGION
		});
	}

	const eventMsg = {
		msg: errorMsg,
		type: eventType,
		source: DIFF_SOURCE,
		version: VERSION,
		platform: os.platform()
	};
	const logEvents = [ /* required */
		{
			message: JSON.stringify(eventMsg), /* required */
			timestamp: new Date().getTime() /* required */
		}
	];
	const logGroupName = CLIENT_LOGS_GROUP_NAME;
	const logStreamName = email;

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
		if (errString.substr('DataAlreadyAcceptedException') || errString.substr('InvalidSequenceTokenException')) {
			const matches = errString.match(/(\d+)/);
			if (matches[0]) {
				sequenceTokenConfig[email] = matches[0];
				fs.writeFileSync(settings.SEQUENCE_TOKEN_PATH, yaml.safeDump(sequenceTokenConfig));
				if (retryCount) {
					if (retryCount < 10) {
						retryCount += 1;
						putLogEvent(msg, eventType, email, additionalMsg, retryCount);
					}
				} else {
					putLogEvent(msg, eventType, email, additionalMsg, 1);
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
