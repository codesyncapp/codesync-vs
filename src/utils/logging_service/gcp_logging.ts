import { Logging } from "@google-cloud/logging";
import os from "os";
import macaddress from "macaddress";
import { VSCODE, VERSION } from "../../constants";
import { generateSettings, PLUGIN_USER } from "../../settings";
import { readYML } from "../../utils/common";
import { UserState } from "../../utils/user_utils";
import fs from "fs";
import path from "path";

// const logging = new Logging({
//   projectId: "codesync-280105",
//   keyFilename: path.join(__dirname, "/gcp-key.json"),
// });

const logging = new Logging({ projectId: "codesync-280105" });

let macAddress = "";

macaddress.one().then((mac) => (macAddress = mac));

export const putLogEvent = async (
  msg: string,
  eventType: string,
  additionalMsg = "",
  logName?: string
) => {
  const eventMsg = additionalMsg ? `${msg}, ${additionalMsg}` : msg;

  let email = "";
  const settings = generateSettings();
  if (!fs.existsSync(settings.USER_PATH)) return;

  const users = readYML(settings.USER_PATH);

  if (logName && users[logName]?.is_active) {
    email = logName;
  } else {
    const userState = new UserState();
    const activeUser = userState.getUser();
    if (activeUser) email = activeUser.email;
  }

  // Fallback to plugin user
  if (!email) {
    email = PLUGIN_USER.logStream;
    if (!users[email]) return;
  }
  const log = logging.log("vs-code"); // Custom log name

  const metadata = {
    resource: { type: "global" },
    severity: eventType,
    labels: { email, type: eventType },
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
    console.log("xD: Writing log entry:", eventMsg);
    await log.write(logEntry);
    console.log("xD: ✅ Log entry written successfully:", eventMsg);
  } catch (err: any) {
    console.error("xD: ❌ Error writing log entry:", err.message);
    if (err.code === 7) {
      console.error(
        "xD: ❌ Not authorized. Ask user to run `gcloud auth application-default login`."
      );
    } else {
      console.error("xD: ❌ Logging failed:", err.message);
    }
  }
};
