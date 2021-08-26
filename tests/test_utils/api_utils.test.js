import {checkServerDown, getUserForToken} from "../../src/utils/api_utils";


test("Check Server Down", async () => {
    expect(await checkServerDown()).toBe(false);
});

test("getUserForToken", async () => {
    const res = await getUserForToken("INVALID_TOKEN");
    expect(res.isTokenValid).toBe(false);
});
