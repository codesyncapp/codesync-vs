import fs from "fs";
import yaml from "js-yaml";
import AWS from "aws-sdk";
import untildify from "untildify";

import {getSeqTokenFilePath, getUserFilePath, randomBaseRepoPath, TEST_EMAIL, TEST_USER} from "./helpers/helpers";
import {LOGS_METADATA, PLUGIN_USER} from "../src/settings";
import {CodeSyncLogger, updateSequenceToken} from "../src/logger";
import {readYML} from "../src/utils/common";
import {addPluginUser} from "../src/utils/setup_utils";


describe("putLogEvent",  () => {
    const baseRepoPath = randomBaseRepoPath("putLogEvent");
    const userFilePath = getUserFilePath(baseRepoPath);
    const sequenceTokenFilePath = getSeqTokenFilePath(baseRepoPath);

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.writeFileSync(userFilePath, yaml.safeDump({}));
        fs.writeFileSync(sequenceTokenFilePath, yaml.safeDump({}));
    });

    afterEach(() => {
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No user.yml", () => {
        CodeSyncLogger.error("Error message");
        expect(AWS.CloudWatchLogs.mock.instances).toHaveLength(0);
        const sequenceTokenUsers = readYML(sequenceTokenFilePath);
        expect(sequenceTokenUsers).toStrictEqual({});
    });

    test("No User in user.yml", async () => {
        fetchMock.mockResponseOnce(JSON.stringify({
            IAM_ACCESS_KEY: "IAM_ACCESS_KEY",
            IAM_SECRET_KEY: "IAM_SECRET_KEY"
        }));
        await addPluginUser();
        CodeSyncLogger.error("Error message");
        expect(AWS.CloudWatchLogs.mock.calls[0][0]).toStrictEqual({
            accessKeyId: "IAM_ACCESS_KEY",
            secretAccessKey: "IAM_SECRET_KEY",
            region: LOGS_METADATA.AWS_REGION
        });
        const sequenceTokenUsers = readYML(sequenceTokenFilePath);
        expect(sequenceTokenUsers).toStrictEqual({});
    });

    test("1 user as default",() => {
        const userFileData = {};
        userFileData[TEST_USER.email] = {
            access_key: TEST_USER.iam_access_key,
            secret_key: TEST_USER.iam_secret_key,
            is_active: true
        };
        fs.writeFileSync(userFilePath, yaml.safeDump(userFileData));

        CodeSyncLogger.error("Error message");

        const sequenceTokenUsers = readYML(sequenceTokenFilePath);
        expect(sequenceTokenUsers).toStrictEqual({});
    });

    test("Log with userEmail", () => {
        const userFileData = {};
        userFileData[TEST_USER.email] = {
            access_key: TEST_USER.iam_access_key,
            secret_key: TEST_USER.iam_secret_key,
        };
        fs.writeFileSync(userFilePath, yaml.safeDump(userFileData));

        CodeSyncLogger.error("Error message", "", TEST_EMAIL);

        const sequenceTokenUsers = readYML(sequenceTokenFilePath);
        expect(sequenceTokenUsers).toStrictEqual({});
    });

    test("With Sequence Token and user email",() => {
        const userFileData = {};
        userFileData[TEST_USER.email] = {
            access_key: TEST_USER.iam_access_key,
            secret_key: TEST_USER.iam_secret_key,
        };
        fs.writeFileSync(userFilePath, yaml.safeDump(userFileData));

        const users = {};
        users[TEST_EMAIL] = "Sequence Token";
        fs.writeFileSync(sequenceTokenFilePath, yaml.safeDump(users));

        CodeSyncLogger.error("Error message", "", TEST_USER.email);

        const sequenceTokenUsers = readYML(sequenceTokenFilePath);
        expect(sequenceTokenUsers).toStrictEqual(users);
    });

    test("afterSuccessfullyLogged",() => {
        const nextSequenceToken = "NEXT SEQUENCE TOKEN";
        const users = {};
        users[TEST_EMAIL] = "Sequence Token";
        fs.writeFileSync(sequenceTokenFilePath, yaml.safeDump(users));

        updateSequenceToken(TEST_EMAIL, nextSequenceToken);

        const sequenceTokenUsers = readYML(sequenceTokenFilePath);
        expect(sequenceTokenUsers[TEST_EMAIL]).toStrictEqual(nextSequenceToken);
    });
});
