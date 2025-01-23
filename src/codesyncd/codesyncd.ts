import vscode from "vscode";

import { RESTART_DAEMON_AFTER, STATUS_BAR_MSGS } from "../constants";
import { bufferHandler } from "./handlers/buffer_handler";
import { populateBuffer } from "./populate_buffer";
import { CodeSyncState, CODESYNC_STATES } from "../utils/state_utils";
import { statusBarMsgs } from "./utils";
import { LockUtils } from "../utils/lock_utils";
import { Alerts } from "./alert_utils";
import { CodeSyncLogger } from "../logger";


export const recallDaemon = (statusBarItem: vscode.StatusBarItem, viaDaemon=true) => {
    /*
    There are two types of locks we are using.
    1- POPULATE_BUFFER_LOCK (Overall across all IDEs)
    2- DIFFS_SEND_LOCK (Per IDE type)

    We are using Locks for sending diffs and populating buffer
    - checkLock() returns true if lock is acquired by any process. It does not specifies the instance/process
    - acqurieLock() acquires the lock first time but then returns false
    
    So, to keep track which instance of the IDE acquired the locks, whenever a lock is acquired, we set following 
    states in global State:
    
    1- POPULATE_BUFFER_LOCK_ACQUIRED
    2- DIFFS_SEND_LOCK_ACQUIRED
    respectively

    By checking the state variable, we decide to run both components of Daemon i.e. populateBuffer and bufferHandler.

    Case 1:
        If both locks have been acquired by this instance, Daemon runs both populateBuffer and bufferHandler
    Case 2:
        If only POPULATE_BUFFER_LOCK is acquried by this instance:
        - If DIFFS_SEND_LOCK is already acquired, run only populateBuffer
        - Othewise acqurie DIFFS_SEND_LOCK and run both populateBuffer and bufferHandler
    Case 3:
        If only DIFFS_SEND_LOCK is acquried by this instance:
        - If POPULATE_BUFFER_LOCK is already acquired, run only bufferHandler
        - Othewise acqurie POPULATE_BUFFER_LOCK and run both populateBuffer and bufferHandler
    Case 4:
        If no lock is acquired by this instance, we check if locks are avilable OR if some other instance has acquired those locks
        - If locks are available, we acquire the lock
        - Recall the daemon without doing anything so that it continue to check the locks
    */
    const statusBarMsgsHandler = new statusBarMsgs(statusBarItem);
    let statusBarMsg = "";
    statusBarMsg = viaDaemon ? statusBarMsgsHandler.getMsg() : STATUS_BAR_MSGS.GETTING_READY;
    statusBarMsgsHandler.update(statusBarMsg);

    // Do not proceed if no active user is found OR no config is found
    if ([STATUS_BAR_MSGS.AUTHENTICATION_FAILED, STATUS_BAR_MSGS.NO_CONFIG].includes(statusBarMsg)) {
        // Do not re-run daemon in case of tests
        if ((global as any).IS_CODESYNC_TEST_MODE) return;
        return setTimeout(() => {
            recallDaemon(statusBarItem);
        }, RESTART_DAEMON_AFTER);
    }

    // Checking permissions here to run populateBuffer and bufferHandler
    const canPopulateBuffer = CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED);
    const canSendDiffs = CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED);

    // Check Locks availability
    const lockUtils = new LockUtils();
    const isPopulateBufferLockAcquired = lockUtils.checkPopulateBufferLock();
    const isSendingDiffsLockAcquired = lockUtils.checkDiffsSendLock();

    switch (true) {
        case canPopulateBuffer && canSendDiffs:
            break;
        case canPopulateBuffer && !isSendingDiffsLockAcquired:
            lockUtils.acquireSendDiffsLock();
            break;
        case canSendDiffs && !isPopulateBufferLockAcquired:
            lockUtils.acquirePopulateBufferLock();
            break;
        case !canPopulateBuffer && !canSendDiffs:
            if (!isPopulateBufferLockAcquired) lockUtils.acquirePopulateBufferLock();
            if (!isSendingDiffsLockAcquired) lockUtils.acquireSendDiffsLock();
            break;
        default:
            break;
    }

    // Do not re-run daemon in case of tests
    if ((global as any).IS_CODESYNC_TEST_MODE) return;

    // Recall daemon after 5s
    setTimeout(() => {
        // Get updated states
        const canPopulateBuffer = CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED);
        const canSendSocketData = CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED);
        // Populate Buffer
        if (canPopulateBuffer) populateBuffer();
        // Buffer Handler
        const handler = new bufferHandler(statusBarItem);
        handler.run(canSendSocketData);
        // recall Daemon
        recallDaemon(statusBarItem);
    }, RESTART_DAEMON_AFTER);
};
