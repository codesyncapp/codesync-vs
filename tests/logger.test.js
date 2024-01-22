import fs from "fs";
import yaml from "js-yaml";
import { 
	CloudWatchLogsClient,
    PutLogEventsCommand
} from "@aws-sdk/client-cloudwatch-logs";

import untildify from "untildify";

import {getUserFilePath, randomBaseRepoPath, TEST_EMAIL, TEST_USER} from "./helpers/helpers";
import {LOGS_METADATA, PLUGIN_USER} from "../src/settings";
import {CodeSyncLogger} from "../src/logger";
import {addPluginUser} from "../src/utils/setup_utils";


describe("putLogEvent",  () => {
    const baseRepoPath = randomBaseRepoPath("putLogEvent");
    const userFilePath = getUserFilePath(baseRepoPath);

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.writeFileSync(userFilePath, yaml.dump({}));
    });

    afterEach(() => {
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No user.yml", () => {
        CodeSyncLogger.error("Error message");
        expect(CloudWatchLogsClient.mock.instances).toHaveLength(0);
    });

    test("No User in user.yml, use system user", async () => {
        const errMsg = "Error message";
        fetchMock.mockResponseOnce(JSON.stringify({
            IAM_ACCESS_KEY: "IAM_ACCESS_KEY",
            IAM_SECRET_KEY: "IAM_SECRET_KEY"
        }));
        await addPluginUser();
        CodeSyncLogger.error(errMsg);
        expect(CloudWatchLogsClient.mock.calls[0][0]).toStrictEqual({
            region: LOGS_METADATA.AWS_REGION,
            credentials: {
                accessKeyId: "IAM_ACCESS_KEY",
                secretAccessKey: "IAM_SECRET_KEY",
            }
        });
        expect(PutLogEventsCommand).toHaveBeenCalledTimes(1);
        const params = PutLogEventsCommand.mock.calls[0][0];
        expect(params.logGroupName).toStrictEqual(LOGS_METADATA.GROUP);
        expect(params.logStreamName).toStrictEqual(PLUGIN_USER.logStream);
        const CWMsg = JSON.parse(params.logEvents[0].message);
        ["msg", "type", "source", "version", "platform", "mac_address"].forEach(key => {
            expect(key in CWMsg).toBe(true);
        });
        expect(CWMsg.msg).toStrictEqual(errMsg);
    });

    test("Log with userEmail", async () => {
        const userFileData = {};
        userFileData[TEST_USER.email] = {
            access_key: TEST_USER.iam_access_key,
            secret_key: TEST_USER.iam_secret_key,
            is_active: true
        };
        fs.writeFileSync(userFilePath, yaml.dump(userFileData));

        const errMsg = "Error message";
        await CodeSyncLogger.error(errMsg, "", TEST_EMAIL);
        expect(CloudWatchLogsClient.mock.calls[0][0]).toStrictEqual({
            region: LOGS_METADATA.AWS_REGION,
            credentials: {
                accessKeyId: TEST_USER.iam_access_key,
                secretAccessKey: TEST_USER.iam_secret_key,
            }
        });
        expect(PutLogEventsCommand).toHaveBeenCalledTimes(1);
        const params = PutLogEventsCommand.mock.calls[0][0];
        expect(params.logGroupName).toStrictEqual(LOGS_METADATA.GROUP);
        expect(params.logStreamName).toStrictEqual(TEST_EMAIL);
        const CWMsg = JSON.parse(params.logEvents[0].message);
        ["msg", "type", "source", "version", "platform", "mac_address"].forEach(key => {
            expect(key in CWMsg).toBe(true);
        });
        expect(CWMsg.msg).toStrictEqual(errMsg);
    });
});
