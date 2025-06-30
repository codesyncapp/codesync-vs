import { putLogEvent as AWSputLogEvent } from "./utils/logging_service/aws_logging";
import { putLogEvent as GCPputLogEvent } from "./utils/logging_service/gcp_logging";
import { LOG_AFTER_X_TIMES } from "./constants";


// const isGCPEnabled = process.env.GCP_LOGGING_ENABLED === "true";
// const isAWSEnabled = process.env.AWS_LOGGING_ENABLED === "true";

const isGCPEnabled = true;
const isAWSEnabled = false;

const putLogEvent = async (
  msg: string,
  eventType: string,
  additionalMsg = "",
  logStream?: string
) => {
  if (isGCPEnabled) {
    return GCPputLogEvent(msg, eventType, additionalMsg, logStream);
  } else if (isAWSEnabled) {
    return AWSputLogEvent(msg, eventType, additionalMsg, logStream);
  } else {
    console.warn("⚠️ No logging provider enabled.");
    return;
  }
};

const logErrorMsgTypes = {
  CRITICAL: "CRITICAL",
  ERROR: "ERROR",
  WARNING: "WARNING",
  INFO: "INFO",
  DEBUG: "DEBUG",
};

export class CodeSyncLogger {
  /*
	  DEBUG: for developer oriented messages, only usable for brief testing of new features and should be removed once new features are fully tested.
	  INFO: Informational messages, could be useful while debugging but can be ignore during normal execution.
	  WARNING: Mild errors that do not affect the user but should be fixed in some time frame
	  ERROR: Errors that cause a bad UX and should be fixed soon.
	  CRITICAL: Errors that are blocking for the normal operation of the plugin and should be fixed immediately.
	*/

  static async debug(msg: string, additionalMsg = "", logStream?: string) {
    await putLogEvent(msg, logErrorMsgTypes.DEBUG, additionalMsg, logStream);
  }

  static async info(msg: string, additionalMsg = "", logStream?: string) {
    await putLogEvent(msg, logErrorMsgTypes.INFO, additionalMsg, logStream);
  }

  static async warning(msg: string, additionalMsg = "", logStream?: string) {
    await putLogEvent(msg, logErrorMsgTypes.WARNING, additionalMsg, logStream);
  }

  static async error(msg: string, additionalMsg = "", logStream?: string) {
    await putLogEvent(msg, logErrorMsgTypes.ERROR, additionalMsg, logStream);
  }

  static async critical(msg: string, additionalMsg = "", logStream?: string) {
    await putLogEvent(msg, logErrorMsgTypes.CRITICAL, additionalMsg, logStream);
  }
}

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
