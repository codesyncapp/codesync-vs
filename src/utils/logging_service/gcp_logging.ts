import os from "os";
import macaddress from "macaddress";
import { Logging } from "@google-cloud/logging";

import { VSCODE, VERSION } from "../../constants";
import { UserState } from "../../utils/user_utils";

// Utility to get MAC address once
let macAddress = "";
macaddress.one().then((mac) => (macAddress = mac));

// Log Levels
export const logErrorMsgTypes = {
  CRITICAL: "CRITICAL",
  ERROR: "ERROR",
  WARNING: "WARNING",
  INFO: "INFO",
  DEBUG: "DEBUG",
};

// Helper to return a Logging instance (optionally using dynamic credentials)
const getLoggerInstance = (info: {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}) =>
  new Logging({
    projectId: info.projectId,
    credentials: {
      client_email: info.clientEmail,
      private_key: info.privateKey.replace(/\\n/g, "\n"),
    },
  });

export const putLogEvent = async (
  msg: string,
  eventType: string,
  additionalMsg = "",
  info: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
    userEmail: string;
  },
  logName?: string
) => {
  const eventMsg = additionalMsg ? `${msg}, ${additionalMsg}` : msg;
  const userState = new UserState();
  const activeUser = userState.getUser();
  let email = "";

  if (logName && activeUser?.email === logName) {
    email = logName;
  } else {
    email = info?.userEmail;
  }

  const logging = getLoggerInstance(info);
  const log = logging.log("vs-code");

  const metadata = {
    resource: { type: "global" },
    severity: eventType,
    labels: {
      email,
      type: eventType,
    },
  };

  const logEntry = log.entry(metadata, {
    msg: eventMsg,
    type: eventType,
    source: VSCODE,
    version: VERSION,
    platform: os.platform(),
    mac_address: macAddress,
    timestamp: new Date().toISOString(),
  });

  try {
    await log.write(logEntry);
    console.log(`✅ Logged to GCP: ${eventType} - ${msg}`);
  } catch (err) {
    console.error("❌ Failed to log to GCP:", err);
  }
};
