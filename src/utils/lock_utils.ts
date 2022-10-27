import lockFile from 'proper-lockfile';
import { generateSettings } from '../settings';
import { CodeSyncState, CODESYNC_STATES } from './state_utils';

const onCompromised = () => {
	// Do nothing
};

export class LockUtils {
	
	settings: any;

	constructor() {
        this.settings = generateSettings();
	}

	checkPopulateBufferLock () {
		try {
			return lockFile.checkSync(this.settings.POPULATE_BUFFER_LOCK_FILE);
		} catch (e) {
			return false;
		}
	}

	checkDiffsSendLock = () => {
		try {
			return lockFile.checkSync(this.settings.DIFFS_SEND_LOCK_FILE);
		} catch (e) {
			return false;
		}
	};
	
	acquirePopulateBufferLock = () => {
		try {
			lockFile.lockSync(this.settings.POPULATE_BUFFER_LOCK_FILE, {onCompromised: onCompromised});
			CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, true);
		} catch (e) {
			// 
		}    
	};
	
	acquireSendDiffsLock = () => {	
		try {
			lockFile.lockSync(this.settings.DIFFS_SEND_LOCK_FILE, {onCompromised: onCompromised});
			CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, true);
		} catch (e) {
			// 
		}
	};

	acquirePricingAlertLock () {
		try {
			lockFile.lockSync(this.settings.UPGRADE_PLAN_ALERT, {onCompromised: onCompromised});
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
