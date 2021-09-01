import fs from "fs";

import fetchMock from "jest-fetch-mock";
import {INVALID_TOKEN_JSON, randomRepoPath} from "../../helpers/helpers";
import {uploadFile, uploadFileTos3, uploadFileToServer} from "../../../src/utils/upload_file";
import {DEFAULT_BRANCH} from "../../../out/constants";


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

    // TODO: Look into mocking FormData
    // test('Valid response', async () => {
    //     fs.writeFileSync(filePath, "12345");
    //     const url = "https://presignedurldemo.s3.eu-west-2.amazonaws.com/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAJJWZ7B6WCRGMKFGQ%2F20180210%2Feu-west-2%2Fs3%2Faws4_request&X-Amz-Date=20180210T171315Z&X-Amz-Expires=1800&X-Amz-Signature=12b74b0788aa036bc7c3d03b3f20c61f1f91cc9ad8873e3314255dc479a25351&X-Amz-SignedHeaders=host"
    //
    //     const res = await uploadFileTos3(filePath, {url: url, fields: {}});
    //     expect(res.error).toStrictEqual(undefined);
    // });
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
        const response = {id: 1234, url: "url"};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFileToServer("accessToken", 6789, DEFAULT_BRANCH, filePath,
            "file.txt", "");
        expect(res.fileId).toStrictEqual(response.id);
        expect(res.error).toStrictEqual(null);
    });

    // TODO: Look into mocking FormData submit
});
