import vscode from "vscode";

import {putLogEvent} from "../../logger";
import {CONNECTION_ERROR_MESSAGE, LOG_AFTER_X_TIMES, STATUS_BAR_MSGS} from "../../constants";
import {updateStatusBarItem} from "../../utils/common";
import {IRepoDiffs, IWebSocketMessage} from "../../interface";
import {DiffsHandler} from "../handlers/diffs_handler";
import {DiffHandler} from "../handlers/diff_handler";
import {recallDaemon} from "../codesyncd";


const EVENT_TYPES = {
    AUTH: 'auth',
    SYNC: 'sync'
};

let errorCount = 0;

export class SocketEvents {
    connection: any;
    statusBarItem: any;
    repoDiffs: IRepoDiffs[]
    accessToken: string;

    constructor(statusBarItem: vscode.StatusBarItem, repoDiffs: IRepoDiffs[], accessToken: string) {
        this.connection = (global as any).socketConnection;
        this.statusBarItem = statusBarItem;
        this.repoDiffs = repoDiffs;
        this.accessToken = accessToken;
    }

    onInvalidAuth() {
        if (errorCount == 0 || errorCount > LOG_AFTER_X_TIMES) {
            putLogEvent(STATUS_BAR_MSGS.ERROR_SENDING_DIFF);
        }
        if (errorCount > LOG_AFTER_X_TIMES) {
            errorCount = 0;
        }
        errorCount += 1;
        updateStatusBarItem(this.statusBarItem, STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
        return recallDaemon(this.statusBarItem);
    }

    async onValidAuth() {
        errorCount = 0;
        // Update status bar msg
        updateStatusBarItem(this.statusBarItem, STATUS_BAR_MSGS.SYNCING);
        for (const repoDiff of this.repoDiffs) {
            const diffsHandler = new DiffsHandler(repoDiff, this.accessToken, this.connection);
            await diffsHandler.run();
        }
        return recallDaemon(this.statusBarItem);
    }

    onSyncSuccess(diffFilePath: string) {
        // Update status bar msg
        updateStatusBarItem(this.statusBarItem, STATUS_BAR_MSGS.SYNCING);
        DiffHandler.removeDiffFile(diffFilePath);
    }

    async onMessage(message: IWebSocketMessage) {
        if (message.type !== 'utf8') return false;
        const resp = JSON.parse(message.utf8Data || "{}");
        if (!resp.type) return false;
        if (resp.type === EVENT_TYPES.AUTH) {
            if (resp.status !== 200) {
                this.onInvalidAuth();
                return true;
            }
            await this.onValidAuth();
            return true;
        }
        if (resp.type === EVENT_TYPES.SYNC) {
            if (resp.status === 200) {
                this.onSyncSuccess(resp.diff_file_path);
                return true;
            }
        }
        return false;
    }
}
