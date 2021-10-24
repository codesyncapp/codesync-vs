import fs from "fs";
import path from "path";
import os from "os";
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
    getUserFilePath, PRE_SIGNED_URL,
    randomBaseRepoPath,
    randomRepoPath,
    TEST_EMAIL,
    TEST_REPO_RESPONSE,
    TEST_USER,
    waitFor
} from "../helpers/helpers";
import {bufferHandler} from "../../src/codesyncd/handlers/buffer_handler";
import {eventHandler} from "../../src/events/event_handler";
import {WebSocketClient} from "../../src/codesyncd/websocket/websocket_client";
import {WebSocketEvents} from "../../src/codesyncd/websocket/websocket_events";
import {readYML} from "../../src/utils/common";
import {DIFF_SOURCE} from "../../src/constants";
import {recallDaemon} from "../../src/codesyncd/codesyncd";


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
    const diffsRepo = pathUtilsObj.getDiffsRepo();

    const fileRelPath = "file_1.js";
    const newRelPath = "new.js";

    const newFileId = 5678;

    const newFilePath = path.join(repoPath, newRelPath);
    const shadowFilePath = path.join(shadowRepoBranchPath, fileRelPath);
    const originalsFilePath = path.join(originalsRepoBranchPath, fileRelPath);
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

    const renameDiff = JSON.stringify({old_rel_path: fileRelPath, new_rel_path: newRelPath});
    const normalDiff = "diff";

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        fetchMock.mockResponse(JSON.stringify({status: true}));
        global.IS_CODESYNC_DEV = true;
        jest.spyOn(global.console, 'log');
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        createSystemDirectories();
        fs.mkdirSync(repoPath, {recursive: true});
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
    });

    afterEach(() => {
        fs.rmSync(repoPath, {recursive: true, force: true});
        fs.rmSync(baseRepoPath, {recursive: true, force: true});
    });

    const addRepo = (isDisconnected = false) => {
        fs.mkdirSync(shadowRepoBranchPath, {recursive: true});
        getBranchName.mockReturnValue(DEFAULT_BRANCH);
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
            access_token: "ACCESS_TOKEN",
            access_key: TEST_USER.iam_access_key,
            secret_key: TEST_USER.iam_secret_key
        };
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
    };

    const addNewFileDiff = (branch = DEFAULT_BRANCH) => {
        const response = {id: newFileId, url: PRE_SIGNED_URL};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        getBranchName.mockReturnValue(branch);
        // Add file in .originals
        fs.mkdirSync(originalsRepoBranchPath, {recursive: true});
        const originalsPath = path.join(originalsRepoBranchPath, newRelPath);
        fs.writeFileSync(originalsPath, DUMMY_FILE_CONTENT);
        const handler = new eventHandler(repoPath);
        handler.isNewFile = true;
        return handler.addDiff(newRelPath);
    };

    const addChangesDiff = (branch = DEFAULT_BRANCH, relPath = fileRelPath, diff = normalDiff) => {
        getBranchName.mockReturnValue(branch);
        const handler = new eventHandler(repoPath);
        return handler.addDiff(relPath, diff);
    };

    const addRenameDiff = (branch = DEFAULT_BRANCH) => {
        getBranchName.mockReturnValue(branch);
        const handler = new eventHandler(repoPath);
        handler.isRename = true;
        return handler.addDiff(fileRelPath, renameDiff);
    };

    const addDeleteDiff = (relPath = fileRelPath) => {
        // Add file in shadow
        const shadowPath = path.join(shadowRepoBranchPath, relPath);
        fs.mkdirSync(shadowRepoBranchPath, {recursive: true});
        fs.writeFileSync(shadowPath, DUMMY_FILE_CONTENT);
        getBranchName.mockReturnValue(DEFAULT_BRANCH);
        const handler = new eventHandler(repoPath);
        handler.isDelete = true;
        return handler.addDiff(relPath, "");
    };

    const assertDiffsCount = (diffsCount = 0, command = undefined,
                              text = STATUS_BAR_MSGS.DEFAULT, assertStatusBar = false) => {
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(diffsCount);
        if (assertStatusBar) {
            expect(statusBarItem.show).toHaveBeenCalledTimes(1);
            expect(statusBarItem.command).toStrictEqual(command);
            expect(statusBarItem.text).toStrictEqual(text);
        }
        return true;
    };

    test("No config.yml", async () => {
        fs.rmSync(configPath);
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0, COMMAND.triggerSync, STATUS_BAR_MSGS.CONNECT_REPO)).toBe(true);
    });

    test("Server is down, no diff", async () => {
        addRepo();
        fetchMock.mockResponse(JSON.stringify({status: false}));
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0, undefined, STATUS_BAR_MSGS.SERVER_DOWN)).toBe(true);
    });

    test("Server is down, 1 valid diff", async () => {
        addRepo();
        addNewFileDiff();
        fetchMock.mockResponse(null);
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(1, undefined, STATUS_BAR_MSGS.SERVER_DOWN)).toBe(true);
    });

    test("No repo opened", async () => {
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(undefined);
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0, undefined, STATUS_BAR_MSGS.NO_REPO_OPEN)).toBe(true);
    });

    test("Repo opened but not synced", async () => {
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0, COMMAND.triggerSync, STATUS_BAR_MSGS.CONNECT_REPO)).toBe(true);
    });

    test("Repo opened and synced", async () => {
        addRepo();
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount()).toBe(true);
    });

    test("Server is up, 1 valid diff", async () => {
        addRepo();
        addChangesDiff();
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(1)).toBe(true);
    });

    test("Server is up, 2 valid diffs", async () => {
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        addRepo();
        addChangesDiff();
        await waitFor(1);
        addChangesDiff();
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(2);
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(2)).toBe(true);
    });

    test("Invalid diff file extension", async () => {
        addRepo();
        // Add text file in .diffs directory
        const diffFileName = `${new Date().getTime()}.txt`;
        const diffFilePath = path.join(diffsRepo, diffFileName);
        fs.writeFileSync(diffFilePath, DUMMY_FILE_CONTENT);
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount()).toBe(true);
    });

    test("Invalid diff file", async () => {
        addRepo();
        // Add invalid data in  in .diffs directory
        const diffFileName = `${new Date().getTime()}.yml`;
        const diffFilePath = path.join(diffsRepo, diffFileName);
        fs.writeFileSync(diffFilePath, yaml.safeDump({user: 12345}));
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount()).toBe(true);
    });

    test("Invalid repo path in diff file", async () => {
        addChangesDiff();
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0, COMMAND.triggerSync, STATUS_BAR_MSGS.CONNECT_REPO)).toBe(true);
    });

    test("Diff file for disconnected repo", async () => {
        addRepo(true);
        addChangesDiff();
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0, COMMAND.triggerSync, STATUS_BAR_MSGS.CONNECT_REPO)).toBe(true);
    });

    test("Diff for non-synced branch", async () => {
        // Diff file should not be removed. Wait for the branch to get synced first
        addRepo();
        addChangesDiff("RANDOM_BRANCH");
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(1)).toBe(true);
    });

    test("WebSocketClient: registerEvents", async () => {
        addRepo();
        addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketClient = new WebSocketClient(statusBarItem, repoDiffs[0]);
        webSocketClient.registerEvents();
        expect(webSocketClient.client.on).toHaveBeenCalledTimes(2);
        expect(webSocketClient.client.on.mock.calls[0][0]).toStrictEqual("connectFailed");
        expect(webSocketClient.client.on.mock.calls[1][0]).toStrictEqual("connect");
    });

    test("WebSocketClient: registerConnectionEvents", async () => {
        addRepo();
        addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketClient = new WebSocketClient(statusBarItem, repoDiffs[0]);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        webSocketClient.registerConnectionEvents(connection);
        expect(connection.on).toHaveBeenCalledTimes(3);
        expect(connection.on.mock.calls[0][0]).toStrictEqual("error");
        expect(connection.on.mock.calls[1][0]).toStrictEqual("close");
        expect(connection.on.mock.calls[2][0]).toStrictEqual("message");
        expect(connection.send).toHaveBeenCalledTimes(1);
        expect(connection.send.mock.calls[0][0]).toStrictEqual("ACCESS_TOKEN");
    });

    test("WebSocketEvents: onMessage, invalid msg", async () => {
        addRepo();
        addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        const webSocketEvents = new WebSocketEvents(connection, statusBarItem, repoDiffs[0]);
        const handled = await webSocketEvents.onMessage({'type': 'abc'});
        expect(handled).toBe(false);
    });

    test("WebSocketEvents: onMessage, Diff sent successfully", async () => {
        addRepo();
        const diffFilePath = addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        const webSocketEvents = new WebSocketEvents(connection, statusBarItem, repoDiffs[0]);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "sync",
                status: 200,
                diff_file_path: diffFilePath
            })
        };
        const handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(assertDiffsCount(0, undefined, STATUS_BAR_MSGS.SYNCING)).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(false);
    });

    test("WebSocketEvents: onMessage, Diff sent failed", async () => {
        addRepo();
        const diffFilePath = addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        let diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        const webSocketEvents = new WebSocketEvents(connection, statusBarItem, repoDiffs[0]);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "sync",
                status: 400,
                diff_file_path: diffFilePath
            })
        };
        const handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(false);
        expect(fs.existsSync(diffFilePath)).toBe(true);
    });

    test("WebSocketEvents: onMessage, Auth Failed", async () => {
        addRepo();
        const diffFilePath = addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        const webSocketEvents = new WebSocketEvents(connection, statusBarItem, repoDiffs[0]);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 400,
                diff_file_path: diffFilePath
            })
        };
        const handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(assertDiffsCount(1, COMMAND.triggerSignUp, STATUS_BAR_MSGS.AUTHENTICATION_FAILED)).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(true);
    });

    test("WebSocketEvents: onMessage, NewFile Diff", async () => {
        addRepo();
        const diffFilePath = addNewFileDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        const webSocketEvents = new WebSocketEvents(connection, statusBarItem, repoDiffs[0]);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200,
                diff_file_path: diffFilePath
            })
        };
        const handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(assertDiffsCount(0, undefined, STATUS_BAR_MSGS.SYNCING)).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(false);
        const config = readYML(configPath);
        // As diff was for new file, verify that file has been uploaded to server
        expect(newRelPath in config.repos[repoPath].branches[DEFAULT_BRANCH]).toBe(true);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH][newRelPath]).toStrictEqual(newFileId);
        // File should be deleted from .originals
        expect(fs.existsSync(originalsFilePath)).toBe(false);
    });

    test("WebSocketEvents: onMessage, New File Diff along with changes diff", async () => {
        // Should upload file only in 1 iteration
        addRepo();
        const diffFilePathForNewFile = addNewFileDiff();
        await waitFor(1);
        const diffFilePathForChanges = addChangesDiff(DEFAULT_BRANCH, newRelPath);
        let handler = new bufferHandler(statusBarItem);
        let diffFiles = handler.getDiffFiles();
        let repoDiffs = handler.groupRepoDiffs(diffFiles);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        let webSocketEvents = new WebSocketEvents(connection, statusBarItem, repoDiffs[0]);
        let msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200,
                diff_file_path: diffFilePathForNewFile
            })
        };
        let handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(assertDiffsCount(1, undefined, STATUS_BAR_MSGS.SYNCING)).toBe(true);
        // File should be deleted from .originals
        expect(fs.existsSync(originalsFilePath)).toBe(false);
        expect(fs.existsSync(diffFilePathForNewFile)).toBe(false);
        expect(fs.existsSync(diffFilePathForChanges)).toBe(true);
        const config = readYML(configPath);
        // As diff was for new file, verify that file has been uploaded to server
        expect(newRelPath in config.repos[repoPath].branches[DEFAULT_BRANCH]).toBe(true);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH][newRelPath]).toStrictEqual(newFileId);

        // Second iteration for changes event
        msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200,
                diff_file_path: diffFilePathForChanges
            })
        };
        handler = new bufferHandler(statusBarItem);
        diffFiles = handler.getDiffFiles();
        repoDiffs = handler.groupRepoDiffs(diffFiles);
        webSocketEvents = new WebSocketEvents(connection, statusBarItem, repoDiffs[0]);
        handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(fs.existsSync(diffFilePathForChanges)).toBe(true);
        expect(connection.send).toHaveBeenCalledTimes(1);
        const diffJSON = JSON.parse(connection.send.mock.calls[0][0]).diffs[0];
        expect(diffJSON.file_id).toStrictEqual(newFileId);
        expect(diffJSON.path).toStrictEqual(newRelPath);
        expect(diffJSON.is_deleted).toBeFalsy();
        expect(diffJSON.is_rename).toBeFalsy();
        expect(diffJSON.diff).toStrictEqual(normalDiff);
        expect(diffJSON.diff_file_path).toStrictEqual(diffFilePathForChanges);
        expect(diffJSON.source).toStrictEqual(DIFF_SOURCE);
        expect(diffJSON.platform).toStrictEqual(os.platform());
        // Successfully sent the diff
        msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "sync",
                status: 200,
                diff_file_path: diffFilePathForChanges
            })
        };
        handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(fs.existsSync(diffFilePathForChanges)).toBe(false);

    });

    test("WebSocketEvents: onMessage, Rename Diff", async () => {
        addRepo();
        const diffFilePath = addRenameDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        const webSocketEvents = new WebSocketEvents(connection, statusBarItem, repoDiffs[0]);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200,
                diff_file_path: diffFilePath
            })
        };
        const handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(true);
        expect(connection.send).toHaveBeenCalledTimes(1);
        const diffJSON = JSON.parse(connection.send.mock.calls[0][0]).diffs[0];
        expect(diffJSON.file_id).toStrictEqual(1234);
        expect(diffJSON.path).toStrictEqual(fileRelPath);
        expect(diffJSON.is_deleted).toBeFalsy();
        expect(diffJSON.is_rename).toBeTruthy();
        expect(diffJSON.diff).toStrictEqual(renameDiff);
        expect(diffJSON.diff_file_path).toStrictEqual(diffFilePath);
        expect(diffJSON.source).toStrictEqual(DIFF_SOURCE);
        expect(diffJSON.platform).toStrictEqual(os.platform());
    });

    test("WebSocketEvents: onMessage, Non Synced Deleted file", async () => {
        addRepo();
        const diffFilePath = addDeleteDiff(newRelPath);
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        const webSocketEvents = new WebSocketEvents(connection, statusBarItem, repoDiffs[0]);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200,
                diff_file_path: diffFilePath
            })
        };
        const handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(false);
        expect(connection.send).toHaveBeenCalledTimes(0);
    });

    test("WebSocketEvents: onMessage, Valid Deleted file", async () => {
        addRepo();
        const diffFilePath = addDeleteDiff(fileRelPath);
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        const webSocketEvents = new WebSocketEvents(connection, statusBarItem, repoDiffs[0]);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200,
                diff_file_path: diffFilePath
            })
        };
        const handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        expect(connection.send).toHaveBeenCalledTimes(1);
    });

    test("WebSocketEvents: onMessage, Changes for non synced file", async () => {
        addRepo();
        fs.writeFileSync(newFilePath, DUMMY_FILE_CONTENT);
        const response = {id: newFileId, url: PRE_SIGNED_URL};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const diffFilePath = addChangesDiff(DEFAULT_BRANCH, newRelPath);
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        const webSocketEvents = new WebSocketEvents(connection, statusBarItem, repoDiffs[0]);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200,
                diff_file_path: diffFilePath
            })
        };
        const handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(assertDiffsCount(0, undefined, STATUS_BAR_MSGS.SYNCING)).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(false);
        const config = readYML(configPath);
        // As diff was for new file, verify that file has been uploaded to server
        expect(newRelPath in config.repos[repoPath].branches[DEFAULT_BRANCH]).toBe(true);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH][newRelPath]).toStrictEqual(newFileId);
        // File should be deleted from .originals
        expect(fs.existsSync(originalsFilePath)).toBe(false);
    });

    test("codesyncd.ts", async () => {
        recallDaemon(statusBarItem);
        expect(global.IS_CODESYNC_DEV).toBe(true);
    });

});
