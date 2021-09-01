export function getRandomString(length) {
    var randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    var result = '';
    for ( let i = 0; i < length; i++ ) {
        result += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
    }
    return result;
}

export function randomName() {
    return getRandomString(10);
}

export function randomBaseRepoPath() {
    return `tests/tests_data/.codesync_${randomName()}`;
}

export function randomRepoPath() {
    return `tests/tests_data/test_repo_${randomName()}`;
}

export async function waitFor(seconds) {
    return await new Promise((r) => setTimeout(r, seconds*1000));
}

export const TEST_EMAIL = 'test@codesync.com';
export const INVALID_TOKEN_JSON = {"error": "Invalid token"};
