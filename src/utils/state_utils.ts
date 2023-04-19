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
    WEBSOCKET_ERROR_OCCURRED_AT: "websocketErrorOccurredAt"
};

export class CodeSyncState {

    static set = (key: string, value: string|boolean|number) => {
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
}
