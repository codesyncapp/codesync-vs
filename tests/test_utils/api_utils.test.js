import fs from "fs";
import yaml from "js-yaml";
import untildify from "untildify";
import fetchMock from "jest-fetch-mock";

import {apiRoutes} from "../../src/constants";
import {
    checkServerDown,
    createUserWithApi
} from "../../src/utils/api_utils";
import {
    getPluginUser
} from "../../src/utils/s3_utils";
import {
    getUserFilePath,
    INVALID_TOKEN_JSON,
    randomBaseRepoPath,
    TEST_EMAIL
} from "../helpers/helpers";


describe('checkServerDown', () => {
    const baseRepoPath = randomBaseRepoPath();
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

    test("with status: true", async () => {
        console.log(11);
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const isServerDown = await checkServerDown();
        expect(isServerDown).toBe(false);
        expect(fetch.mock.calls[0][0]).toStrictEqual(apiRoutes().HEALTHCHECK);
    });

    test("with status: false", async () => {
        fetchMock.mockResponseOnce(JSON.stringify({status: false}));
        const isServerDown = await checkServerDown();
        expect(isServerDown).toBe(true);
        expect(fetch.mock.calls[0][0]).toStrictEqual(apiRoutes().HEALTHCHECK);
    });

    test("will null response", async () => {
        fetchMock.mockResponseOnce(null);
        const isServerDown = await checkServerDown();
        expect(isServerDown).toBe(true);
        expect(fetch.mock.calls[0][0]).toStrictEqual(apiRoutes().HEALTHCHECK);
    });
});


describe("createUserWithApi",  () => {

    beforeEach(() => {
        fetch.resetMocks();
    });

    const assertAPICall = (token="ACCESS_TOKEN") => {
        expect(fetch.mock.calls[0][0]).toStrictEqual(apiRoutes().USERS);
        const options = fetch.mock.calls[0][1];
        expect(options.method).toStrictEqual("POST");
        expect(options.headers).toStrictEqual({
            'Content-Type': 'application/json',
            'Authorization': `Basic ${token}`
        });
        return true;
    };

    const user = {
        "email": TEST_EMAIL,
        "plan": {},
        "repo_count": 0
    };

    test('should get auth error', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const resp = await createUserWithApi("INVALID_TOKEN");
        expect(resp.error).toBe(INVALID_TOKEN_JSON.error.message);
        expect(resp.email).toBeFalsy();
        expect(assertAPICall("INVALID_TOKEN")).toBe(true);
    });

    test('with null response', async () => {
        fetchMock.mockResponseOnce(null);
        const resp = await createUserWithApi("ACCESS_TOKEN");
        expect(resp.error).toBeTruthy();
        expect(resp.email).toBeFalsy();
        expect(assertAPICall()).toBe(true);
    });

    test('should create users', async () => {
        fetchMock.mockResponseOnce(JSON.stringify({"user": user}));
        const resp = await createUserWithApi("ACCESS_TOKEN");
        expect(resp.error).toEqual("");
        expect(resp.email).toBe(user.email);
        expect(assertAPICall()).toBe(true);
    });
});


describe('getPluginUser', () => {

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
    });

    test("s3 URL should work", async () => {
        fetchMock.mockResponseOnce(JSON.stringify({
            IAM_ACCESS_KEY: "IAM_ACCESS_KEY",
            IAM_SECRET_KEY: "IAM_SECRET_KEY"
        }));
        const response = await getPluginUser();
        expect(response.error).toEqual("");
        expect(response.user.IAM_ACCESS_KEY).toBe("IAM_ACCESS_KEY");
        expect(response.user.IAM_SECRET_KEY).toBe("IAM_SECRET_KEY");
    });
});