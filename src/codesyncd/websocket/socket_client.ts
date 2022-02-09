import vscode from "vscode";
import {client} from "websocket";

import {IRepoDiffs} from "../../interface";
import {logMsg} from "../../utils/common";
import {recallDaemon} from "../codesyncd";
import {SocketEvents} from "./socket_events";
import {
    CONNECTION_ERROR_MESSAGE,
    SOCKET_CONNECT_ERROR_CODES,
    SOCKET_ERRORS,
    STATUS_BAR_MSGS,
    WEBSOCKET_ENDPOINT
} from "../../constants";
import { statusBarMsgs } from "../utils";

let errorCount = 0;

export class SocketClient {
    client: any;
    statusBarItem: vscode.StatusBarItem;
    accessToken: string;
    repoDiffs: IRepoDiffs[];
    statusBarMsgsHandler: any;

    constructor(statusBarItem: vscode.StatusBarItem, accessToken: string, repoDiffs: IRepoDiffs[]) {
        this.statusBarItem = statusBarItem;
        this.accessToken = accessToken;
        this.repoDiffs = repoDiffs;
        this.client = (global as any).client;
        this.statusBarMsgsHandler = new statusBarMsgs(statusBarItem);
    }

    resetGlobals = () => {
        this.client = null;
        (global as any).client = null;
        (global as any).socketConnection = null;
    }

    connect = () => {
        if (!this.client) {
            this.client = new client();
            (global as any).client = this.client;
            this.registerEvents();
        } else {
            const socketConnection = (global as any).socketConnection;
            if (!socketConnection) return;
            // Trigger onValidAuth for already connected socket
            const webSocketEvents = new SocketEvents(this.statusBarItem, this.repoDiffs, this.accessToken);
            webSocketEvents.onValidAuth();
        }
    };

    registerEvents = () => {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        this.client.on('connectFailed', function (error: any) {
            that.resetGlobals();
            const errStr = error.toString();
            if (!SOCKET_CONNECT_ERROR_CODES.filter(err => error.code === err).length) {
                console.log(`Socket Connect Failed: ${error.code}, ${errStr}`);
            }
            errorCount = logMsg(CONNECTION_ERROR_MESSAGE, errorCount);
            that.statusBarMsgsHandler.update(STATUS_BAR_MSGS.SERVER_DOWN);
            return recallDaemon(that.statusBarItem);
        });

        this.client.on('connect', function (connection: any) {
            errorCount = 0;
            that.registerConnectionEvents(connection);
        });

        this.client.connect(`${WEBSOCKET_ENDPOINT}?token=${this.accessToken}`);
    };

    registerConnectionEvents = (connection: any) => {
        // Set connection in global
        (global as any).socketConnection = connection;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        connection.on('error', function (error: any) {
            const msg = `Socket Connection Error: ${error.code}, ${error.toString()}`;
            if (!SOCKET_CONNECT_ERROR_CODES.filter(err => error.code === err).length) {
                console.log(msg);
            }
            errorCount = logMsg(msg, errorCount);
            that.resetGlobals();
        });

        connection.on('close', function () {
            that.resetGlobals();
        });

        // Iterate repoDiffs and send to server
        const webSocketEvents = new SocketEvents(this.statusBarItem, this.repoDiffs, this.accessToken);

        connection.on('message', function (message: any) {
            try {
                webSocketEvents.onMessage(message);
            } catch (e) {
                errorCount = logMsg(`${SOCKET_ERRORS.ERROR_MSG_RECEIVE}, ${e}`, errorCount);
            }
        });
    };
}
