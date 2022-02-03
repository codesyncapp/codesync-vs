import vscode from "vscode";
import lockFile from 'lockfile';

import { RESTART_DAEMON_AFTER } from "../constants";
import { bufferHandler } from "./handlers/buffer_handler";
import { populateBuffer } from "./populate_buffer";
import { generateSettings } from "../settings";
import { CodeSyncState, CODESYNC_STATES } from "../utils/state_utils";



export const recallDaemon = (statusBarItem: vscode.StatusBarItem, viaDaemon=true) => {
    /*
    There are two types of locks we are using. 
    1- POPULATE_BUFFER_LOCK (Overall across all IDEs)
    2- DIFFS_SEND_LOCK (Per IDE type)
    
    Whenever a lock is acquired, we set following states in global
    1- POPULATE_BUFFER_LOCK_ACQUIRED
    2- DIFFS_SEND_LOCK_ACQUIRED
    respectively 

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
    // Do not run daemon in case of tests
    if ((global as any).IS_CODESYNC_DEV) return;

    const settings = generateSettings();
    const canRunPopulateBuffer = CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED);
    const canRunBufferHandler = CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED);
    // Check Locks availability
    const isPopulateBufferLockAcquired = lockFile.checkSync(settings.POPULATE_BUFFER_LOCK_FILE);
    const isSendingDiffsLockAcquired = lockFile.checkSync(settings.DIFFS_SEND_LOCK_FILE);

    switch (true) {
        case canRunPopulateBuffer && canRunBufferHandler:
            break;
        case canRunPopulateBuffer:
            if (isSendingDiffsLockAcquired) return runPopulateBuffer(statusBarItem, viaDaemon);
            acquireSendDiffsLock();
            break;
        case canRunBufferHandler:
            if (isPopulateBufferLockAcquired) return runBufferHandler(statusBarItem);
            acquirePopulateBufferLock();
            break;
        case !canRunPopulateBuffer && !canRunBufferHandler:
            if (!isPopulateBufferLockAcquired) acquirePopulateBufferLock();
            if (!isSendingDiffsLockAcquired) acquireSendDiffsLock();
            console.log("Recalling Daemon");
            return setTimeout(() => {
                recallDaemon(statusBarItem, viaDaemon);
            }, RESTART_DAEMON_AFTER);
        default:
            break;
    }
    
    return setTimeout(() => {
        populateBuffer(viaDaemon);
        // Buffer Handler
        const handler = new bufferHandler(statusBarItem);
        handler.run();
    }, RESTART_DAEMON_AFTER);
};

const acquirePopulateBufferLock = () => {
    const settings = generateSettings();
    console.log(1, "acquiring Lock");
    lockFile.lockSync(settings.POPULATE_BUFFER_LOCK_FILE);
    CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, true);
};

const acquireSendDiffsLock = () => {
    const settings = generateSettings();
    console.log(2, "acquiring Lock");
    lockFile.lockSync(settings.DIFFS_SEND_LOCK_FILE);
    CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, true);
};

const runBufferHandler = (statusBarItem: vscode.StatusBarItem) => {
    console.log("sending diffs only");
    setTimeout(() => {
        // Buffer Handler
        const handler = new bufferHandler(statusBarItem);
        handler.run();
    }, RESTART_DAEMON_AFTER);
};

const runPopulateBuffer = (statusBarItem: vscode.StatusBarItem, viaDaemon: boolean) => {
    console.log("Populating buffer only");
    setTimeout(() => {
        // Buffer Handler
        populateBuffer(viaDaemon);
        recallDaemon(statusBarItem, viaDaemon);
    }, RESTART_DAEMON_AFTER);
};
