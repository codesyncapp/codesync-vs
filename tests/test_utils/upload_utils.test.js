import fs from "fs";

import path from "path";
import untildify from "untildify";
import fetchMock from "jest-fetch-mock";
import {
    INVALID_TOKEN_JSON, 
    PRE_SIGNED_URL, 
    randomRepoPath, 
    randomBaseRepoPath, 
    TEST_REPO_RESPONSE
} from "../helpers/helpers";
import {uploadFile, uploadFileTos3, uploadFileToServer, uploadRepoToServer} from "../../src/utils/upload_utils";
import {API_ROUTES, DEFAULT_BRANCH} from "../../src/constants";
import { formatDatetime } from "../../src/utils/common";
import { createSystemDirectories } from "../../src/utils/setup_utils";

describe('uploadRepoToServer', () => {
    beforeEach(() => {
        fetch.resetMocks();
        const baseRepoPath = randomBaseRepoPath();
        untildify.mockReturnValue(baseRepoPath);
    });

    const assertAPICall = (token="ACCESS_TOKEN") => {
        // Assert API call
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.REPO_INIT);
        const options = fetch.mock.calls[0][1];
        expect(options.method).toStrictEqual('POST');
        expect(options.headers).toStrictEqual({
            'Content-Type': 'application/json',
            'Authorization': `Basic ${token}`
        });
        return true;
    };

    test('Invalid token', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const res = await uploadRepoToServer("INVALID_TOKEN", {});
        expect(res.error).toBe(INVALID_TOKEN_JSON.error.message);
        expect(res.response).toStrictEqual({});
        expect(assertAPICall("INVALID_TOKEN")).toBe(true);
    });

    test('Valid response', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(TEST_REPO_RESPONSE));
        const res = await uploadRepoToServer("ACCESS_TOKEN", {});
        expect(res.error).toBe("");
        expect(res.response).toStrictEqual(TEST_REPO_RESPONSE);
        expect(assertAPICall()).toBe(true);
    });

    test('null response', async () => {
        fetchMock.mockResponseOnce(null);
        const res = await uploadRepoToServer("ACCESS_TOKEN", {});
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
    });
});

describe('uploadFile', () => {
    beforeEach(() => {
        fetch.resetMocks();
        const baseRepoPath = randomBaseRepoPath();
        untildify.mockReturnValue(baseRepoPath);
    });

    const assertAPICall = (token="ACCESS_TOKEN") => {
        // Assert API call
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.FILES);
        const options = fetch.mock.calls[0][1];
        expect(options.method).toStrictEqual('POST');
        expect(options.headers).toStrictEqual({
            'Content-Type': 'application/json',
            'Authorization': `Basic ${token}`
        });
        return true;
    };

    test('Invalid token', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const res = await uploadFile("INVALID_TOKEN", {});
        expect(res.error).toBe(INVALID_TOKEN_JSON.error.message);
        expect(res.response).toStrictEqual({});
        expect(assertAPICall("INVALID_TOKEN")).toBe(true);
    });

    test('Valid response', async () => {
        const response = {id: 1234, url: "url"};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFile("ACCESS_TOKEN", {});
        expect(res.error).toBe("");
        expect(res.response.id).toBe(response.id);
        expect(res.response.url).toBe(response.url);
        expect(assertAPICall()).toBe(true);
    });

    test('null response', async () => {
        fetchMock.mockResponseOnce(null);
        const res = await uploadFile("ACCESS_TOKEN", {});
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
    });
});

describe('uploadFileTos3', () => {
    let repoPath;
    let baseRepoPath;
    let filePath;

    beforeEach(() => {
        fetch.resetMocks();
        function FormDataMock() {
            this.append = jest.fn();
        }
        global.FormData = FormDataMock;
        repoPath = randomRepoPath();
        baseRepoPath = randomBaseRepoPath();
        fs.mkdirSync(repoPath, {recursive: true});
        fs.mkdirSync(baseRepoPath, {recursive: true});
        createSystemDirectories();
        filePath = path.join(repoPath, "file.txt");
        untildify.mockReturnValue(baseRepoPath);
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test('Non Existing File', async () => {
        const res = await uploadFileTos3("INVALID_FILE_PATH", "");
        expect(res.error).toBeTruthy();
    });

    test('Valid response', async () => {
        fs.writeFileSync(filePath, "12345");
        const resp = await uploadFileTos3(filePath, PRE_SIGNED_URL);
        expect(resp.error).toStrictEqual(null);
    });

    test('InValid response', async () => {
        fs.writeFileSync(filePath, "12345");
        const resp = await uploadFileTos3(filePath, {url: "url", fields: {}});
        expect(resp.error).toBeTruthy();
    });

});

describe('uploadFileToServer', () => {
    const repoPath = randomRepoPath();
    const filePath = path.join(repoPath, "file.txt");

    beforeEach(() => {
        fetch.resetMocks();
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(filePath, "");
        const baseRepoPath = randomBaseRepoPath();
        untildify.mockReturnValue(baseRepoPath);
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
    });

    const assertAPICall = (token="ACCESS_TOKEN") => {
        // Assert API call
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.FILES);
        const options = fetch.mock.calls[0][1];
        expect(options.method).toStrictEqual('POST');
        expect(options.headers).toStrictEqual({
            'Content-Type': 'application/json',
            'Authorization': `Basic ${token}`
        });
        return true;
    };

    test('Auth Error', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const res = await uploadFileToServer("ACCESS_TOKEN", 12345, DEFAULT_BRANCH, filePath,
            "file.txt", formatDatetime());
        expect(res.error.endsWith(INVALID_TOKEN_JSON.error.message)).toBe(true);
        expect(assertAPICall()).toBe(true);
    });

    test('Empty file: fileInfo.size = 0', async () => {
        const response = {id: 1234, url: PRE_SIGNED_URL};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFileToServer("ACCESS_TOKEN", 6789, DEFAULT_BRANCH, filePath,
            "file.txt", formatDatetime());
        expect(res.fileId).toStrictEqual(response.id);
        expect(res.error).toStrictEqual(null);
        expect(assertAPICall()).toBe(true);
    });

    test('Valid file', async () => {
        fs.rmSync(filePath);
        fs.writeFileSync(filePath, "Dummy Content Is In The File");
        const response = {id: 1234, url: PRE_SIGNED_URL};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFileToServer("ACCESS_TOKEN", 6789, DEFAULT_BRANCH, filePath,
            "file.txt", formatDatetime());
        expect(res.fileId).toStrictEqual(response.id);
        expect(res.error).toStrictEqual(null);
        expect(assertAPICall()).toBe(true);
    });

    test('InValid response', async () => {
        fs.rmSync(filePath);
        fs.writeFileSync(filePath, "Dummy Content Is In The File");
        const response = {id: 1234, url: {url: "url", fields: {}}};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFileToServer("ACCESS_TOKEN", 6789, DEFAULT_BRANCH, filePath,
            "file.txt", formatDatetime());
        expect(res.fileId).toStrictEqual(response.id);
        expect(res.error).toBeTruthy();
        expect(assertAPICall()).toBe(true);
    });

});
