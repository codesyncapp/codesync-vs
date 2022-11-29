import vscode from "vscode";

import {STATUS_BAR_MSGS} from "../../constants";
import {CodeSyncLogger, logErrorMsg} from "../../logger";
import {IDiffToSend, IRepoDiffs, IWebSocketMessage} from "../../interface";
import {DiffHandler} from "../handlers/diff_handler";
import {recallDaemon} from "../codesyncd";
import {DiffsHandler} from "../handlers/diffs_handler";
import {statusBarMsgs} from "../utils";
import {markUsersInactive} from "../../utils/auth_utils";
import { CodeSyncState, CODESYNC_STATES } from "../../utils/state_utils";
import { getPlanLimitReached, resetPlanLimitReached, setPlanLimitReached } from "../../utils/pricing_utils";
import { ErrorCodes } from "../../utils/common";


const EVENT_TYPES = {
    AUTH: 'auth',
    SYNC: 'sync'
};

let errorCount = 0;

export class SocketEvents {
    connection: any;
    statusBarItem: any;
    repoDiffs: IRepoDiffs[];
    accessToken: string;
    statusBarMsgsHandler: any;

    constructor(statusBarItem: vscode.StatusBarItem, repoDiffs: IRepoDiffs[], accessToken: string) {
        this.connection = (global as any).socketConnection;
        this.statusBarItem = statusBarItem;
        this.repoDiffs = repoDiffs;
        this.accessToken = accessToken;
        this.statusBarMsgsHandler = new statusBarMsgs(statusBarItem);
    }

    onInvalidAuth() {
        errorCount = logErrorMsg(STATUS_BAR_MSGS.AUTH_FAILED_SENDING_DIFF, errorCount);
        this.statusBarMsgsHandler.update(STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
        // Mark user as inactive in user.yml
        markUsersInactive(false);
        return recallDaemon(this.statusBarItem);
    }

    async onRepoSizeLimitReached() {
        CodeSyncLogger.error("Failed sending diff, Repo-Size Limit has been reached");
        await setPlanLimitReached(this.accessToken);
        const canAvailTrial = CodeSyncState.get(CODESYNC_STATES.CAN_AVAIL_TRIAL);
        const msg = canAvailTrial ? STATUS_BAR_MSGS.UPGRADE_PRICING_PLAN_FOR_FREE : STATUS_BAR_MSGS.UPGRADE_PRICING_PLAN;
        this.statusBarMsgsHandler.update(msg);
    }

    async onDiffsLimitReached() {
        CodeSyncLogger.error("Failed sending diff, Limit has been reached");
        await setPlanLimitReached(this.accessToken);
        const canAvailTrial = CodeSyncState.get(CODESYNC_STATES.CAN_AVAIL_TRIAL);
        const msg = canAvailTrial ? STATUS_BAR_MSGS.UPGRADE_PRICING_PLAN_FOR_FREE : STATUS_BAR_MSGS.UPGRADE_PRICING_PLAN;
        this.statusBarMsgsHandler.update(msg);
    }

    async onValidAuth() {
        this.connection.send(JSON.stringify({"auth": 200}));
        const statusBarMsg =  this.statusBarMsgsHandler.getMsg();
        this.statusBarMsgsHandler.update(statusBarMsg);
        const canSendDiffs = CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED);
        if (!canSendDiffs) return recallDaemon(this.statusBarItem);
        // Send diffs
        let validDiffs: IDiffToSend[] = [];
        errorCount = 0;
        for (const repoDiff of this.repoDiffs) {
            const diffsHandler = new DiffsHandler(repoDiff, this.accessToken);
            const diffs = await diffsHandler.run();
            validDiffs = validDiffs.concat(diffs);
        }
        if (validDiffs.length) {
            this.connection.send(JSON.stringify({"diffs": validDiffs}));
        }
        // Recall daemon
        return recallDaemon(this.statusBarItem);
    }

    onSyncSuccess(diffFilePath: string) {
        const { planLimitReached } = getPlanLimitReached();
        if (planLimitReached) resetPlanLimitReached();
        const canSendDiffs = CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED);
        if (!canSendDiffs) return;
        DiffHandler.removeDiffFile(diffFilePath);
    }

    async onMessage(message: IWebSocketMessage) {
        if (!message || message.type !== 'utf8') return false;
        const resp = JSON.parse(message.utf8Data || "{}");
        if (!resp.type) return false;
        switch (resp.type) {
            case EVENT_TYPES.AUTH:
                switch (resp.status) {
                    case 200:
                        await this.onValidAuth();
                        return true;
                    default:
                        this.onInvalidAuth();
                        return true;
                }
            case EVENT_TYPES.SYNC:
                switch (resp.status) {
                    case 200:
                        this.onSyncSuccess(resp.diff_file_path);
                        return true;
                    case ErrorCodes.DIFFS_LIMIT_REACHED:
                        await this.onDiffsLimitReached();
                        return true;    
                    case ErrorCodes.REPO_SIZE_LIMIT_REACHED:
                        await this.onRepoSizeLimitReached(); 
                        return true;    
                    default:
                        return false;
                }
            default:
                return false; 
        }
    }
}
