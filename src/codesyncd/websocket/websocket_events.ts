import vscode from "vscode";

import {putLogEvent} from "../../logger";
import {STATUS_BAR_MSGS} from "../../constants";
import {readYML, updateStatusBarItem} from "../../utils/common";
import {generateSettings} from "../../settings";
import {IRepoDiffs, IWebSocketMessage} from "../../interface";
import {DiffsHandler} from "../handlers/diffs_handler";
import {DiffHandler} from "../handlers/diff_handler";


const EVENT_TYPES = {
    AUTH: 'auth',
    SYNC: 'sync'
};

export class WebSocketEvents {
    connection: any;
    statusBarItem: any;
    repoDiff: any;

    accessToken: string;
    configJSON: any;
    configRepo: any;

    constructor(connection: any, statusBarItem: vscode.StatusBarItem, repoDiff: IRepoDiffs) {
        this.connection = connection;
        this.statusBarItem = statusBarItem;
        this.repoDiff = repoDiff;
        const settings = generateSettings();
        const users = readYML(settings.USER_PATH) || {};
        this.configJSON = readYML(settings.CONFIG_PATH);
        this.configRepo = this.configJSON.repos[repoDiff.repoPath];
        this.accessToken = users[this.configRepo.email].access_token;
    }

    authenticate() {
        // authenticate via websocket
        this.connection.send(this.accessToken);
    }

    onInvalidAuth() {
        putLogEvent(STATUS_BAR_MSGS.ERROR_SENDING_DIFF);
        updateStatusBarItem(this.statusBarItem, STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
        return;
    }

    async onValidAuth() {
        // Update status bar msg
        updateStatusBarItem(this.statusBarItem, STATUS_BAR_MSGS.SYNCING);
        const diffsHandler = new DiffsHandler(this.repoDiff.file_to_diff,
            this.accessToken, this.repoDiff.repoPath, this.connection);
        await diffsHandler.run();
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
