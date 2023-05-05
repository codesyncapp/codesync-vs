export const CODESYNC_STATES = {
    REPO_IS_IN_SYNC: "repoIsInSync",
    USER_EMAIL: "userEmail",
    IS_SUB_DIR: "isSubDir",
    IS_SYNCIGNORED_SUB_DIR: "isSyncIgnored",
	DIFFS_SEND_LOCK_ACQUIRED: "diffsSendLockAcquired",
	POPULATE_BUFFER_LOCK_ACQUIRED: "populateBufferLockAcquired",
    PRICING_URL: "pricingUrl",
    REQUEST_SENT_AT: "requestSentAt",
    SYNCING_BRANCH: "syncingBranch",
    TEAM_ACTIVITY_REQUEST_SENT_AT: "teamActivtyRequestSentAt",
    CAN_AVAIL_TRIAL: "canAvailTrial",
    STATUS_BAR_ACTIVITY_ALERT_MSG: "statusBarActivityAlertMsg",
    WEBSOCKET_ERROR_OCCURRED_AT: "websocketErrorOccurredAt",
    DIFFS_BEING_PROCESSED: "diffsBeingProcessed"
};

export class CodeSyncState {

    static set = (key: string, value: string|boolean|number|Set<string>) => {
        if (!(global as any).codeSyncState) {
            (global as any).codeSyncState = {};
        }    
        (global as any).codeSyncState[key] = value;
    }

    static get = (key: string) => {
        if (!(global as any).codeSyncState || !(global as any).codeSyncState[key]) {
            return false;
        }
        return (global as any).codeSyncState[key];
    }

    static canSkipRun = (key: string, compareWith: number) => {
        const lastRanAt = CodeSyncState.get(key);
        const skipRun = lastRanAt && (new Date().getTime() - lastRanAt) < compareWith;
        return skipRun;
    }
}
