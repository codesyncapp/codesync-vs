import fs from "fs";
import path from "path";
import lockFile from "proper-lockfile";
import vscode from "vscode";
import untildify from "untildify";
import {generateSettings} from "../../src/settings";
import {recallDaemon} from "../../src/codesyncd/codesyncd";
import {CodeSyncState, CODESYNC_STATES} from "../../src/utils/state_utils";
import {
    randomBaseRepoPath,
    getConfigFilePath,
    addUser,
    setWorkspaceFolders, 
    Config, 
    randomRepoPath,
    getUserFilePath
} from "../helpers/helpers";
import {createSystemDirectories} from "../../src/utils/setup_utils";
import {STATUS_BAR_MSGS, COMMAND, SYNCIGNORE} from "../../src/constants";
import {statusBarMsgs} from "../../src/codesyncd/utils";
import { LockUtils } from "../../src/utils/lock_utils";

describe("codesyncd: locks", () => {
    let baseRepoPath;
    let settings;

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        baseRepoPath = randomBaseRepoPath();
        untildify.mockReturnValue(baseRepoPath);
        settings = generateSettings();
        createSystemDirectories();
		CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
		CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
    });

    afterEach(() => {
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("acquirePopulateBufferLock", () => {
        const lockUtils = new LockUtils();
        lockUtils.acquirePopulateBufferLock();
        expect(lockFile.checkSync(settings.POPULATE_BUFFER_LOCK_FILE)).toBe(true);
        expect(CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED)).toBe(true);
		expect(lockFile.checkSync(settings.DIFFS_SEND_LOCK_FILE)).toBe(false);
		expect(CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED)).toBe(false);
    });

	test("acquireSendDiffsLock", () => {
        const lockUtils = new LockUtils();
        lockUtils.acquireSendDiffsLock();
		expect(lockFile.checkSync(settings.DIFFS_SEND_LOCK_FILE)).toBe(true);
		expect(CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED)).toBe(true);
        expect(lockFile.checkSync(settings.POPULATE_BUFFER_LOCK_FILE)).toBe(false);
        expect(CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED)).toBe(false);
	});
});

describe("codesyncd: recallDaemon", () => {
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const repoPath = randomRepoPath();
    const userFilePath = getUserFilePath(baseRepoPath);
    untildify.mockReturnValue(baseRepoPath);
    const settings = generateSettings();
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    
    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        global.IS_CODESYNC_DEV = true;
        createSystemDirectories();
        fs.mkdirSync(repoPath, {recursive: true});
        // Add repo in config and add user
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
        CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    const assertCommon = (text=STATUS_BAR_MSGS.DEFAULT, command=undefined, times=1) => {
        expect(statusBarItem.command).toStrictEqual(command);
        expect(statusBarItem.text).toStrictEqual(text);
        expect(statusBarItem.show).toHaveBeenCalledTimes(times);
        return true;
    };

    test("No config.yml", () => {
        fs.rmSync(configPath);
        recallDaemon(statusBarItem);
        expect(assertCommon(STATUS_BAR_MSGS.NO_CONFIG)).toBe(true);
    });

    test("No valid user", () => {
        fs.rmSync(userFilePath);
        recallDaemon(statusBarItem);
        expect(assertCommon(STATUS_BAR_MSGS.AUTHENTICATION_FAILED, COMMAND.triggerSignUp)).toBe(true);
    });

    test("No active user", async () => {
        fs.rmSync(userFilePath);
        addUser(baseRepoPath, false);
        recallDaemon(statusBarItem);
        expect(assertCommon(STATUS_BAR_MSGS.AUTHENTICATION_FAILED, COMMAND.triggerSignUp)).toBe(true);
    });

    test("No repo opened", () => {
        setWorkspaceFolders(undefined);
        recallDaemon(statusBarItem);
        expect(assertCommon(STATUS_BAR_MSGS.NO_REPO_OPEN)).toBe(true);
    });

    test("Repo opened but not synced", async () => {
        setWorkspaceFolders(randomRepoPath());
        recallDaemon(statusBarItem);
        expect(assertCommon(STATUS_BAR_MSGS.CONNECT_REPO, COMMAND.triggerSync)).toBe(true);
    });

    test("Repo opened but is_disconnected", async () => {
        fs.rmSync(configPath);
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo(true);
        recallDaemon(statusBarItem);
        expect(assertCommon(STATUS_BAR_MSGS.CONNECT_REPO, COMMAND.triggerSync)).toBe(true);
    });

    test("With Sub directory", async () => {
        const subDir = path.join(repoPath, "directory");
        setWorkspaceFolders(subDir);
        recallDaemon(statusBarItem);
        expect(assertCommon(STATUS_BAR_MSGS.DEFAULT)).toBe(true);
    });

    test("With sync ignored Sub directory", async () => {
        const subDirName = "directory";
        // Add subDir to .syncignore
        const syncignorePath = path.join(repoPath, SYNCIGNORE);
        fs.writeFileSync(syncignorePath, subDirName);
        const subDir = path.join(repoPath, subDirName);
        setWorkspaceFolders(subDir);
        recallDaemon(statusBarItem);
        expect(assertCommon(STATUS_BAR_MSGS.IS_SYNCIGNORED_SUB_DIR)).toBe(true);
    });    

    test("with no lock acquired", () => {
        CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
		CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
        recallDaemon(statusBarItem);
        expect(lockFile.checkSync(settings.POPULATE_BUFFER_LOCK_FILE)).toBe(true);
		expect(lockFile.checkSync(settings.DIFFS_SEND_LOCK_FILE)).toBe(true);
        expect(CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED)).toBe(true);
		expect(CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED)).toBe(true);
    });

    test("with lock acquired for populateBuffer", () => {
        const lockUtils = new LockUtils();
        lockUtils.acquirePopulateBufferLock();
        recallDaemon(statusBarItem);
        expect(lockFile.checkSync(settings.POPULATE_BUFFER_LOCK_FILE)).toBe(true);
		expect(lockFile.checkSync(settings.DIFFS_SEND_LOCK_FILE)).toBe(true);
        expect(CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED)).toBe(true);
		expect(CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED)).toBe(true);
    });

    test("with lock acquired for diffsSend", () => {
        const lockUtils = new LockUtils();
        lockUtils.acquireSendDiffsLock();
        recallDaemon(statusBarItem);
        expect(lockFile.checkSync(settings.POPULATE_BUFFER_LOCK_FILE)).toBe(true);
		expect(lockFile.checkSync(settings.DIFFS_SEND_LOCK_FILE)).toBe(true);
        expect(CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED)).toBe(true);
		expect(CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED)).toBe(true);
    });

    test("with diffsSendLock acquried by other instance", () => {
        lockFile.lockSync(settings.DIFFS_SEND_LOCK_FILE);
        const lockUtils = new LockUtils();
        lockUtils.acquirePopulateBufferLock();
        recallDaemon(statusBarItem);
        expect(CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED)).toBe(true);
		expect(CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED)).toBe(false);
    });

    test("with populateBuffer acquried by other instance", () => {
        lockFile.lockSync(settings.POPULATE_BUFFER_LOCK_FILE);
        const lockUtils = new LockUtils();
        lockUtils.acquireSendDiffsLock();
        recallDaemon(statusBarItem);
        expect(CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED)).toBe(false);
		expect(CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED)).toBe(true);
    });
});

describe("updateStatusBarItem", () => {
    const baseRepoPath = randomBaseRepoPath();
    untildify.mockReturnValue(baseRepoPath);

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

    test('Random Text', () => {
        const statusBarMsgsHandler = new statusBarMsgs(statusBarItem);
        statusBarMsgsHandler.update("text");
        expect(statusBarItem.text).toEqual("text");
        expect(statusBarItem.command).toEqual(undefined);
    });

    test('Auth Failed', () => {
        const statusBarMsgsHandler = new statusBarMsgs(statusBarItem);
        statusBarMsgsHandler.update(STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
        expect(statusBarItem.text).toEqual(STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
        expect(statusBarItem.command).toEqual(COMMAND.triggerSignUp);
    });

    test('Connect Repo', () => {
        const statusBarMsgsHandler = new statusBarMsgs(statusBarItem);
        statusBarMsgsHandler.update(STATUS_BAR_MSGS.CONNECT_REPO);
        expect(statusBarItem.text).toEqual(STATUS_BAR_MSGS.CONNECT_REPO);
        expect(statusBarItem.command).toEqual(COMMAND.triggerSync);
    });
});