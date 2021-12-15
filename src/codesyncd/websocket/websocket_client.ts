import vscode from "vscode";
import {client} from "websocket";

import {putLogEvent} from "../../logger";
import {IRepoDiffs} from "../../interface";
import {WEBSOCKET_ENDPOINT} from "../../constants";
import {WebSocketEvents} from "./websocket_events";
import { readYML } from "../../utils/common";
import {generateSettings} from "../../settings";

export class WebSocketClient {
    client: any;
    statusBarItem: vscode.StatusBarItem;
    repoDiff: IRepoDiffs;
    accessToken: string;

    constructor(statusBarItem: vscode.StatusBarItem, repoDiff: IRepoDiffs) {
        const settings = generateSettings();
        const users = readYML(settings.USER_PATH) || {};
        const configJSON = readYML(settings.CONFIG_PATH);
        const configRepo = configJSON.repos[repoDiff.repoPath];
        this.accessToken = users[configRepo.email].access_token;
        this.statusBarItem = statusBarItem;
        this.repoDiff = repoDiff;
        this.client = new client();
    }

    registerEvents = () => {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;
        this.client.on('connectFailed', function (error: any) {
            putLogEvent('Socket Connect Error: ' + error.toString());
        });

        this.client.on('connect', function (connection: any) {
            that.registerConnectionEvents(connection);
        });

        this.client.connect(`${WEBSOCKET_ENDPOINT}?token=${this.accessToken}`);
    };

    registerConnectionEvents = (connection: any) => {

        connection.on('error', function (error: any) {
            putLogEvent("Socket Connection Error: " + error.toString());
        });

        connection.on('close', function () {
            console.log('echo-protocol Connection Closed');
        });

        const webSocketEvents = new WebSocketEvents(connection, this.statusBarItem, this.repoDiff);

        connection.on('message', function (message: any) {
            webSocketEvents.onMessage(message);
        });
    };
}
