import vscode from "vscode";
import {client} from "websocket";

import {IRepoDiffs, ITabYML} from "../../interface";
import {CodeSyncLogger, logErrorMsg} from "../../logger";
import {SocketEvents} from "./socket_events";
import {
    CONNECTION_ERROR_MESSAGE,
    SOCKET_CONNECT_ERROR_CODES,
    SOCKET_ERRORS,
    API_ROUTES,
    STATUS_BAR_MSGS
} from "../../constants";
import { CodeSyncState, CODESYNC_STATES } from "../../utils/state_utils";
import { setDiffsBeingProcessed, setTabsBeingProcessed } from "../utils";


let errorCount = 0;

export class SocketClient {
    websocketClient: any;
    statusBarItem: vscode.StatusBarItem;
    accessToken: string;
    repoDiffs: IRepoDiffs[];
    repoTabs: ITabYML[];

    constructor(statusBarItem: vscode.StatusBarItem, accessToken: string, repoDiffs: IRepoDiffs[], repoTabs: ITabYML[]) {
        this.statusBarItem = statusBarItem;
        this.accessToken = accessToken;
        this.repoDiffs = repoDiffs;
        this.websocketClient = (global as any).websocketClient;
        this.repoTabs = repoTabs;
    }

    resetGlobals = () => {
        // Set time when connection is errored out
        CodeSyncState.set(CODESYNC_STATES.WEBSOCKET_ERROR_OCCURRED_AT, new Date().getTime());
        // Reset diffsBeingProcessed
        setDiffsBeingProcessed(new Set());
        // Reset tabsBeingProcessed
        setTabsBeingProcessed(new Set());
        try {
            this.websocketClient.abort();
        } catch (e) {
            // Not logging the error
        }
        this.websocketClient = null;
        (global as any).websocketClient = null;
        (global as any).socketConnection = null;
        return CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_RUNNING, false);
    }

    connect = (canSendSocketData: boolean) => {
        if (!this.websocketClient) {
            this.websocketClient = new client();
            (global as any).websocketClient = this.websocketClient;
            this.registerEvents(canSendSocketData);
        } else {
            const socketConnection = (global as any).socketConnection;
            if (!socketConnection) return this.resetGlobals();
            // Trigger onValidAuth for already connected socket
            const webSocketEvents = new SocketEvents(this.statusBarItem, this.repoDiffs, this.accessToken, canSendSocketData, this.repoTabs);
            webSocketEvents.onValidAuth();
        }
    };

    registerEvents = (canSendDiffs: boolean) => {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        this.websocketClient.on('connectFailed', function (error: any) {
            const errStr = error.toString();
            if (!SOCKET_CONNECT_ERROR_CODES.filter(err => error.code === err).length) {
                console.log(`Socket Connect Failed: ${error.code}, ${errStr}`);
            }
            CodeSyncState.set(CODESYNC_STATES.DAEMON_ERROR, STATUS_BAR_MSGS.SERVER_DOWN);
            errorCount = logErrorMsg(CONNECTION_ERROR_MESSAGE, errorCount);
            return that.resetGlobals();
        });

        this.websocketClient.on('connect', function (connection: any) {
            CodeSyncState.set(CODESYNC_STATES.DAEMON_ERROR, "");
            CodeSyncState.set(CODESYNC_STATES.SOCKET_CONNECTED_AT, new Date().getTime());
            errorCount = 0;
            that.registerConnectionEvents(connection, canSendDiffs);
        });

        let url = `${API_ROUTES.DIFFS_WEBSOCKET}&token=${this.accessToken}`;
        if (!canSendDiffs) {
            url += '&auth_only=1';
        }
        console.log(`Socket Connecting... canSendDiffs=${canSendDiffs}`, );
        this.websocketClient.connect(url);
    };

    registerConnectionEvents = (connection: any, canSendDiffs: boolean) => {
        // Set connection in global
        (global as any).socketConnection = connection;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        connection.on('error', function (error: any) {
            const msg = `Socket Connection Error: ${error.code}, ${error.toString()}`;
            if (!SOCKET_CONNECT_ERROR_CODES.filter(err => error.code === err).length) {
                errorCount = logErrorMsg(msg, errorCount);
            }
            that.resetGlobals();
        });

        connection.on('close', function () {
            console.log("Socket closed");
            that.resetGlobals();
        });

        // Iterate repoDiffs and send to server
        const webSocketEvents = new SocketEvents(this.statusBarItem, this.repoDiffs, this.accessToken, canSendDiffs, this.repoTabs);

        connection.on('message', function (message: any) {
            try {
                webSocketEvents.onMessage(message);
            } catch (e) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                CodeSyncLogger.critical(SOCKET_ERRORS.ERROR_MSG_RECEIVE, e.stack);
            }
        });
    };
}
