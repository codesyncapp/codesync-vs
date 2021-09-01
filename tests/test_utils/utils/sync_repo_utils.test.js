import fetchMock from "jest-fetch-mock";
import { updateRepo} from "../../../src/utils/sync_repo_utils";


describe('updateRepo', () => {
    beforeEach(() => {
        fetch.resetMocks();
    });

    test("with valid response", async () => {
        fetchMock.mockResponseOnce(JSON.stringify({}));
        const resp = await updateRepo("TOKEN", "REPO_ID", {"is_in_sync" : false});
        expect(resp.response).toStrictEqual({});
        expect(resp.error).toStrictEqual("");
    });

    test("with auth error", async () => {
        const err = {"error": "Invalid token"};
        fetchMock.mockResponseOnce(JSON.stringify(err));
        const resp = await updateRepo("TOKEN", "REPO_ID", {"is_in_sync" : false});
        expect(resp.response).toStrictEqual({});
        expect(resp.error).toStrictEqual(err.error);
    });

    test("will null response", async () => {
        fetchMock.mockResponseOnce(null);
        const resp = await updateRepo("TOKEN", "REPO_ID", {"is_in_sync" : false});
        expect(resp.error).toBeTruthy();
        expect(resp.response).toStrictEqual({});
    });
});
