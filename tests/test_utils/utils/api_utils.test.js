import fetchMock from "jest-fetch-mock";
import {checkServerDown, createUserWithApi, getUserForToken} from "../../../src/utils/api_utils";


describe('checkServerDown', () => {
    beforeEach(() => {
        fetch.resetMocks();
    });

    test("with status: true", async () => {
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const isServerDown = await checkServerDown();
        expect(isServerDown).toBe(false);
    });

    test("with status: false", async () => {
        fetchMock.mockResponseOnce(JSON.stringify({status: false}));
        const isServerDown = await checkServerDown();
        expect(isServerDown).toBe(true);
    });

    test("will null response", async () => {
        fetchMock.mockResponseOnce(null);
        const isServerDown = await checkServerDown();
        expect(isServerDown).toBe(true);
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

    test('should get auth error', async () => {
        fetchMock.mockResponseOnce(JSON.stringify({"error": "Invalid token"}));
        const res = await getUserForToken("INVALID_TOKEN");
        expect(res.isTokenValid).toBe(false);
    });

    test('should fetch users', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(user));
        const apiResponse = await getUserForToken("TOKEN");
        expect(apiResponse.isTokenValid).toBe(true);
        expect(apiResponse.response).toEqual(user);
    });

    test('with null response', async () => {
        fetchMock.mockResponseOnce(null);
        const apiResponse = await getUserForToken("TOKEN");
        expect(apiResponse.isTokenValid).toBe(false);
    });
});


describe("createUserWithApi",  () => {
    const idToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RAY29kZXN5bmMuY29tIn0.bl7QQajhg2IjPp8h0gzFku85qCrXQN4kThoo1AxB_Dc";
    const decodedSample = {
        "email": "test@codesync.com"
    };

    beforeEach(() => {
        fetch.resetMocks();
    });

    const user = {
        "email": "dummy@email.cpm",
        "plan": {},
        "repo_count": 0
    };

    test('should get auth error', async () => {
        const err = {"error": "Invalid token"};
        fetchMock.mockResponseOnce(JSON.stringify(err));
        const resp = await createUserWithApi("INVALID_TOKEN", idToken);
        expect(resp.error).toBe(err.error);
        expect(resp.user).toStrictEqual(decodedSample);
    });

    test('should create users', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(user));
        const resp = await createUserWithApi("TOKEN", idToken);
        expect(resp.error).toEqual("");
        expect(resp.user).toStrictEqual(decodedSample);
    });

    test('with null response', async () => {
        fetchMock.mockResponseOnce(null);
        const resp = await createUserWithApi("INVALID_TOKEN", idToken);
        expect(resp.error).toBeTruthy();
        expect(resp.user).toStrictEqual(decodedSample);
    });
});
