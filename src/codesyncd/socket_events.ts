import vscode from "vscode";

import {putLogEvent} from "../logger";
import {STATUS_BAR_MSGS} from "../constants";
import {readYML, updateStatusBarItem} from "../utils/common";
import {generateSettings} from "../settings";
import {IRepoDiffs} from "../interface";
import {diffsHandler} from "./diffs_handler";
import {diffHandler} from "./diffHandler";


export class socketEvents {
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

    onConnect() {
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
        const diffsHandlerObj = new diffsHandler(this.repoDiff.file_to_diff,
            this.accessToken, this.repoDiff.repoPath, this.connection);
        await diffsHandlerObj.run();
    }

    onSyncSuccess(diffFilePath: string) {
        diffHandler.removeDiffFile(diffFilePath);
    }

    async onMessage(message: any) {
        if (message.type !== 'utf8') return;
        const resp = JSON.parse(message.utf8Data || "{}");
        if (resp.type === 'auth') {
            if (resp.status !== 200) {
                return this.onInvalidAuth();
            }
            await this.onValidAuth();
        }
        if (resp.type === 'sync') {
            if (resp.status === 200) {
                this.onSyncSuccess(resp.diff_file_path);
            }
        }
    }
}
