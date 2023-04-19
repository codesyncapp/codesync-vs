import fs from "fs";
import yaml from "js-yaml";
import untildify from "untildify";
import fetchMock from "jest-fetch-mock";

import {API_ROUTES} from "../../src/constants";
import {
    checkServerDown,
    createUserWithApi, 
    getUserForToken,
    getPluginUser
} from "../../src/utils/api_utils";
import {
    getSeqTokenFilePath,
    getUserFilePath,
    INVALID_TOKEN_JSON,
    randomBaseRepoPath,
    TEST_EMAIL
} from "../helpers/helpers";


describe('checkServerDown', () => {
    const baseRepoPath = randomBaseRepoPath();
    const userFilePath = getUserFilePath(baseRepoPath);
    const sequenceTokenFilePath = getSeqTokenFilePath(baseRepoPath);

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.writeFileSync(userFilePath, yaml.dump({}));
        fs.writeFileSync(sequenceTokenFilePath, yaml.dump({}));
    });

    afterEach(() => {
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("with status: true", async () => {
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const isServerDown = await checkServerDown();
        expect(isServerDown).toBe(false);
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.HEALTHCHECK);
    });

    test("with status: false", async () => {
        fetchMock.mockResponseOnce(JSON.stringify({status: false}));
        const isServerDown = await checkServerDown();
        expect(isServerDown).toBe(true);
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.HEALTHCHECK);
    });

    test("will null response", async () => {
        fetchMock.mockResponseOnce(null);
        const isServerDown = await checkServerDown();
        expect(isServerDown).toBe(true);
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.HEALTHCHECK);
    });
});


describe("getUserForToken",  () => {
    beforeEach(() => {
        fetch.resetMocks();
    });

    const user = {
        "email": "dummy@email.cpm",
        "plan": {},
        "repo_count": 0
    };

    const assertAPICall = (token="ACCESS_TOKEN") => {
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.USERS);
        const options = fetch.mock.calls[0][1];
        expect(options.headers).toStrictEqual({
            'Content-Type': 'application/json',
            'Authorization': `Basic ${token}`
        });
        return true;
    };

    test('should get auth error', async () => {
        const token = "INVALID_TOKEN";
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const res = await getUserForToken(token);
        expect(res.isTokenValid).toBe(false);
        // Assert API call
        expect(assertAPICall(token)).toBe(true);
    });

    test('should fetch users', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(user));
        const apiResponse = await getUserForToken("ACCESS_TOKEN");
        expect(apiResponse.isTokenValid).toBe(true);
        expect(apiResponse.response).toEqual(user);
        // Assert API call
        expect(assertAPICall()).toBe(true);
    });

    test('with null response', async () => {
        fetchMock.mockResponseOnce(null);
        const apiResponse = await getUserForToken("ACCESS_TOKEN");
        expect(apiResponse.isTokenValid).toBe(false);
        // Assert API call
        expect(assertAPICall()).toBe(true);
    });
});


describe("createUserWithApi",  () => {

    beforeEach(() => {
        fetch.resetMocks();
    });

    const assertAPICall = (token="ACCESS_TOKEN") => {
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.USERS);
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