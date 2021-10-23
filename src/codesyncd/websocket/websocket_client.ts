import vscode from "vscode";
import {client} from "websocket";

import {putLogEvent} from "../../logger";
import {IRepoDiffs} from "../../interface";
import {WEBSOCKET_ENDPOINT} from "../../constants";
import {WebSocketEvents} from "./websocket_events";

export class WebSocketClient {
    client: any;
    statusBarItem: vscode.StatusBarItem;
    repoDiff: IRepoDiffs;

    constructor(statusBarItem: vscode.StatusBarItem, repoDiff: IRepoDiffs) {
        this.client = new client();
        this.client.connect(WEBSOCKET_ENDPOINT);
        this.statusBarItem = statusBarItem;
        this.repoDiff = repoDiff;
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
    };

    registerConnectionEvents = (connection: any) => {
        connection.on('error', function (error: any) {
            putLogEvent("Socket Connection Error: " + error.toString());
        });

        connection.on('close', function () {
            putLogEvent('echo-protocol Connection Closed');
        });

        const webSocketEvents = new WebSocketEvents(connection, this.statusBarItem, this.repoDiff);
        webSocketEvents.authenticate();

        connection.on('message', function (message: any) {
            webSocketEvents.onMessage(message);
        });
    };
}
