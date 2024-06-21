import fs from "fs";
import vscode from "vscode";

import {contextVariables, ERROR_SENDING_DIFFS, HttpStatusCodes, STATUS_BAR_MSGS} from "../../constants";
import {CodeSyncLogger, logErrorMsg} from "../../logger";
import {IDiff, IDiffToSend, IRepoDiffs, ITabYML, IWebSocketMessage} from "../../interface";
import {DiffHandler} from "../handlers/diff_handler";
import {DiffsHandler} from "../handlers/diffs_handler";
import {getDiffsBeingProcessed, getTabsBeingProcessed, setDiffsBeingProcessed, setTabsBeingProcessed, statusBarMsgs} from "../utils";
import {markUsersInactive} from "../../utils/auth_utils";
import { CodeSyncState, CODESYNC_STATES } from "../../utils/state_utils";
import { PlanLimitsHandler } from "../../utils/pricing_utils";
import { readYML } from "../../utils/common";
import { RepoPlanLimitsState } from "../../utils/repo_state_utils";
import { UserState } from "../../utils/user_utils";
import { TabsHandler } from "../handlers/tabs_handler";

const EVENT_TYPES = {
    AUTH: 'auth',
    SYNC: 'sync',
    TAB_PROCESSED: "tab_processed"
};

let errorCount = 0;

export class SocketEvents {
    connection: any;
    statusBarItem: any;
    repoDiffs: IRepoDiffs[];
    repoTabs: ITabYML[];
    accessToken: string;
    statusBarMsgsHandler: any;
    canSendSocketData: boolean;

    constructor(
        statusBarItem: vscode.StatusBarItem,
        repoDiffs: IRepoDiffs[],
        accessToken: string,
        canSendSocketData = false,
        repoTabs: ITabYML[],
    ) {
        this.connection = (global as any).socketConnection;
        this.statusBarItem = statusBarItem;
        this.repoDiffs = repoDiffs;
        this.accessToken = accessToken;
        this.statusBarMsgsHandler = new statusBarMsgs(statusBarItem);
        this.canSendSocketData = canSendSocketData;
        this.repoTabs = repoTabs;
    }

    onInvalidAuth() {
        errorCount = logErrorMsg(ERROR_SENDING_DIFFS.AUTH_FAILED_SENDING_DIFF, errorCount);
        this.statusBarMsgsHandler.update(STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
        // Mark user as inactive in user.yml
        markUsersInactive(false);
        CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_RUNNING, false);
        this.connection.close();
    }

    onDeactivatedAccount() {
        errorCount = logErrorMsg(ERROR_SENDING_DIFFS.DEACTIVATED_ACCOUNT_FOUND, errorCount);
        this.statusBarMsgsHandler.update(STATUS_BAR_MSGS.ACCOUNT_DEACTIVATED);
        const userState = new UserState();
        userState.setDeactivated();
        CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_RUNNING, false);
        vscode.commands.executeCommand('setContext', contextVariables.showReactivateAccount, true);
        this.connection.close();
    }

    async onRepoSizeLimitReached(repoId: number) {
        CodeSyncLogger.error(ERROR_SENDING_DIFFS.REPO_SIZE_LIMIT_REACHED);
        const limitsHandler = new PlanLimitsHandler(this.accessToken, repoId);
        await limitsHandler.run();
        if (!limitsHandler.isCurrentRepo) return;
        const canAvailTrial = CodeSyncState.get(CODESYNC_STATES.CAN_AVAIL_TRIAL);
        const msg = canAvailTrial ? STATUS_BAR_MSGS.UPGRADE_PRICING_PLAN_FOR_FREE : STATUS_BAR_MSGS.UPGRADE_PRICING_PLAN;
        this.statusBarMsgsHandler.update(msg);
    }

    async onValidAuth() {
        this.connection.send(JSON.stringify({"auth": 200}));
        const userState = new UserState();
        userState.setValidAccount();
        const statusBarMsg = this.statusBarMsgsHandler.getMsg();
        this.statusBarMsgsHandler.update(statusBarMsg);
        if (!this.canSendSocketData) return CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_RUNNING, false);
        // Send diffs
        let validDiffs: IDiffToSend[] = [];
        errorCount = 0;
        for (const repoDiff of this.repoDiffs) {
            const diffsHandler = new DiffsHandler(repoDiff, this.accessToken);
            const diffs = await diffsHandler.run();
            validDiffs = validDiffs.concat(diffs);
        }
        
        if (validDiffs.length) {
            CodeSyncLogger.debug(`Sending ${validDiffs.length} diffs`);
            // Keep track of diffs in State
            const currentDiffs = new Set(validDiffs.map(validDiff => validDiff.diff_file_path));
            let diffsBeingProcessed = getDiffsBeingProcessed();   
            if (diffsBeingProcessed.size) {
                diffsBeingProcessed =  new Set([...diffsBeingProcessed, ...currentDiffs]);
                setDiffsBeingProcessed(diffsBeingProcessed);
            } else {
                setDiffsBeingProcessed(currentDiffs);
            }
            this.connection.send(JSON.stringify({"diffs": validDiffs}));
        }

        // Send tabs
        let validTabs: ITabYML[] = [];
        errorCount = 0;
        console.log(`this.repoTabs: ${JSON.stringify(this.repoTabs)}`);
   
            console.log(`repoTab: ${JSON.stringify(this.repoTabs)}`);
            const tabsHandler = new TabsHandler(this.repoTabs, this.accessToken);
            const validTabsData = await tabsHandler.run();
            if (!validTabsData) return;
            validTabs = validTabs.concat(validTabsData);
            

        if (validTabs.length) {
            CodeSyncLogger.debug(`Sending ${validTabs.length} tabs`);
            const tabs_handler = new TabsHandler(this.repoTabs, this.accessToken);
            tabs_handler.sendTabsToServer(this.connection, validTabs)
        }
        CodeSyncState.set(CODESYNC_STATES.BUFFER_HANDLER_RUNNING, false);
    }

    onSyncSuccess(diffFilePath: string) {
        if (!this.canSendSocketData) return;
        if (!fs.existsSync(diffFilePath)) return;
        // Reset Plan Limits
        const diffData = <IDiff>readYML(diffFilePath);
        const repoLimitsState = new RepoPlanLimitsState(diffData.repo_path);
        repoLimitsState.reset();
        DiffHandler.removeDiffFile(diffFilePath);
        // Remove diff from diffsBeingProcessed
        const diffsBeingProcessed = getDiffsBeingProcessed();
        if (!diffsBeingProcessed.size) return;
        diffsBeingProcessed.delete(diffFilePath);
        setDiffsBeingProcessed(diffsBeingProcessed);
    }

    async onTabProcessed(tabFilePath: string) {
        // Remove tab from tabsBeingProcessed
        const tabsBeingProcessed = getTabsBeingProcessed();
        if (!tabsBeingProcessed.size) return;
        tabsBeingProcessed.delete(tabFilePath);
        setTabsBeingProcessed(tabsBeingProcessed);
    }

    async onPaymentRequired() {
        const canAvailTrial = CodeSyncState.get(CODESYNC_STATES.CAN_AVAIL_TRIAL);
        const msg = canAvailTrial ? STATUS_BAR_MSGS.UPGRADE_PRICING_PLAN_FOR_FREE : STATUS_BAR_MSGS.UPGRADE_PRICING_PLAN;
        this.statusBarMsgsHandler.update(msg);
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
                    case HttpStatusCodes.USER_ACCOUNT_DEACTIVATED:
                        this.onDeactivatedAccount();
                        return true;    
                    default:
                        this.onInvalidAuth();
                        return true;
                }
            case EVENT_TYPES.SYNC:
                switch (resp.status) {
                    case HttpStatusCodes.OK:
                        this.onSyncSuccess(resp.diff_file_path);
                        return true;
                    case HttpStatusCodes.PAYMENT_REQUIRED:
                        await this.onRepoSizeLimitReached(resp.repo_id); 
                        return true;    
                    default:
                        return false;
                }
            case EVENT_TYPES.TAB_PROCESSED:
                switch (resp.status) {
                    case HttpStatusCodes.OK:
                        this.onTabProcessed(resp.tab_path);
                        return true;
                    case HttpStatusCodes.PAYMENT_REQUIRED:
                        this.onPaymentRequired();
                        return true;
                    case HttpStatusCodes.INVALID_USAGE:
                        this.onTabProcessed(resp.tab_path);
                        return true;
                    case HttpStatusCodes.FORBIDDEN:
                        this.onTabProcessed(resp.tab_path);
                        return true;
                    default:
                        return false;
                }
            default:
                return false; 
        }
    }
}
