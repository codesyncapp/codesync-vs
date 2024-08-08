import fs from "fs";
import path from "path";
import lockFile from "proper-lockfile";
import vscode from "vscode";
import untildify from "untildify";
import {generateSettings} from "../../src/settings";
import {recallDaemon} from "../../src/codesyncd/codesyncd";
import {CodeSyncState, CODESYNC_STATES} from "../../src/utils/state_utils";
import { UserState } from "../../src/utils/user_utils";
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
import { RepoState } from "../../src/utils/repo_state_utils";

describe("codesyncd: locks", () => {
    let baseRepoPath;
    let settings;

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        global.IS_CODESYNC_TEST_MODE = true;
        baseRepoPath = randomBaseRepoPath("codesyncd_locks");
        fs.mkdirSync(baseRepoPath, { recursive: true });
        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();
        settings = generateSettings();
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
    let baseRepoPath;
    let configPath;
    let repoPath;
    let userFilePath;
    let settings;
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    
    beforeEach(() => {
        jest.clearAllMocks();
        global.IS_CODESYNC_TEST_MODE = true;

        baseRepoPath = randomBaseRepoPath("codesyncd_recallDaemon");
        repoPath = randomRepoPath();

        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();
        configPath = getConfigFilePath(baseRepoPath);
        userFilePath = getUserFilePath(baseRepoPath);
        settings = generateSettings();

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
        const userState = new UserState();
        userState.set(false, false);
        recallDaemon(statusBarItem);
        expect(assertCommon(STATUS_BAR_MSGS.AUTHENTICATION_FAILED, COMMAND.triggerRequestADemo)).toBe(true);
        
    });

    test("No active user", async () => {
        fs.rmSync(userFilePath);
        addUser(baseRepoPath, false);
        recallDaemon(statusBarItem);
        expect(assertCommon(STATUS_BAR_MSGS.AUTHENTICATION_FAILED, COMMAND.triggerRequestADemo)).toBe(true);
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
        new RepoState(subDir).setSubDirState();
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
        new RepoState(subDir).setSubDirState();
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
        lockFile.lockSync(settings.DIFFS_SEND_LOCK_FILE, {onCompromised: () => {}});
        const lockUtils = new LockUtils();
        lockUtils.acquirePopulateBufferLock();
        recallDaemon(statusBarItem);
        expect(CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED)).toBe(true);
		expect(CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED)).toBe(false);
    });

    test("with populateBuffer acquried by other instance", () => {
        lockFile.lockSync(settings.POPULATE_BUFFER_LOCK_FILE, {onCompromised: () => {}});
        const lockUtils = new LockUtils();
        lockUtils.acquireSendDiffsLock();
        recallDaemon(statusBarItem);
        expect(CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED)).toBe(false);
		expect(CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED)).toBe(true);
    });
});

describe("updateStatusBarItem", () => {
    const baseRepoPath = randomBaseRepoPath("codesyncd_updateStatusBarItem");
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
        expect(statusBarItem.command).toEqual(COMMAND.triggerRequestADemo);
    });

    test('Connect Repo', () => {
        const statusBarMsgsHandler = new statusBarMsgs(statusBarItem);
        statusBarMsgsHandler.update(STATUS_BAR_MSGS.CONNECT_REPO);
        expect(statusBarItem.text).toEqual(STATUS_BAR_MSGS.CONNECT_REPO);
        expect(statusBarItem.command).toEqual(COMMAND.triggerSync);
    });
});