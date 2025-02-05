import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import fetchMock from "jest-fetch-mock";
import isOnline from 'is-online';
import untildify from "untildify";

import {
    cleanUpDeleteDiff,
    getDIffForDeletedFile,
    handleNewFileUpload,
    isValidDiff
} from "../../src/codesyncd/utils";
import { createSystemDirectories } from "../../src/utils/setup_utils";
import {
    DIFF_DATA,
    DUMMY_FILE_CONTENT,
    getConfigFilePath,
    getUserFilePath,
    INVALID_TOKEN_JSON,
    FILE_UPLOAD_400,
    FILE_UPLOAD_402,
    FILE_UPLOAD_403,
    FILE_UPLOAD_404,
    INTERNAL_SERVER_ERROR,
    PRE_SIGNED_URL,
    randomBaseRepoPath,
    randomRepoPath,
    waitFor
} from "../helpers/helpers";
import {DEFAULT_BRANCH} from "../../src/constants";
import {readYML} from "../../src/utils/common";
import {pathUtils} from "../../src/utils/path_utils";
import {s3UploaderUtils} from "../../src/connect_repo/s3_uploader";


describe("isValidDiff",  () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("Missing required keys",  () => {
        const isValid = isValidDiff({});
        expect(isValid).toBe(false);
    });

    test("Rename with null-diff",  () => {
        const diffData = Object.assign({}, DIFF_DATA);
        diffData.is_rename = true;
        const isValid = isValidDiff(diffData);
        expect(isValid).toBe(false);
    });

    test("Rename with non JSON-diff",  () => {
        const diffData = Object.assign({}, DIFF_DATA);
        diffData.is_rename = true;
        diffData.diff = "abc";
        const isValid = isValidDiff(diffData);
        expect(isValid).toBe(false);
    });

    test("Rename with missing diff-keys",  () => {
        const diffData = Object.assign({}, DIFF_DATA);
        diffData.is_rename = true;
        diffData.diff = {};
        const isValid = isValidDiff(diffData);
        expect(isValid).toBe(false);
    });

    test("Rename with is_rename & is_dir_rename",  () => {
        const diffData = Object.assign({}, DIFF_DATA);
        diffData.is_rename = true;
        diffData.is_dir_rename = true;
        diffData.diff = {};
        const isValid = isValidDiff(diffData);
        expect(isValid).toBe(false);
    });

    test("Rename with is_dir_rename and missing keys",  () => {
        const diffData = Object.assign({}, DIFF_DATA);
        diffData.is_dir_rename = true;
        diffData.diff = {};
        const isValid = isValidDiff(diffData);
        expect(isValid).toBe(false);
    });

    test("Valid diff",  () => {
        const diffData = Object.assign({}, DIFF_DATA);
        diffData.diff = "THIS IS DIFF";
        const isValid = isValidDiff(diffData);
        expect(isValid).toBe(true);
    });
});


describe("handleNewFileUpload",  () => {
    let baseRepoPath;
    const configData = {repos: {}};
    let configPath;
    let userFilePath;

    let repoPath;
    let filePath;
    let pathUtilsObj;
    let originalsRepoBranchPath;
    const fileRelPath = "file.js";

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        isOnline.mockReturnValue(true);
        baseRepoPath = randomBaseRepoPath("handleNewFileUpload");
        repoPath = randomRepoPath();
        untildify.mockReturnValue(baseRepoPath);

        fs.mkdirSync(repoPath, {recursive: true});
        fs.mkdirSync(baseRepoPath, {recursive: true});
        
        createSystemDirectories();
        configPath = getConfigFilePath(baseRepoPath);
        userFilePath = getUserFilePath(baseRepoPath);
        
        filePath = path.join(repoPath, "file.js");
        pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
        originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();

        fs.writeFileSync(userFilePath, yaml.dump({}));
        configData.repos[repoPath] = {branches: {}};
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = {};
        fs.writeFileSync(configPath, yaml.dump(configData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("File not in .originals",  async () => {
        const result = await handleNewFileUpload("TOKEN", repoPath, DEFAULT_BRANCH, "",
            fileRelPath, 1234, configData);
        expect(result.uploaded).toBe(false);
        expect(result.deleteDiff).toBe(true);
        expect(result.config).toStrictEqual(configData);
    });

    test("Invalid Token",  async () => {
        fs.mkdirSync(originalsRepoBranchPath, {recursive: true});
        fs.writeFileSync(path.join(originalsRepoBranchPath, fileRelPath), DUMMY_FILE_CONTENT);
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const result = await handleNewFileUpload("TOKEN", repoPath, DEFAULT_BRANCH, "",
            fileRelPath, 1234, configData);
        expect(result.uploaded).toBe(false);
        expect(result.deleteDiff).toBe(false);
        expect(result.config).toStrictEqual(configData);
    });

    test("syncignored File Path",  async () => {
        fs.mkdirSync(originalsRepoBranchPath, {recursive: true});
        fs.writeFileSync(path.join(originalsRepoBranchPath, fileRelPath), DUMMY_FILE_CONTENT);
        fetchMock.mockResponseOnce(JSON.stringify(FILE_UPLOAD_400), { status: 400 });
        const result = await handleNewFileUpload("TOKEN", repoPath, DEFAULT_BRANCH, "",
            fileRelPath, 1234, configData);
        expect(result.uploaded).toBe(false);
        expect(result.deleteDiff).toBe(true);
        expect(result.config).toStrictEqual(configData);
    });

    test("Unauthorized Repo",  async () => {
        fs.mkdirSync(originalsRepoBranchPath, {recursive: true});
        fs.writeFileSync(path.join(originalsRepoBranchPath, fileRelPath), DUMMY_FILE_CONTENT);
        fetchMock.mockResponseOnce(JSON.stringify(FILE_UPLOAD_403), { status: 403 });
        const result = await handleNewFileUpload("TOKEN", repoPath, DEFAULT_BRANCH, "",
            fileRelPath, 1234, configData);
        expect(result.uploaded).toBe(false);
        expect(result.deleteDiff).toBe(true);
        expect(result.config).toStrictEqual(configData);
    });

    test("Branch not found",  async () => {
        fs.mkdirSync(originalsRepoBranchPath, {recursive: true});
        fs.writeFileSync(path.join(originalsRepoBranchPath, fileRelPath), DUMMY_FILE_CONTENT);
        fetchMock.mockResponseOnce(JSON.stringify(FILE_UPLOAD_404), { status: 404 });
        const result = await handleNewFileUpload("TOKEN", repoPath, DEFAULT_BRANCH, "",
            fileRelPath, 1234, configData);
        expect(result.uploaded).toBe(false);
        expect(result.deleteDiff).toBe(true);
        expect(result.config).toStrictEqual(configData);
    });

    test("Diffs Limit Reached",  async () => {
        fs.mkdirSync(originalsRepoBranchPath, {recursive: true});
        fs.writeFileSync(path.join(originalsRepoBranchPath, fileRelPath), DUMMY_FILE_CONTENT);
        fetchMock.mockResponseOnce(JSON.stringify(FILE_UPLOAD_402), { status: 402 });
        const result = await handleNewFileUpload("TOKEN", repoPath, DEFAULT_BRANCH, "",
            fileRelPath, 1234, configData);
        expect(result.uploaded).toBe(false);
        expect(result.deleteDiff).toBe(false);
        expect(result.config).toStrictEqual(configData);
    });

    test("Server Error",  async () => {
        fs.mkdirSync(originalsRepoBranchPath, {recursive: true});
        fs.writeFileSync(path.join(originalsRepoBranchPath, fileRelPath), DUMMY_FILE_CONTENT);
        fetchMock.mockResponseOnce(JSON.stringify(INTERNAL_SERVER_ERROR), { status: 500 });
        const result = await handleNewFileUpload("TOKEN", repoPath, DEFAULT_BRANCH, "",
            fileRelPath, 1234, configData);
        expect(result.uploaded).toBe(false);
        expect(result.deleteDiff).toBe(false);
        expect(result.config).toStrictEqual(configData);
    });

    test("Should Upload",  async () => {
        const response = {id: 1234, url: PRE_SIGNED_URL};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
        const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
        fs.mkdirSync(originalsRepoBranchPath, {recursive: true});
        const originalsFilePath = path.join(originalsRepoBranchPath, fileRelPath);
        fs.writeFileSync(originalsFilePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        const diffData = Object.assign({}, DIFF_DATA);
        diffData.repo_path = repoPath;
        diffData.branch = DEFAULT_BRANCH;
        const result = await handleNewFileUpload("TOKEN", repoPath, DEFAULT_BRANCH, "",
            fileRelPath, 1234, configData);
        expect(result.uploaded).toBe(true);
        expect(result.deleteDiff).toBe(true);
        expect(fileRelPath in result.config.repos[repoPath].branches[DEFAULT_BRANCH]).toBe(true);
        // File should not be deleted from .originals
        expect(fs.existsSync(originalsFilePath)).toBe(true);
        const uploaderUtils = new s3UploaderUtils();
        await uploaderUtils.runUploader();
        await waitFor(2);
        // File should be deleted from .originals
        expect(fs.existsSync(originalsFilePath)).toBe(false);
    });
});

describe("cleanUpDeleteDiff",  () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath("cleanUpDeleteDiff");
    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const shadowBranchPath = pathUtilsObj.getShadowRepoBranchPath();
    const originalsBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
    const cacheBranchPath = pathUtilsObj.getDeletedRepoBranchPath();

    const fileRelPath = "file.js";
    const shadowFilePath = path.join(shadowBranchPath, fileRelPath);
    const originalsFilePath = path.join(originalsBranchPath, fileRelPath);
    const cacheFilePath = path.join(cacheBranchPath, fileRelPath);

    const configPath = getConfigFilePath(baseRepoPath);
    const configData = {repos: {}};
    configData.repos[repoPath] = {branches: {}};
    configData.repos[repoPath].branches[DEFAULT_BRANCH] = {};
    configData.repos[repoPath].branches[DEFAULT_BRANCH][fileRelPath] = 12345;

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(shadowBranchPath, {recursive: true});
        fs.mkdirSync(originalsBranchPath, {recursive: true});
        fs.mkdirSync(cacheBranchPath, {recursive: true});
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(originalsFilePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(cacheFilePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(configPath, yaml.dump(configData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Should cleanup file from system directories",  async () => {
        expect(fs.existsSync(shadowFilePath)).toBe(true);
        expect(fs.existsSync(originalsFilePath)).toBe(true);
        expect(fs.existsSync(cacheFilePath)).toBe(true);
        cleanUpDeleteDiff(repoPath, DEFAULT_BRANCH, fileRelPath, configData);
        await waitFor(1);
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        expect(fs.existsSync(originalsFilePath)).toBe(false);
        expect(fs.existsSync(cacheFilePath)).toBe(false);
        const config = readYML(configPath);
        expect(fileRelPath in config.repos[repoPath].branches[DEFAULT_BRANCH]).toBe(false);
    });
});

describe("getDIffForDeletedFile",  () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath("getDIffForDeletedFile");

    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const shadowBranchPath = pathUtilsObj.getShadowRepoBranchPath();
    const originalsBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
    const cacheBranchPath = pathUtilsObj.getDeletedRepoBranchPath();

    const fileRelPath = "file.js";
    const shadowFilePath = path.join(shadowBranchPath, fileRelPath);
    const originalsFilePath = path.join(originalsBranchPath, fileRelPath);
    const cacheFilePath = path.join(cacheBranchPath, fileRelPath);

    const configPath = getConfigFilePath(baseRepoPath);
    const configData = {repos: {}};
    configData.repos[repoPath] = {branches: {}};
    configData.repos[repoPath].branches[DEFAULT_BRANCH] = {};
    configData.repos[repoPath].branches[DEFAULT_BRANCH][fileRelPath] = 12345;

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(shadowBranchPath, {recursive: true});
        fs.mkdirSync(originalsBranchPath, {recursive: true});
        fs.mkdirSync(cacheBranchPath, {recursive: true});
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(originalsFilePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(cacheFilePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(configPath, yaml.dump(configData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("No shadow file",  () => {
        fs.rmSync(shadowFilePath);
        const diff = getDIffForDeletedFile(repoPath, DEFAULT_BRANCH, fileRelPath, configData);
        expect(diff).toStrictEqual("");
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        expect(fs.existsSync(originalsFilePath)).toBe(false);
        expect(fs.existsSync(cacheFilePath)).toBe(false);
    });

    
    test("with Binary File (image.png)",  () => {
        const fileRelPath = "image.png";
        const shadowFilePath = path.join(shadowBranchPath, fileRelPath);
        const originalsFilePath = path.join(originalsBranchPath, fileRelPath);
        const cacheFilePath = path.join(cacheBranchPath, fileRelPath);
        const imagePath = path.join(__dirname, "..", "..", "images", "icon.png");
        fs.copyFileSync(imagePath, shadowFilePath);
        fs.copyFileSync(imagePath, originalsFilePath);
        fs.copyFileSync(imagePath, cacheFilePath);
        configData.repos[repoPath].branches[DEFAULT_BRANCH][fileRelPath] = 12345;
        fs.writeFileSync(configPath, yaml.dump(configData));
        const diff = getDIffForDeletedFile(repoPath, DEFAULT_BRANCH, fileRelPath, configData);
        expect(diff).toStrictEqual("");
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        expect(fs.existsSync(originalsFilePath)).toBe(false);
        expect(fs.existsSync(cacheFilePath)).toBe(false);
    });

    test("Should get non-empty diff",  () => {
        const diff = getDIffForDeletedFile(repoPath, DEFAULT_BRANCH, fileRelPath, configData);
        expect(diff).toBeTruthy();
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        expect(fs.existsSync(originalsFilePath)).toBe(false);
        expect(fs.existsSync(cacheFilePath)).toBe(false);
    });

});
