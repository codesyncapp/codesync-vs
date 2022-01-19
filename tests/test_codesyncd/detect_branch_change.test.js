import fs from "fs";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from "untildify";
import getBranchName from "current-git-branch";
import fetchMock from "jest-fetch-mock";

import {DEFAULT_BRANCH} from "../../src/constants";
import {pathUtils} from "../../src/utils/path_utils";
import {readYML} from "../../src/utils/common";
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
    TEST_USER
} from "../helpers/helpers";


describe("detectBranchChange", () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const configData = {repos: {}};

    const configPath = getConfigFilePath(baseRepoPath);
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {};
    userData[TEST_EMAIL] = {access_token: "ABC"};
    const sequenceTokenFilePath = getSeqTokenFilePath(baseRepoPath);

    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
    const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        jest.spyOn(global.console, 'log');
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.safeDump(configData));
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
        fs.writeFileSync(sequenceTokenFilePath, yaml.safeDump({}));
        fs.mkdirSync(repoPath, {recursive: true});
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
        fs.writeFileSync(configPath, yaml.safeDump(_configData));
        const readyRepos = await detectBranchChange();
        expect(readyRepos).toStrictEqual({});
    });

    test("Repo is synced with account not in user.yml", async () => {
        const _configData = {repos: {}};
        _configData.repos[repoPath] = {
            branches: {},
            email: `another-${TEST_EMAIL}`
        };
        fs.writeFileSync(configPath, yaml.safeDump(_configData));
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
        fs.writeFileSync(configPath, yaml.safeDump(_configData));
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
        fs.writeFileSync(configPath, yaml.safeDump(_configData));
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
        fs.writeFileSync(configPath, yaml.safeDump(_configData));
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
        fs.writeFileSync(configPath, yaml.safeDump(_configData));
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
        fs.writeFileSync(configPath, yaml.safeDump(_configData));
        // Update sequence_token.yml
        const users = {};
        users[TEST_EMAIL] = "";
        fs.writeFileSync(sequenceTokenFilePath, yaml.safeDump(users));
        const userData = {};
        userData[TEST_EMAIL] = {
            access_token: "ABC",
            access_key: TEST_USER.iam_access_key,
            secret_key: TEST_USER.iam_secret_key
        };
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
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
            "file_1.js": null,
            "directory/file_2.js": null
        };

        fs.writeFileSync(configPath, yaml.safeDump(_configData));

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
        fs.writeFileSync(configPath, yaml.safeDump(_configData));
        const user = {
            "email": "dummy@email.cpm",
            "plan": {},
            "repo_count": 0
        };

        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(JSON.stringify(user))
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
        fs.writeFileSync(configPath, yaml.safeDump(_configData));

        fetchMock
            .mockResponseOnce(JSON.stringify({status: true}))
            .mockResponseOnce(JSON.stringify(TEST_REPO_RESPONSE));

        const readyRepos = await detectBranchChange();
        expect(assertValidUpload(readyRepos)).toBe(true);
    });
});
