import { Logging } from "@google-cloud/logging";
import os from "os";
import macaddress from "macaddress";
import { VSCODE, VERSION } from "../../constants";
import { generateSettings, PLUGIN_USER } from "../../settings";
import { readYML } from "../../utils/common";
import { UserState } from "../../utils/user_utils";
import fs from "fs";

const logging = new Logging({
  projectId: "codesync-280105",
  credentials: {
    client_email: "testlogging@codesync-280105.iam.gserviceaccount.com",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDHjxDAdcFtjiKx\ngdtLajcffAqNIP7aRhKJg6hLhBk9Iqq6eNybdB6ydUDrpDFQxo3DTG/3wExxPiJ3\n1TWqTxSx4p49jLQfsqiQkWIuNQDKUIvcE2PtPAYmYngrPlK3AVQXJR7xKjbxRsCk\noDcHzaP9vonlz6Z718pHMIg7WtdeMuVp228H3zzOqFmquQLt6M5WNxksFhsj2axx\njmton0NTS+wW88HZrgRZXPB1Gf9igA+0e3w2egoYrWZ9ObEK5i4Zgp+MSvcV8FOI\nQfB745lB/YaPpTUtlkxkEnE0Xs85q/xt7UnPC4sa/pKAY1agLhYn1ZHz4rx2AGfL\n8D+w4W3jAgMBAAECggEAMo8Qk3JCG1uTdp2LzcOPS67FjZP6fZqbP7PXg6poKpEJ\n6EyOt+PnkxcZ55ml1O05JW3MQFy8AUTYvruJ6Sg3+gmMRdPMHuvIwTfURBixppBZ\nntxayNQYSslP4MTdd/giMer5t+gWG3Ltg8gDqTp0fek0TsEZUO8PFJI7Ma6GOhsA\nYrDRBi0BvLeMh0shnamrXYlgxfJSEHR5zzBJKthSYGwcgamgeOWYCXLRu4QsJe7l\n9+l/97BAEh1/kg8wLTY6z/BheCm5sEHazNaoOvfz/Kt/gAUWewzunvOrcZ7Q3CSl\nsHdwhhrWcajFlF+Qe3G6cBre9eUgCFcCcAog4qPBAQKBgQDqJ7b9bXGLr++RhHN2\nwY5Jq/fAsTnG/Hd1ONMj1SKNZ3ujrrpnKylnHSGnU2lJfa9gCsg0iZLYEyHIFSsN\nS0sRuPkxU5I9YgP5oYLtEI/tTrj2qk81zq7MZ+kIzQ1bcsaXUBA2Z/H/iagicAZf\nDZ0jqwnwZMrHMr9BSuZIKfKs4QKBgQDaLRf9jWJoQkliGbIjQdOQdOPJ93Or3sG1\n5p0toCspXASgwW4skus4yVrAPuS0gSsJebpP+5fTz+2mrWVBETjtyAjidvX/q3sy\novI/B+iv4z22wa42IhrYy1gOd1Fp/LZfbPiguxtTQO36MPhOLNXOQgB/kOF42RH9\ngcUwQN0PQwKBgQCpCTiZ5Ps2OzE4HKT6Eyqz1nhJW+d41eMq9XW/BWsnJ5BjDo00\nUz1VWftkftugGSKUs9Pp0XL3l4Aon9dvhm5QAfeq+0i0FWEHQehxWSZ9yvnN4A7E\nqksX9t+M4fKFlOr2au75R7q0ndyJ19NRpVNOX3gSWcDlYqYc7YQmjlnJIQKBgADj\njCR5TfxUwM3IgwRHwV/mSgNJocwCdVGTZfKIo4Rgnpg1EYjW9GRf1aHQ38eoew9n\n0o1+3eh8AWDbdf0k39GALiEWEPyAq1jSdyAwnQ8SYu76rQYFb4yQj4RHkipXYDrV\nS9ID0SGuswmA55IR9rEHbc8XPQPsBnm87Ju8t+nXAoGBAMax+/8sRIoU9sOk5/lD\nBheDpOHvJTTQAM6H9ybZJIOT5j548rY+RqHmFbqE1g3yTUVpZy4zffC7x0Uq5+0Y\nsRT+fn7qGLAfiJQv2GTnta1Hjl3O01lT8XjmyjwpcNifboxaSmxgc7f2CBzvZKbv\nzhWwMBoytTj+Y3f+IoLMAVnb\n-----END PRIVATE KEY-----\n".replace(
        /\\n/g,
        "\n"
      ),
  },
});

let macAddress = "";
macaddress.one().then((mac) => (macAddress = mac));

export const putLogEvent = async (
  msg: string,
  eventType: string,
  additionalMsg = "",
  logName?: string
) => {
  const eventMsg = additionalMsg ? `${msg}, ${additionalMsg}` : msg;
  console.log(eventMsg);

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
    severity: eventType, // e.g., INFO, ERROR, etc.
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
  } catch (err) {
    console.log(`Failed to log to GCP: ${err}`);
  }
};
