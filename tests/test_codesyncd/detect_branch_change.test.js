import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from "untildify";
import getBranchName from "current-git-branch";
import fetchMock from "jest-fetch-mock";

import {DEFAULT_BRANCH} from "../../src/constants";
import {pathUtils} from "../../src/utils/path_utils";
import {readYML} from "../../src/utils/common";
import {initUtils} from "../../src/init/utils";
import {detectBranchChange} from "../../src/codesyncd/populate_buffer";

import {
    addUser,
    getConfigFilePath,
    getSeqTokenFilePath,
    getUserFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    TEST_EMAIL,
    TEST_REPO_RESPONSE,
    TEST_USER,
    writeTestRepoFiles,
    NESTED_PATH,
    waitFor
} from "../helpers/helpers";
import {createSystemDirectories} from "../../src/utils/setup_utils";


describe("detectBranchChange", () => {
    let baseRepoPath;
    let repoPath;
    let configPath;
    let sequenceTokenFilePath;
    let userFilePath;
    let pathUtilsObj;
    let originalsRepoBranchPath;
    let shadowRepoBranchPath;

    const configData = {repos: {}};
    const userData = {};    

    beforeEach(async () => {
        fetch.resetMocks();
        jest.clearAllMocks();
        jest.spyOn(global.console, 'log');
        global.IS_CODESYNC_TEST_MODE = true;
        baseRepoPath = randomBaseRepoPath("detectBranchChange");
        repoPath = randomRepoPath();
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});

        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();
        writeTestRepoFiles(repoPath);

        configPath = getConfigFilePath(baseRepoPath);
        userFilePath = getUserFilePath(baseRepoPath);
        userData[TEST_EMAIL] = {access_token: "ABC"};
        sequenceTokenFilePath = getSeqTokenFilePath(baseRepoPath);    
        pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
        originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
        shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
            
        fs.writeFileSync(configPath, yaml.dump(configData));
        fs.writeFileSync(userFilePath, yaml.dump(userData));
        fs.writeFileSync(sequenceTokenFilePath, yaml.dump({}));
        const initUtilsObj = new initUtils(repoPath);
        const itemPaths = await initUtilsObj.getSyncablePaths();
        const filePaths = itemPaths.map(itemPath => itemPath.file_path);
        // copy files to .originals repo
        initUtilsObj.copyFilesTo(filePaths, originalsRepoBranchPath);
        // copy files to .shadow repo
        initUtilsObj.copyFilesTo(filePaths, shadowRepoBranchPath);
    });

    afterEach(() => {
        fs.rmSync(repoPath, {recursive: true, force: true});
        fs.rmSync(baseRepoPath, {recursive: true, force: true});
    });

    const assertValidUpload = (readyRepos) => {
        const expectedReadyRepos = {};
        expectedReadyRepos[repoPath] = DEFAULT_BRANCH;
        expect(readyRepos).toStrictEqual(expectedReadyRepos);

        // Verify file Ids have been added in config
        const config = readYML(configPath);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH]).toStrictEqual(TEST_REPO_RESPONSE.file_path_and_id);

        // Verify sequence_token.yml
        let users = readYML(sequenceTokenFilePath);
        expect(users[TEST_EMAIL]).toStrictEqual("");

        // verify user.yml
        users = readYML(userFilePath);
        expect(users[TEST_USER.email].access_key).toStrictEqual(TEST_USER.iam_access_key);
        expect(users[TEST_USER.email].secret_key).toStrictEqual(TEST_USER.iam_secret_key);
        // Verify no notification is shown as it is run on daemon
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        return true;
    };

    test("No repo synced", async () => {
        const readyRepos = await detectBranchChange();
        expect(readyRepos).toStrictEqual({});
    });

    test("Repo is synced, but is_disconnected", async () => {
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL,
            is_disconnected: true
        };
        fs.writeFileSync(configPath, yaml.dump(_configData));
        const readyRepos = await detectBranchChange();
        expect(readyRepos).toStrictEqual({});
    });

    test("Repo is synced with account not in user.yml", async () => {
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: `another-${TEST_EMAIL}`
        };
        fs.writeFileSync(configPath, yaml.dump(_configData));
        const readyRepos = await detectBranchChange();
        expect(readyRepos).toStrictEqual({});
    });

    test("No active user", async () => {
        addUser(baseRepoPath, false);
        jest.spyOn(global.console, 'log');
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        fs.writeFileSync(configPath, yaml.dump(_configData));
        const readyRepos = await detectBranchChange();
        expect(readyRepos).toStrictEqual({});
    });

    test("Actual repo exists, Shadow repo does not exist", async () => {
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        fs.writeFileSync(configPath, yaml.dump(_configData));
        const readyRepos = await detectBranchChange();
        expect(readyRepos).toStrictEqual({});
        expect(console.log).toHaveBeenCalledTimes(0);
    });

    test("Actual repo has been deleted but shadow exists", async () => {
        fs.mkdirSync(shadowRepoBranchPath, {recursive: true});
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        fs.writeFileSync(configPath, yaml.dump(_configData));
        fs.rmSync(repoPath, {recursive: true, force: true});

        const readyRepos = await detectBranchChange();
        expect(readyRepos).toStrictEqual({});
        expect(console.log).toHaveBeenCalledTimes(0);
    });

    test("Repo is synced with same branch", async () => {
        fs.mkdirSync(shadowRepoBranchPath, {recursive: true});
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        _configData.repos[repoPath].branches[DEFAULT_BRANCH] = {};
        fs.writeFileSync(configPath, yaml.dump(_configData));
        const readyRepos = await detectBranchChange();
        expect(readyRepos).toStrictEqual({});
        expect(console.log).toHaveBeenCalledTimes(0);
    });

    test("Repo is synced with same branch with valid file IDs", async () => {
        fs.mkdirSync(shadowRepoBranchPath, {recursive: true});
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        _configData.repos[repoPath].branches[DEFAULT_BRANCH] = TEST_REPO_RESPONSE.file_path_and_id;
        fs.writeFileSync(configPath, yaml.dump(_configData));
        // Update sequence_token.yml
        const users = {};
        users[TEST_EMAIL] = "";
        fs.writeFileSync(sequenceTokenFilePath, yaml.dump(users));
        const userData = {};
        userData[TEST_EMAIL] = {
            access_token: "ABC",
            access_key: TEST_USER.iam_access_key,
            secret_key: TEST_USER.iam_secret_key
        };
        fs.writeFileSync(userFilePath, yaml.dump(userData));
        const readyRepos = await detectBranchChange();
        expect(assertValidUpload(readyRepos)).toBe(true);
    });

    test("Repo is synced with same branch with null file IDs", async () => {
        fs.mkdirSync(shadowRepoBranchPath, {recursive: true});
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        _configData.repos[repoPath].branches[DEFAULT_BRANCH] = {
            "file_1.js": null
        };
        _configData.repos[repoPath].branches[DEFAULT_BRANCH][NESTED_PATH] = null;

        fs.writeFileSync(configPath, yaml.dump(_configData));

        // Mock response for checkServerDown and uploadRepo
        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(JSON.stringify(TEST_REPO_RESPONSE));

        const readyRepos = await detectBranchChange();
        expect(assertValidUpload(readyRepos)).toBe(true);
    });

    test("Repo is not synced with given branch", async () => {
        fs.mkdirSync(shadowRepoBranchPath, {recursive: true});
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        fs.writeFileSync(configPath, yaml.dump(_configData));
        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(JSON.stringify(TEST_REPO_RESPONSE));

        const readyRepos = await detectBranchChange();
        expect(assertValidUpload(readyRepos)).toBe(true);
    });

    test("Repo is not synced with given branch but .originals branch repo exists", async () => {
        fs.mkdirSync(shadowRepoBranchPath, {recursive: true});
        fs.mkdirSync(originalsRepoBranchPath, {recursive: true});
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        fs.writeFileSync(configPath, yaml.dump(_configData));

        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(JSON.stringify(TEST_REPO_RESPONSE));

        const readyRepos = await detectBranchChange();
        expect(assertValidUpload(readyRepos)).toBe(true);
    });

    test("Repo is not synced with given branch but .originals branch repo exists, should not upload again", async () => {
        const newFilePath = path.join(repoPath, "file_1.js");
        fs.writeFileSync(newFilePath, "");
        fs.mkdirSync(shadowRepoBranchPath, {recursive: true});
        fs.mkdirSync(originalsRepoBranchPath, {recursive: true});

        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        fs.writeFileSync(configPath, yaml.dump(_configData));

        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(() => new Promise(resolve => setTimeout(() => resolve(JSON.stringify(TEST_REPO_RESPONSE)), 3000)));
        const readyRepos = await detectBranchChange();
        await waitFor(2);
        expect(assertValidUpload(readyRepos)).toBe(true);
        // Should call healthCheck and Repo Init API
        expect(fetchMock).toHaveBeenCalledTimes(2);
        // Should not call healthCheck
        await detectBranchChange();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

});
