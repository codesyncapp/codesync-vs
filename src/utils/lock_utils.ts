import lockFile, { CheckOptions, LockOptions } from 'proper-lockfile';
import { generateSettings } from '../settings';
import { CodeSyncState, CODESYNC_STATES } from './state_utils';
import { CodeSyncLogger } from '../logger';
import { IGNORE_ACQUIRED_LOCK_TIMEOUT } from '../constants';


export class LockUtils {
	
	settings: any;
	lockOptionsPopulateBuffer: LockOptions;
	lockOptionsDiffsSend: LockOptions;
	lockOptionsPricing: LockOptions;
	checkSyncOptions: CheckOptions;
	instanceUUID: string;

	constructor() {
        this.settings = generateSettings();
		this.lockOptionsPopulateBuffer = {onCompromised: this.onCompromisedPopulateBuffer};
		this.lockOptionsDiffsSend = {onCompromised: this.onCompromisedDiffsSend};
		this.lockOptionsPricing = {onCompromised: this.onCompromisedPricing};
		this.checkSyncOptions = {stale: 15000};
		this.instanceUUID = CodeSyncState.get(CODESYNC_STATES.INSTANCE_UUID);
	}

	onCompromisedPopulateBuffer = (err: any) => {
		CodeSyncLogger.debug(`populateBufferLock compromised, uuid=${this.instanceUUID}, error=${err}`);
		const canIgnore = CodeSyncState.canSkipRun(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED_AT, IGNORE_ACQUIRED_LOCK_TIMEOUT);
		if (canIgnore) return;
		CodeSyncLogger.debug(`populateBufferLock: Resetting state value, uuid=${this.instanceUUID}`);
		CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
	};
	
	onCompromisedDiffsSend = (err: any) => {
		CodeSyncLogger.debug(`diffsSendLock compromised, uuid=${this.instanceUUID}, error=${err}`);
		const canIgnore = CodeSyncState.canSkipRun(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED_AT, IGNORE_ACQUIRED_LOCK_TIMEOUT);
		if (canIgnore) return;
		CodeSyncLogger.debug(`diffsSendLock: Resetting state value, uuid=${this.instanceUUID}`);
		CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
	};
	
	onCompromisedPricing = (err: any) => {
		CodeSyncLogger.debug(`pricingLock compromised, uuid=${this.instanceUUID}, error=${err}`);
	};
	
	checkPopulateBufferLock () {
		try {
			const isAcquired = lockFile.checkSync(this.settings.POPULATE_BUFFER_LOCK_FILE, this.checkSyncOptions);
			if (!isAcquired) CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
			return isAcquired;
		} catch (e) {
			CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
			return false;
		}
	}

	checkDiffsSendLock = () => {
		try {
			const isAcquired = lockFile.checkSync(this.settings.DIFFS_SEND_LOCK_FILE, this.checkSyncOptions);
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
			CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED_AT, new Date().getTime());
			CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, true);
			CodeSyncLogger.debug(`populateBufferLock acquired by uuid=${this.instanceUUID}`);			
		} catch (e) {
			CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
			// 
		}    
	};
	
	acquireSendDiffsLock = () => {	
		try {
			lockFile.lockSync(this.settings.DIFFS_SEND_LOCK_FILE, this.lockOptionsDiffsSend);
			CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED_AT, new Date().getTime());
			CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, true);
			CodeSyncLogger.debug(`DiffsSendLock acquired by uuid=${this.instanceUUID}`);
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
