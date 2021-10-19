import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from "untildify";
import getBranchName from "current-git-branch";
import fetchMock from "jest-fetch-mock";

import {pathUtils} from "../../src/utils/path_utils";
import {createSystemDirectories} from "../../src/utils/setup_utils";
import {COMMAND, DEFAULT_BRANCH, STATUS_BAR_MSGS} from "../../src/constants";
import {
    DUMMY_FILE_CONTENT,
    getConfigFilePath,
    getSeqTokenFilePath,
    getUserFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    TEST_EMAIL, TEST_REPO_RESPONSE, TEST_USER
} from "../helpers/helpers";
import {bufferHandler} from "../../src/codesyncd/buffer_handler";
import {eventHandler} from "../../src/events/event_handler";


describe("handleBuffer", () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {};
    userData[TEST_EMAIL] = {access_token: "ABC"};
    const sequenceTokenFilePath = getSeqTokenFilePath(baseRepoPath);

    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
    const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
    const cacheRepoBranchPath = pathUtilsObj.getDeletedRepoBranchPath();
    const diffsRepo = pathUtilsObj.getDiffsRepo();

    const fileRelPath = "file_1.js";
    const filePath = path.join(repoPath, fileRelPath);
    const shadowFilePath = path.join(shadowRepoBranchPath, fileRelPath);
    const newFilePath = path.join(repoPath, "new.js");
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        global.IS_CODESYNC_DEV = true;
        jest.spyOn(global.console, 'log');
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        createSystemDirectories();
        fs.mkdirSync(repoPath, {recursive: true});
    });

    afterEach(() => {
        fs.rmSync(repoPath, {recursive: true, force: true});
        fs.rmSync(baseRepoPath, {recursive: true, force: true});
    });

    const addRepo = (isDisconnected=false) => {
        fs.mkdirSync(shadowRepoBranchPath, {recursive: true});
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const configData = {repos: {}};
        configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        if (isDisconnected) {
            configData.repos[repoPath].is_disconnected = true;
        }
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = TEST_REPO_RESPONSE.file_path_and_id;
        configData.repos[repoPath].branches[DEFAULT_BRANCH]["ignore.js"] = 12345;
        fs.writeFileSync(configPath, yaml.safeDump(configData));
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
    };

    const addDiff = (branch=DEFAULT_BRANCH) => {
        getBranchName.mockReturnValueOnce(branch);
        const handler = new eventHandler(repoPath);
        handler.isNewFile = true;
        handler.addDiff(fileRelPath);
    };

    const assertDiffsCount = (diffsCount=0, command=undefined,
                              text=STATUS_BAR_MSGS.DEFAULT) => {
        expect(statusBarItem.show).toHaveBeenCalledTimes(1);
        expect(statusBarItem.command).toStrictEqual(command);
        expect(statusBarItem.text).toStrictEqual(text);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(diffsCount);
        return true;
    };

    test("No config.yml", async () => {
        fs.rmSync(configPath);
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(statusBarItem.show).toHaveBeenCalledTimes(1);
        expect(statusBarItem.command).toStrictEqual(COMMAND.triggerSync);
        expect(statusBarItem.text).toStrictEqual(STATUS_BAR_MSGS.CONNECT_REPO);
    });

    test("No repo opened", async () => {
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(undefined);
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(statusBarItem.show).toHaveBeenCalledTimes(1);
        expect(statusBarItem.command).toStrictEqual(undefined);
        expect(statusBarItem.text).toStrictEqual(STATUS_BAR_MSGS.NO_REPO_OPEN);
    });

    test("Repo opened but not synced", async () => {
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(statusBarItem.show).toHaveBeenCalledTimes(1);
        expect(statusBarItem.command).toStrictEqual(COMMAND.triggerSync);
        expect(statusBarItem.text).toStrictEqual(STATUS_BAR_MSGS.CONNECT_REPO);
    });

    test("Repo opened and synced", async () => {
        addRepo();
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(assertDiffsCount()).toBe(true);
    });

    test("Server is down, no diff", async () => {
        addRepo();
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        fetchMock.mockResponseOnce(JSON.stringify({status: false}));
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(assertDiffsCount()).toBe(true);
    });

    test("Server is down, 1 valid diff", async () => {
        addRepo();
        addDiff();
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        fetchMock.mockResponseOnce(null);
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(statusBarItem.show).toHaveBeenCalledTimes(2);
        expect(statusBarItem.command).toStrictEqual(undefined);
        expect(statusBarItem.text).toStrictEqual(STATUS_BAR_MSGS.SERVER_DOWN);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(1);
    });

    test("Server is up, 1 valid diff", async () => {
        addRepo();
        addDiff();
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(assertDiffsCount(1)).toBe(true);
    });

    test("Invalid diff file extension", async () => {
        addRepo();
        // Add text file in .diffs directory
        const diffFileName = `${new Date().getTime()}.txt`;
        const diffFilePath = path.join(diffsRepo, diffFileName);
        fs.writeFileSync(diffFilePath, DUMMY_FILE_CONTENT);
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(assertDiffsCount()).toBe(true);
    });

    test("Invalid diff file", async () => {
        addRepo();
        // Add invalid data in  in .diffs directory
        const diffFileName = `${new Date().getTime()}.yml`;
        const diffFilePath = path.join(diffsRepo, diffFileName);
        fs.writeFileSync(diffFilePath, yaml.safeDump({user: 12345}));
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(assertDiffsCount()).toBe(true);
    });

    test("Invalid repo path in diff file", async () => {
        addDiff();
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(assertDiffsCount(0, COMMAND.triggerSync, STATUS_BAR_MSGS.CONNECT_REPO)).toBe(true);
    });

    test("Diff file for disconnected repo", async () => {
        addRepo(true);
        addDiff();
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(assertDiffsCount(0, COMMAND.triggerSync, STATUS_BAR_MSGS.CONNECT_REPO)).toBe(true);
    });

    test("Diff for non-synced branch", async () => {
        // Diff file should not be removed. Wait for the branch to get synced first
        addRepo();
        addDiff("RANDOM_BRANCH");
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.process();
        expect(assertDiffsCount(1)).toBe(true);
    });
});
