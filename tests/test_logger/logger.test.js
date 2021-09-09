import fs from "fs";
import yaml from "js-yaml";
import AWS from "aws-sdk";
import untildify from "untildify";

import {randomBaseRepoPath, TEST_EMAIL, TEST_USER} from "../helpers/helpers";
import {AWS_REGION} from "../../src/constants";
import {putLogEvent, updateSequenceToken} from "../../src/logger";
import {readYML} from "../../out/utils/common";


describe("putLogEvent",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const userFilePath = `${baseRepoPath}/user.yml`;
    const sequenceTokenFilePath = `${baseRepoPath}/sequence_token.yml`;

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.writeFileSync(userFilePath, yaml.safeDump({}));
        fs.writeFileSync(sequenceTokenFilePath, yaml.safeDump({}));
    });

    afterEach(() => {
        fs.rmdirSync(baseRepoPath, {recursive: true});
    });

    test("No User", () => {
        putLogEvent("Error message");
        const sequenceTokenUsers = readYML(sequenceTokenFilePath);
        expect(sequenceTokenUsers).toStrictEqual({});
    });

    test("1 user as default",() => {
        const userFileData = {};
        userFileData[TEST_USER.email] = {
            access_key: TEST_USER.iam_access_key,
            secret_key: TEST_USER.iam_secret_key,
        };
        fs.writeFileSync(userFilePath, yaml.safeDump(userFileData));

        putLogEvent("Error message");

        expect(AWS.CloudWatchLogs.mock.instances).toHaveLength(1);
        expect(AWS.CloudWatchLogs.mock.calls[0][0]).toStrictEqual({
            accessKeyId: TEST_USER.iam_access_key,
            secretAccessKey: TEST_USER.iam_secret_key,
            region: AWS_REGION
        });

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

        putLogEvent("Error message", TEST_EMAIL);

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

        putLogEvent("Error message", TEST_USER.email);

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
