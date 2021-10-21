import vscode from "vscode";
import { RESTART_DAEMON_AFTER } from "../constants";
import { handleBuffer } from "./buffer_handler";
import { populateBuffer } from "./populate_buffer";


export const recallDaemon = (statusBarItem: vscode.StatusBarItem) => {
    // Recall daemon after X seconds
    setTimeout(() => {
        populateBuffer(true);
        handleBuffer(statusBarItem);
    }, RESTART_DAEMON_AFTER);
};
