export const CODESYNC_STATES = {
    REPO_IS_IN_SYNC: "repoIsInSync",
    USER_EMAIL: "userEmail",
    IS_SUB_DIR: "isSubDir",
    IS_SYNCIGNORED_SUB_DIR: "isSyncIgnored",
	DIFFS_SEND_LOCK_ACQUIRED: "diffsSendLockAcquired",
	POPULATE_BUFFER_LOCK_ACQUIRED: "populateBufferLockAcquired",
    PRICING_PLAN_LIMIT_REACHED: "pricingPlanLimitReache",
    REQUEST_SENT_AT: "requestSentAt"
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
