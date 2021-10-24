import vscode from "vscode";
import { RESTART_DAEMON_AFTER } from "../constants";
import { bufferHandler } from "./handlers/buffer_handler";
import { populateBuffer } from "./populate_buffer";


export const recallDaemon = (statusBarItem: vscode.StatusBarItem, viaDaemon=true) => {
    // Do not run daemon in case of tests
    if ((global as any).IS_CODESYNC_DEV) return;
    // Recall daemon after X seconds
    setTimeout(() => {
        populateBuffer(viaDaemon);
        // Buffer Handler
        const handler = new bufferHandler(statusBarItem);
        handler.run();
    }, RESTART_DAEMON_AFTER);
};
