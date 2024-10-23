import fetchMock from "jest-fetch-mock";
import untildify from "untildify";
import { updateRepo} from "../../src/utils/sync_repo_utils";
import { API_PATH } from "../../src/constants";
import { generateApiUrl } from "../../src/utils/url_utils";
import { INVALID_TOKEN_JSON, randomBaseRepoPath } from "../helpers/helpers";

describe('updateRepo', () => {
    const baseRepoPath = randomBaseRepoPath();
    
    beforeEach(() => {
        fetch.resetMocks();
        untildify.mockReturnValue(baseRepoPath);
    });

    const assertAPICall = (token="ACCESS_TOKEN") => {
        const url = generateApiUrl(`${API_PATH.REPOS}/REPO_ID`);
        expect(fetch.mock.calls[0][0]).toStrictEqual(url);
        const options = fetch.mock.calls[0][1];
        expect(options.method).toStrictEqual("PATCH");
        expect(options.headers).toStrictEqual({
            'Content-Type': 'application/json',
            'Authorization': `Basic ${token}`
        });
        const body = JSON.parse(fetch.mock.calls[0][1].body);
        expect(body).toStrictEqual({"is_in_sync" : false});
        return true;
    };

    test("with valid response", async () => {
        fetchMock.mockResponseOnce(JSON.stringify({}));
        const resp = await updateRepo("ACCESS_TOKEN", "REPO_ID", {"is_in_sync" : false});
        expect(resp.response).toStrictEqual({});
        expect(resp.error).toStrictEqual("");
        expect(assertAPICall()).toBe(true);
    });

    test("with auth error", async () => {
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const resp = await updateRepo("ACCESS_TOKEN", "REPO_ID", {"is_in_sync" : false});
        expect(resp.response).toStrictEqual({});
        expect(resp.error).toStrictEqual(INVALID_TOKEN_JSON.error.message);
        expect(assertAPICall()).toBe(true);
    });

    test("will null response", async () => {
        fetchMock.mockResponseOnce(null);
        const resp = await updateRepo("ACCESS_TOKEN", "REPO_ID", {"is_in_sync" : false});
        expect(resp.error).toBeTruthy();
        expect(resp.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
    });
});
