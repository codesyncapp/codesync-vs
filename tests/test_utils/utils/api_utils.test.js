import fetchMock from "jest-fetch-mock";
import {checkServerDown, getUserForToken} from "../../../src/utils/api_utils";


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
