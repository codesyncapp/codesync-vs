import fs, { read } from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import vscode, { TreeItem } from "vscode";
import untildify from "untildify";
import getBranchName from "current-git-branch";
import fetchMock from "jest-fetch-mock";

import {pathUtils} from "../../src/utils/path_utils";
import {createSystemDirectories, generateRandomNumber} from "../../src/utils/setup_utils";
import {CODESYNC_STATES, CodeSyncState} from "../../src/utils/state_utils";
import {DEFAULT_BRANCH} from "../../src/constants";
import {
    addUser,
    Config,
    DUMMY_FILE_CONTENT,
    getConfigFilePath,
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
import {tabEventHandler} from "../../src/events/tab_event_handler";
import {SocketClient} from "../../src/codesyncd/websocket/socket_client";
import {SocketEvents} from "../../src/codesyncd/websocket/socket_events";
import {readYML} from "../../src/utils/common";
import {VSCODE} from "../../src/constants";
import {LockUtils} from "../../src/utils/lock_utils";
import { ConfigUtils } from "../../src/utils/config_utils";


describe("bufferHandler", () => {
    let baseRepoPath;
    let repoPath;
    let configPath;

    let pathUtilsObj;
    let shadowRepoBranchPath;
    let originalsRepoBranchPath;
    let diffsRepo;
    let tabsRepo;

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
            send: jest.fn(),
            close: jest.fn()
        };
        global.websocketClient = null;

        baseRepoPath = randomBaseRepoPath("bufferHandler");
        repoPath = randomRepoPath();
        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();

        fs.mkdirSync(repoPath, {recursive: true});
        setWorkspaceFolders(repoPath);

        configPath = getConfigFilePath(baseRepoPath);
    
        pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
        shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
        originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
        diffsRepo = pathUtilsObj.getDiffsRepo();
        tabsRepo = pathUtilsObj.getTabsRepo();
    
        newFilePath = path.join(repoPath, newRelPath);
        shadowFilePath = path.join(shadowRepoBranchPath, fileRelPath);
        originalsFilePath = path.join(originalsRepoBranchPath, fileRelPath);
        renameDiff = JSON.stringify({old_rel_path: fileRelPath, new_rel_path: newRelPath});

        CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, true);
        CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, true);
        CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_RUNNING, false);
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
            id: generateRandomNumber(1, 100000),
            branches: {},
            email: TEST_EMAIL
        };
        if (isDisconnected) {
            configData.repos[repoPath].is_disconnected = true;
        }
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = TEST_REPO_RESPONSE.file_path_and_id;
        configData.repos[repoPath].branches[DEFAULT_BRANCH]["ignore.js"] = 12345;
        fs.writeFileSync(configPath, yaml.dump(configData));
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

    const addTab = (repoPath, created_at, tabs ) => {
        console.log(`repoPath: ${repoPath}, created_at: ${created_at}, tabs: ${tabs}`);
        const tab_handler = new tabEventHandler(repoPath)
        const config_utils = new ConfigUtils();
        const repoId = config_utils.getRepoIdByPath(repoPath);
        // Add tabs to buffer
        tab_handler.addToBuffer(repoId, created_at, tabs);
        const pathData = fs.readdirSync(tabsRepo);
        console.log(`pathData: ${JSON.stringify(pathData)}`);
        for (const ymlFile of pathData) {
            console.log(`ymlFile: ${ymlFile}`);
            const tabData = readYML(path.join(tabsRepo, ymlFile));
            console.log(`tabData: ${JSON.stringify(tabData)}`);

        }
    }
    const tabPath1 = "file1.txt"
    const tabPath2 = "file2.txt"
    const returnTabs = () => {
        return ([
            {
                "file_id": 1,
                "path": tabPath1,
                "is_active": 0,
            },
            {
                "file_id": 2,
                "path": tabPath2,
                "is_active": 1,
            },
        ])
    }

    const assertTabsCount = (tabsCount = 0) => {
        let tabFiles = fs.readdirSync(tabsRepo);
        console.log(`tabFiles: ${tabFiles}`);
        expect(tabFiles).toHaveLength(tabsCount);
        return true;        
    }

    const assertTabStructure = () => {
        const tabFiles = fs.readdirSync(tabsRepo);
        const config_utils = new ConfigUtils();
        const repoId = config_utils.getRepoIdByPath(repoPath);
        for (const tabFile of tabFiles) {
            const tabData = readYML(path.join(tabsRepo, tabFile));
            // console.log(`TABS1: ${JSON.stringify(tabData)}`);
            expect(tabData.repository_id).toBe(repoId);
            expect(tabData.source).toBe(VSCODE);
            expect(tabData.created_at).toBeDefined();
            expect(tabData.file_name).toBeDefined();
            // Asserting tab 1
            expect(tabData.tabs[0].file_id).toBe(1);
            expect(tabData.tabs[0].path).toBe(tabPath1);
            expect(tabData.tabs[0].is_active).toBe(0);
            // Asserting tab 2
            expect(tabData.tabs[1].file_id).toBe(2);
            expect(tabData.tabs[1].path).toBe(tabPath2);
            expect(tabData.tabs[1].is_active).toBe(1);
        }
    }

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
        fs.writeFileSync(diffFilePath, yaml.dump({user: 12345}));
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        await waitFor(1);
        expect(assertDiffsCount()).toBe(true);
    });

    test("Invalid repo path in diff file", async () => {
        addChangesDiff();
        addUser(baseRepoPath);
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        const diffs = await handler.getDiffFiles();
        if (diffs.files.length) await waitFor(2);
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
        const diffs = await handler.getDiffFiles();
        if (diffs.files.length) await waitFor(2);
        expect(assertDiffsCount(0)).toBe(true);
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
        const diffs = await handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffs.files);
        const webSocketClient = new SocketClient(statusBarItem, "access_token", repoDiffs);
        webSocketClient.connect();
        expect(webSocketClient.websocketClient.on).toHaveBeenCalledTimes(2);
        expect(webSocketClient.websocketClient.on.mock.calls[0][0]).toStrictEqual("connectFailed");
        expect(webSocketClient.websocketClient.on.mock.calls[1][0]).toStrictEqual("connect");
    });

    test("SocketClient: registerConnectionEvents", async () => {
        addRepo();
        addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffs = await handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffs.files);
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
        const diffs = await handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffs.files);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN", true);
        const handled = await webSocketEvents.onMessage({'type': 'abc'});
        expect(handled).toBe(false);
    });

    test("SocketEvents: onMessage, Diff sent successfully", async () => {
        addRepo();
        const diffFilePath = addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffs = await handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffs.files);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN", true);
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
        if (diffs.files.length) await waitFor(2);
        expect(assertDiffsCount(0)).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(false);
    });

    test("SocketEvents: onMessage, Diff sent failed", async () => {
        addRepo();
        const diffFilePath = addChangesDiff();
        const handler = new bufferHandler(statusBarItem);
        let diffs = await handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffs.files);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN", true);
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
        const diffs = await handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffs.files);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN", true);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 400
            })
        };
        const handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(assertDiffsCount(1)).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(true);
    });

    test("SocketEvents: onMessage, NewFile Diff", async () => {
        addRepo();
        const diffFilePath = addNewFileDiff();
        const handler = new bufferHandler(statusBarItem);
        const diffs = await handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffs.files);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN", true);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200
            })
        };
        const handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        if (diffs.files.length) await waitFor(2);
        expect(assertDiffsCount(0)).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(false);
        const config = readYML(configPath);
        // As diff was for new file, verify that file has been uploaded to server
        expect(newRelPath in config.repos[repoPath].branches[DEFAULT_BRANCH]).toBe(true);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH][newRelPath]).toStrictEqual(newFileId);
        // File should be deleted from .originals
        expect(fs.existsSync(originalsFilePath)).toBe(false);
    });

    test("SocketEvents: onMessage, New File Diff along with changes diff", async () => {
        // Should upload file only in 1st iteration
        addRepo();
        const diffFilePathForNewFile = addNewFileDiff();
        await waitFor(1);
        const diffFilePathForChanges = addChangesDiff(DEFAULT_BRANCH, newRelPath);
        let handler = new bufferHandler(statusBarItem);
        let diffs = await handler.getDiffFiles();
        let repoDiffs = handler.groupRepoDiffs(diffs.files);
        let webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN", true);
        let msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200
            })
        };
        let handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(assertDiffsCount(1)).toBe(true);
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
                status: 200
            })
        };
        handler = new bufferHandler(statusBarItem);
        diffs = await handler.getDiffFiles();
        repoDiffs = handler.groupRepoDiffs(diffs.files);
        webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN", true);
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
        expect(diffJSON.source).toStrictEqual(VSCODE);
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
        const diffs = await handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffs.files);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN", true);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200
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
        expect(diffJSON.source).toStrictEqual(VSCODE);
        expect(diffJSON.platform).toStrictEqual(os.platform());
    });

    test("SocketEvents: onMessage, Non Synced Deleted file", async () => {
        addRepo();
        const diffFilePath = addDeleteDiff(newRelPath);
        const handler = new bufferHandler(statusBarItem);
        const diffs = await handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffs.files);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN", true);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200
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
        const diffs = await handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffs.files);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN", true);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200
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
        expect(diffJSON.source).toStrictEqual(VSCODE);
        expect(diffJSON.platform).toStrictEqual(os.platform());
    });

    test("SocketEvents: onMessage, Changes for non synced file", async () => {
        // file_id is missing from config file, so the bufferHandler should upload the file first and the sync 
        // the diff in next iteration
        const lockUtils = new LockUtils();
        lockUtils.acquireSendDiffsLock();
        lockUtils.acquirePopulateBufferLock();    
        addRepo();
        fs.writeFileSync(newFilePath, DUMMY_FILE_CONTENT);
        const response = {id: newFileId, url: PRE_SIGNED_URL};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const diffFilePath = addChangesDiff(DEFAULT_BRANCH, newRelPath);
        const handler = new bufferHandler(statusBarItem);
        const diffs = await handler.getDiffFiles();
        const repoDiffs = handler.groupRepoDiffs(diffs.files);
        const webSocketEvents = new SocketEvents(statusBarItem, repoDiffs, "ACCESS_TOKEN", true);
        const msg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200
            })
        };
        let handled = await webSocketEvents.onMessage(msg);
        expect(handled).toBe(true);
        expect(assertDiffsCount(1)).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(true);
        const config = readYML(configPath);
        // As diff was for new file, verify that file has been uploaded to server
        expect(newRelPath in config.repos[repoPath].branches[DEFAULT_BRANCH]).toBe(true);
        expect(config.repos[repoPath].branches[DEFAULT_BRANCH][newRelPath]).toStrictEqual(newFileId);
        // File should be deleted from .originals
        expect(fs.existsSync(originalsFilePath)).toBe(false);
        // Second iteraton
        const secondMsg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "auth",
                status: 200
            })
        };
        handled = await webSocketEvents.onMessage(secondMsg);
        expect(handled).toBe(true);
        expect(assertDiffsCount(1)).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(true);

        // Diff synced successfullt 
        const syncMsg = {
            type: 'utf8',
            utf8Data: JSON.stringify({
                type: "sync",
                status: 200,
                diff_file_path: diffFilePath
            })
        };
        handled = await webSocketEvents.onMessage(syncMsg);
        expect(handled).toBe(true);
        if (diffs.files.length) await waitFor(2);
        expect(assertDiffsCount(0)).toBe(true);
        expect(fs.existsSync(diffFilePath)).toBe(false);
    });

    test("No tab", async () => {
        addRepo();
        const handler = new bufferHandler(statusBarItem);
        await handler.run();
        expect(assertTabsCount(0)).toBe(true);
    });

    test("1 tab", async () => {
        addRepo();
        const tabs = returnTabs()
        addTab(repoPath, new Date().getTime(), tabs);
        assertTabsCount(1);
        assertTabStructure()
    })
});
