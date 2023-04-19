import vscode from "vscode";
import {client} from "websocket";

import {IRepoDiffs} from "../../interface";
import {CodeSyncLogger, logErrorMsg} from "../../logger";
import {recallDaemon} from "../codesyncd";
import {SocketEvents} from "./socket_events";
import {
    CONNECTION_ERROR_MESSAGE,
    SOCKET_CONNECT_ERROR_CODES,
    SOCKET_ERRORS,
    API_ROUTES,
    RETRY_WEBSOCKET_CONNECTION_AFTER
} from "../../constants";
import { getPlanLimitReached } from "../../utils/pricing_utils";
import { CodeSyncState, CODESYNC_STATES } from "../../utils/state_utils";

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
    }

    resetGlobals = () => {
        // Set time when connection is errored out
        CodeSyncState.set(CODESYNC_STATES.WEBSOCKET_ERROR_OCCURRED_AT, new Date().getTime());
        try {
            this.client.abort();
        } catch (e) {
            // Not logging the error
        }
        this.client = null;
        (global as any).client = null;
        (global as any).socketConnection = null;
    }

    connect = (canSendDiffs: boolean) => {
        // Check plan limits
        const { planLimitReached, canRetry } = getPlanLimitReached();
		if (planLimitReached && !canRetry) return recallDaemon(this.statusBarItem);

        const errorOccurredAt = CodeSyncState.get(CODESYNC_STATES.WEBSOCKET_ERROR_OCCURRED_AT);
		const canConnect = !errorOccurredAt || (new Date().getTime() - errorOccurredAt) > RETRY_WEBSOCKET_CONNECTION_AFTER;
		if (!canConnect) return recallDaemon(this.statusBarItem);
        if (!this.client) {
            this.client = new client();
            (global as any).client = this.client;
            this.registerEvents(canSendDiffs);
        } else {
            const socketConnection = (global as any).socketConnection;
            if (!socketConnection) return;
            // Trigger onValidAuth for already connected socket
            const webSocketEvents = new SocketEvents(this.statusBarItem, this.repoDiffs, this.accessToken);
            webSocketEvents.onValidAuth();
        }
    };

    registerEvents = (canSendDiffs: boolean) => {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        this.client.on('connectFailed', function (error: any) {
            that.resetGlobals();
            const errStr = error.toString();
            if (!SOCKET_CONNECT_ERROR_CODES.filter(err => error.code === err).length) {
                console.log(`Socket Connect Failed: ${error.code}, ${errStr}`);
            }
            errorCount = logErrorMsg(CONNECTION_ERROR_MESSAGE, errorCount);
            return recallDaemon(that.statusBarItem, true, true);
        });

        this.client.on('connect', function (connection: any) {
            errorCount = 0;
            that.registerConnectionEvents(connection);
        });

        let url = `${API_ROUTES.DIFFS_WEBSOCKET}&token=${this.accessToken}`;
        if (!canSendDiffs) {
            url += '&auth_only=1';
        }
        this.client.connect(url);
    };

    registerConnectionEvents = (connection: any) => {
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
            that.resetGlobals();
        });

        // Iterate repoDiffs and send to server
        const webSocketEvents = new SocketEvents(this.statusBarItem, this.repoDiffs, this.accessToken);

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
