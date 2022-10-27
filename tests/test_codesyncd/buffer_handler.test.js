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
import {CODESYNC_STATES, CodeSyncState} from "../../src/utils/state_utils";
import {COMMAND, DEFAULT_BRANCH, STATUS_BAR_MSGS} from "../../src/constants";
import {
    addUser,
    DUMMY_FILE_CONTENT,
    getConfigFilePath,
    getSeqTokenFilePath,
    PRE_SIGNED_URL,
    randomBaseRepoPath,
    randomRepoPath,
    setWorkspaceFolders,
    TEST_EMAIL,
    TEST_REPO_RESPONSE,
    waitFor
} from "../helpers/helpers";
import {bufferHandler} from "../../src/codesyncd/handlers/buffer_handler";
import {eventHandler} from "../../src/events/event_handler";
import {SocketClient} from "../../src/codesyncd/websocket/socket_client";
import {SocketEvents} from "../../src/codesyncd/websocket/socket_events";
import {readYML} from "../../src/utils/common";
import {DIFF_SOURCE} from "../../src/constants";
import {LockUtils} from "../../src/utils/lock_utils";


describe("bufferHandler", () => {
    let baseRepoPath;
    let repoPath;
    let configPath;
    let sequenceTokenFilePath;

    let pathUtilsObj;
    let shadowRepoBranchPath;
    let originalsRepoBranchPath;
    let diffsRepo;

    let newFilePath;
    let shadowFilePath;
    let originalsFilePath;
    let renameDiff;

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    const fileRelPath = "file_1.js";
    const newRelPath = "new.js";
    const newFileId = 5678;
    const normalDiff = "diff";

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        jest.spyOn(global.console, 'log');
        global.IS_CODESYNC_TEST_MODE = true;
        global.socketConnection = {
            on: jest.fn(),
            send: jest.fn()
        };
        global.client = null;

        baseRepoPath = randomBaseRepoPath("bufferHandler");
        repoPath = randomRepoPath();
        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();

        fs.mkdirSync(repoPath, {recursive: true});
        setWorkspaceFolders(repoPath);

        configPath = getConfigFilePath(baseRepoPath);
        sequenceTokenFilePath = getSeqTokenFilePath(baseRepoPath);
    
        pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
        shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
        originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
        diffsRepo = pathUtilsObj.getDiffsRepo();
    
        newFilePath = path.join(repoPath, newRelPath);
        shadowFilePath = path.join(shadowRepoBranchPath, fileRelPath);
        originalsFilePath = path.join(originalsRepoBranchPath, fileRelPath);
        renameDiff = JSON.stringify({old_rel_path: fileRelPath, new_rel_path: newRelPath});

        CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, true);
        CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, true);
    });

    afterEach(() => {
        CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
        CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
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
        addUser(baseRepoPath, true);
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

    const assertDiffsCount = (diffsCount = 0) => {
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(diffsCount);
        return true;
    };

    test("No config.yml", async () => {
        fs.rmSync(configPath);
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0)).toBe(true);
    });

    test("No diff", async () => {
        addRepo();
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0)).toBe(true);
    });

    test("1 valid diff", async () => {
        addRepo();
        addNewFileDiff();
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(1)).toBe(true);
    });

    test("No repo opened, no diff", async () => {
        addUser(baseRepoPath);
        setWorkspaceFolders(undefined);
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0)).toBe(true);
    });

    test("Repo opened but not synced", async () => {
        addUser(baseRepoPath);
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0)).toBe(true);
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
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(1)).toBe(true);
    });

    test("Server is up, 2 valid diffs", async () => {
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
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount()).toBe(true);
    });

    test("Invalid repo path in diff file", async () => {
        addChangesDiff();
        addUser(baseRepoPath);
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0)).toBe(true);
    });

    test("No valid user", async () => {
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0)).toBe(true);
    });

    test("No active user", async () => {
        addUser(baseRepoPath, false);
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0)).toBe(true);
    });

    test("Diff file for disconnected repo", async () => {
        addRepo(true);
        addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(0, COMMAND.triggerSync, STATUS_BAR_MSGS.CONNECT_REPO)).toBe(true);
    });

    test("Diff for non synced branch", async () => {
        // Diff file should not be removed. Wait for the branch to get synced first
        addRepo();
        addChangesDiff("RANDOM_BRANCH");
        fetchMock.mockResponseOnce(JSON.stringify({status: true}));
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertDiffsCount(1)).toBe(true);
    });

    test("SocketClient: registerEvents", async () => {
        addRepo();
        addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketClient = new SocketClient(statusBarItem, "access_token", repoDiffs);
        webSocketClient.connect();
        expect(webSocketClient.client.on).toHaveBeenCalledTimes(2);
        expect(webSocketClient.client.on.mock.calls[0][0]).toStrictEqual("connectFailed");
        expect(webSocketClient.client.on.mock.calls[1][0]).toStrictEqual("connect");
    });

    test("SocketClient: registerConnectionEvents", async () => {
        addRepo();
        addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketClient = new SocketClient(statusBarItem, "access_token", repoDiffs);
        const connection = {
            on: jest.fn(),
            send: jest.fn()
        };
        webSocketClient.registerConnectionEvents(connection);
        expect(connection.on).toHaveBeenCalledTimes(3);
        expect(connection.on.mock.calls[0][0]).toStrictEqual("error");
        expect(connection.on.mock.calls[1][0]).toStrictEqual("close");
        expect(connection.on.mock.calls[2][0]).toStrictEqual("message");
        expect(connection.send).toHaveBeenCalledTimes(0);
    });

    test("SocketEvents: onMessage, invalid msg", async () => {
        addRepo();
        addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN");
        const handled = await webSocketEvents.onMessage({'type': 'abc'});
        expect(handled).toBe(false);
    });

    test("SocketEvents: onMessage, Diff sent successfully", async () => {
        addRepo();
        const diffFilePath = addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN");
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

    test("SocketEvents: onMessage, Diff sent failed", async () => {
        addRepo();
        const diffFilePath = addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        let diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN");
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

    test("SocketEvents: onMessage, Auth Failed", async () => {
        addRepo();
        const diffFilePath = addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN");
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

    test("SocketEvents: onMessage, NewFile Diff", async () => {
        addRepo();
        const diffFilePath = addNewFileDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN");
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

    test("SocketEvents: onMessage, New File Diff along with changes diff", async () => {
        // Should upload file only in 1 iteration
        addRepo();
        const diffFilePathForNewFile = addNewFileDiff();
        await waitFor(1);
        const diffFilePathForChanges = addChangesDiff(DEFAULT_BRANCH, newRelPath);
        let handler = new bufferHandler(statusBarItem);
        let diffFiles = handler.getDiffFiles();
        let repoDiffs = handler.groupRepoDiffs(diffFiles);
        let webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN");
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
        webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN");

        handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(fs.existsSync(diffFilePathForChanges)).toBe(true);
        expect(global.socketConnection.send).toHaveBeenCalledTimes(3);
        expect(JSON.parse(global.socketConnection.send.mock.calls[0][0]).auth).toStrictEqual(200);
        expect(JSON.parse(global.socketConnection.send.mock.calls[1][0]).auth).toStrictEqual(200);
        const diffJSON = JSON.parse(global.socketConnection.send.mock.calls[2][0]).diffs[0];
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

    test("SocketEvents: onMessage, Rename Diff", async () => {
        addRepo();
        const diffFilePath = addRenameDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN");
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
        expect(global.socketConnection.send).toHaveBeenCalledTimes(2);
        expect(JSON.parse(global.socketConnection.send.mock.calls[0][0]).auth).toStrictEqual(200);
        const diffJSON = JSON.parse(global.socketConnection.send.mock.calls[1][0]).diffs[0];
        expect(diffJSON.file_id).toStrictEqual(1234);
        expect(diffJSON.path).toStrictEqual(fileRelPath);
        expect(diffJSON.is_deleted).toBeFalsy();
        expect(diffJSON.is_rename).toBeTruthy();
        expect(diffJSON.diff).toStrictEqual(renameDiff);
        expect(diffJSON.diff_file_path).toStrictEqual(diffFilePath);
        expect(diffJSON.source).toStrictEqual(DIFF_SOURCE);
        expect(diffJSON.platform).toStrictEqual(os.platform());
    });

    test("SocketEvents: onMessage, Non Synced Deleted file", async () => {
        addRepo();
        const diffFilePath = addDeleteDiff(newRelPath);
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN");
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
        expect(global.socketConnection.send).toHaveBeenCalledTimes(1);
        expect(JSON.parse(global.socketConnection.send.mock.calls[0][0]).auth).toStrictEqual(200);
    });

    test("SocketEvents: onMessage, Valid Deleted file", async () => {
        addRepo();
        const diffFilePath = addDeleteDiff(fileRelPath);
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN");
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
        expect(global.socketConnection.send).toHaveBeenCalledTimes(2);
        expect(JSON.parse(global.socketConnection.send.mock.calls[0][0]).auth).toStrictEqual(200);
        const diffJSON = JSON.parse(global.socketConnection.send.mock.calls[1][0]).diffs[0];
        expect(diffJSON.file_id).toStrictEqual(1234);
        expect(diffJSON.path).toStrictEqual(fileRelPath);
        expect(diffJSON.is_deleted).toBeTruthy();
        expect(diffJSON.is_rename).toBeFalsy();
        expect(diffJSON.diff_file_path).toStrictEqual(diffFilePath);
        expect(diffJSON.source).toStrictEqual(DIFF_SOURCE);
        expect(diffJSON.platform).toStrictEqual(os.platform());
    });

    test("SocketEvents: onMessage, Changes for non synced file", async () => {
        const lockUtils = new LockUtils();
        lockUtils.acquireSendDiffsLock();
        lockUtils.acquirePopulateBufferLock();    
        addRepo();
        fs.writeFileSync(newFilePath, DUMMY_FILE_CONTENT);
        const response = {id: newFileId, url: PRE_SIGNED_URL};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const diffFilePath = addChangesDiff(DEFAULT_BRANCH, newRelPath);
        const handler = new bufferHandler(statusBarItem);
        const diffFiles = handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffFiles);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN");
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
});
