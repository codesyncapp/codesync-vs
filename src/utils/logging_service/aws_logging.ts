import fs from "fs";
import os from "os";
import macaddress from "macaddress";
import {
  CloudWatchLogsClient,
  CloudWatchLogsClientConfig,
  PutLogEventsCommand,
  PutLogEventsRequest,
} from "@aws-sdk/client-cloudwatch-logs";

import { VSCODE, VERSION } from "../../constants";
import { readYML, isEmpty } from "../../utils/common";
import { generateSettings, PLUGIN_USER } from "../../settings";
import { UserState } from "../../utils/user_utils";
import { getSystemConfig } from "../../utils/setup_utils";

let macAddress = "";
macaddress.one().then((mac) => (macAddress = mac));

let cloudWatchClient = <CloudWatchLogsClient>{};

export const putLogEvent = async (
  msg: string,
  eventType: string,
  additionalMsg = "",
  logStream?: string
) => {
  let eventMsg = msg;
  if (additionalMsg) {
    eventMsg = `${msg}, ${additionalMsg}`;
  }
  // console.log(eventMsg);

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
    const userState = new UserState();
    const activeUser = userState.getUser();
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
    // console.log("xD pluginUser:", pluginUser);
    if (!pluginUser) return;
    accessKey = pluginUser.access_key;
    secretKey = pluginUser.secret_key;
  }

  if (isEmpty(cloudWatchClient)) {
    cloudWatchClient = __createClient(accessKey, secretKey);
  } else {
    // Recreate client if accessKey is changed
    const credentials = await cloudWatchClient.config.credentials();
    if (credentials.accessKeyId !== accessKey) {
      cloudWatchClient = __createClient(accessKey, secretKey);
    }
  }

  const logGroupName = getSystemConfig().CW_LOGS_GROUP;
  const logStreamName = email;

  const CWEventMsg = {
    msg: eventMsg,
    type: eventType,
    source: VSCODE,
    version: VERSION,
    platform: os.platform(),
    mac_address: macAddress,
  };
  const logEvents = [
    /* required */
    {
      message: JSON.stringify(CWEventMsg) /* required */,
      timestamp: new Date().getTime() /* required */,
    },
  ];

  const params = <PutLogEventsRequest>{
    logEvents,
    logGroupName,
    logStreamName,
  };

  const command = new PutLogEventsCommand(params);
  try {
    await cloudWatchClient.send(command);
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    console.log(`Failed to log: ${err}`);
  }
};

const __createClient = (accessKeyId: string, secretAccessKey: string) => {
  const config: CloudWatchLogsClientConfig = {
    region: getSystemConfig().AWS_REGION,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  };
  return new CloudWatchLogsClient(config);
};
