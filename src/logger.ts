import * as fs from 'fs';
import * as _ from 'lodash';
import * as yaml from 'js-yaml';
import * as AWS from 'aws-sdk';
import { PutLogEventsRequest } from 'aws-sdk/clients/cloudwatchlogs';
import {
	AWS_REGION,
	CLIENT_LOGS_GROUP_NAME,
	DIFF_SOURCE
} from './constants';
import { readYML } from './utils/common';
import {generateSettings} from "./settings";

let cloudwatchlogs = <AWS.CloudWatchLogs>{};

export function putLogEvent(error: string, userEmail?: string, retryCount?: number) {
	console.log(error);
	const settings = generateSettings();
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

	if (_.isEmpty(cloudwatchlogs)) {
		cloudwatchlogs = new AWS.CloudWatchLogs({
			accessKeyId: accessKey,
			secretAccessKey: secretKey,
			region: AWS_REGION
		});
	}

	const logEvents = [ /* required */
		{
			message: JSON.stringify({
				msg: error,
				source: DIFF_SOURCE
			}), /* required */
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
			sequenceTokenConfig[email] = data.nextSequenceToken;
			fs.writeFileSync(settings.SEQUENCE_TOKEN_PATH, yaml.safeDump(sequenceTokenConfig));
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
						putLogEvent(error, email, retryCount);
					}
				} else {
					putLogEvent(error, email, 1);
				}
			} else {
				console.log(err, err.stack);
			}
		} else {
			console.log(err, err.stack);
		}
	});
}
