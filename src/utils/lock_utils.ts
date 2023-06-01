import lockFile, { LockOptions } from 'proper-lockfile';
import { generateSettings } from '../settings';
import { CodeSyncState, CODESYNC_STATES } from './state_utils';
import { CodeSyncLogger } from '../logger';


const onCompromisedPopulateBuffer = (err: any) => {
	CodeSyncLogger.warning(`populateBufferLock compromised, error=${err}`);
	CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
};

const onCompromisedSendDiffs = (err: any) => {
	CodeSyncLogger.warning(`diffsSendLock compromised, error=${err}`);
	CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
};

const onCompromisedPricing = (err: any) => {
	CodeSyncLogger.warning(`pricingLock compromised, error=${err}`);
};

export class LockUtils {
	
	settings: any;
	lockOptionsPopulateBuffer: LockOptions;
	lockOptionsSendDiffs: LockOptions;
	lockOptionsPricing: LockOptions;

	constructor() {
        this.settings = generateSettings();
		this.lockOptionsPopulateBuffer = ((global as any).IS_CODESYNC_TEST_MODE) ? {onCompromised: onCompromisedPopulateBuffer}: {};
		this.lockOptionsSendDiffs = ((global as any).IS_CODESYNC_TEST_MODE) ? {onCompromised: onCompromisedSendDiffs}: {};
		this.lockOptionsPricing = ((global as any).IS_CODESYNC_TEST_MODE) ? {onCompromised: onCompromisedPricing}: {};
	}

	checkPopulateBufferLock () {
		try {
			const isAcquired = lockFile.checkSync(this.settings.POPULATE_BUFFER_LOCK_FILE);
			if (!isAcquired) CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
			return isAcquired;
		} catch (e) {
			CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
			return false;
		}
	}

	checkDiffsSendLock = () => {
		try {
			const isAcquired = lockFile.checkSync(this.settings.DIFFS_SEND_LOCK_FILE);
			if (!isAcquired) CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
			return isAcquired;
		} catch (e) {
			CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
			return false;
		}
	};
	
	acquirePopulateBufferLock = () => {
		try {
			lockFile.lockSync(this.settings.POPULATE_BUFFER_LOCK_FILE, this.lockOptionsPopulateBuffer);
			CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, true);
			const instanceUUID = CodeSyncState.get(CODESYNC_STATES.INSTANCE_UUID);
			CodeSyncLogger.debug(`populateBufferLock acquired by uuid=${instanceUUID}`);			
		} catch (e) {
			CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
			// 
		}    
	};
	
	acquireSendDiffsLock = () => {	
		try {
			lockFile.lockSync(this.settings.DIFFS_SEND_LOCK_FILE, this.lockOptionsSendDiffs);
			CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, true);
			const instanceUUID = CodeSyncState.get(CODESYNC_STATES.INSTANCE_UUID);
			CodeSyncLogger.debug(`DiffsSendLock acquired by uuid=${instanceUUID}`);
		} catch (e) {
			CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
			//
		}
	};

	acquirePricingAlertLock () {
		try {
			lockFile.lockSync(this.settings.UPGRADE_PLAN_ALERT, this.lockOptionsPricing);
		} catch (e) {
			// 
		}
	}

	releasePricingAlertLock () {
		try {
			lockFile.unlockSync(this.settings.UPGRADE_PLAN_ALERT);
		} catch (e) {
			// 
		}
	}

	checkPricingAlertLock () {
		try {
			return lockFile.checkSync(this.settings.UPGRADE_PLAN_ALERT);
		} catch (e) {
			return false;
		}
	}
}
