import vscode from "vscode";

import {putLogEvent} from "../../logger";
import {STATUS_BAR_MSGS} from "../../constants";
import {updateStatusBarItem} from "../../utils/common";
import {IRepoDiffs, IWebSocketMessage} from "../../interface";
import {DiffsHandler} from "../handlers/diffs_handler";
import {DiffHandler} from "../handlers/diff_handler";
import {recallDaemon} from "../codesyncd";


const EVENT_TYPES = {
    AUTH: 'auth',
    SYNC: 'sync'
};

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
        putLogEvent(STATUS_BAR_MSGS.ERROR_SENDING_DIFF);
        updateStatusBarItem(this.statusBarItem, STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
        return;
    }

    async onValidAuth() {
        // Update status bar msg
        updateStatusBarItem(this.statusBarItem, STATUS_BAR_MSGS.SYNCING);
        for (const repoDiff of this.repoDiffs) {
            const diffsHandler = new DiffsHandler(repoDiff, this.accessToken, this.connection);
            await diffsHandler.run();
        }
        console.log("Recalling daemon", Date.now());
        return recallDaemon(this.statusBarItem);
    }

    onSyncSuccess(diffFilePath: string) {
        // Update status bar msg
        updateStatusBarItem(this.statusBarItem, STATUS_BAR_MSGS.SYNCING);
        DiffHandler.removeDiffFile(diffFilePath);
        console.log("SyncSuccess @: ", Date.now());
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
