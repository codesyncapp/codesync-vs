import vscode from "vscode";
import { RESTART_DAEMON_AFTER } from "../constants";
import { bufferHandler } from "./buffer_handler";
import { populateBuffer } from "./populate_buffer";


export const recallDaemon = (statusBarItem: vscode.StatusBarItem) => {
    // Do not run daemon in case of tests
    if ((global as any).IS_CODESYNC_DEV) return;
    // Recall daemon after X seconds
    setTimeout(() => {
        populateBuffer();
        // Buffer Handler
        const handler = new bufferHandler(statusBarItem);
        handler.process();
    }, RESTART_DAEMON_AFTER);
};
