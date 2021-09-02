import fs from "fs";

import fetchMock from "jest-fetch-mock";
import {INVALID_TOKEN_JSON, PRE_SIGNED_URL, randomRepoPath} from "../../helpers/helpers";
import {uploadFile, uploadFileTos3, uploadFileToServer} from "../../../src/utils/upload_file";
import {DEFAULT_BRANCH} from "../../../src/constants";


describe('uploadFile', () => {
    beforeEach(() => {
        fetch.resetMocks();
    });

    test('Invalid token', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const res = await uploadFile("INVALID_TOKEN", {});
        expect(res.error).toBe(INVALID_TOKEN_JSON.error);
        expect(res.response).toStrictEqual({});
    });

    test('Valid response', async () => {
        const response = {id: 1234, url: "url"};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFile("ACCESS_TOKEN", {});
        expect(res.error).toBe("");
        expect(res.response.id).toBe(response.id);
        expect(res.response.url).toBe(response.url);
    });

    test('null response', async () => {
        fetchMock.mockResponseOnce(null);
        const res = await uploadFile("ACCESS_TOKEN", {});
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
    });
});

describe('uploadFileTos3', () => {
    const repoPath = randomRepoPath();
    const filePath = `${repoPath}/file.txt`;

    beforeEach(() => {
        fetch.resetMocks();
        fs.mkdirSync(repoPath, {recursive: true});
    });

    afterEach(() => {
        fs.rmdirSync(repoPath, {recursive: true});
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
    const filePath = `${repoPath}/file.txt`;

    beforeEach(() => {
        fetch.resetMocks();
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(filePath, "");
    });

    afterEach(() => {
        fs.rmdirSync(repoPath, {recursive: true});
    });

    test('Auth Error', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const res = await uploadFileToServer("accessToken", 12345, DEFAULT_BRANCH, filePath,
            "file.txt", "");
        expect(res.error).toStrictEqual(INVALID_TOKEN_JSON.error);
    });

    test('Empty file: fileInfo.size = 0', async () => {
        const response = {id: 1234, url: PRE_SIGNED_URL};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFileToServer("accessToken", 6789, DEFAULT_BRANCH, filePath,
            "file.txt", "");
        expect(res.fileId).toStrictEqual(response.id);
        expect(res.error).toStrictEqual(null);
    });

    test('Valid file', async () => {
        fs.rmSync(filePath);
        fs.writeFileSync(filePath, "Dummy Content Is In The File");
        const response = {id: 1234, url: PRE_SIGNED_URL};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFileToServer("accessToken", 6789, DEFAULT_BRANCH, filePath,
            "file.txt", "");
        expect(res.fileId).toStrictEqual(response.id);
        expect(res.error).toStrictEqual(null);
    });

    test('InValid response', async () => {
        fs.rmSync(filePath);
        fs.writeFileSync(filePath, "Dummy Content Is In The File");
        const response = {id: 1234, url: {url: "url", fields: {}}};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFileToServer("accessToken", 6789, DEFAULT_BRANCH, filePath,
            "file.txt", "");
        expect(res.fileId).toStrictEqual(response.id);
        expect(res.error).toBeTruthy();
    });

});
