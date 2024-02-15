import lockFile, { CheckOptions, LockOptions } from 'proper-lockfile';
import { generateSettings } from '../settings';
import { CodeSyncState, CODESYNC_STATES } from './state_utils';
import { CodeSyncLogger } from '../logger';
import { IGNORE_ACQUIRED_LOCK_TIMEOUT } from '../constants';


export class LockUtils {
	
	isTestMode: boolean;
	settings: any;
	lockOptionsPopulateBuffer: LockOptions;
	lockOptionsDiffsSend: LockOptions;
	checkSyncOptions: CheckOptions;
	instanceUUID: string;

	constructor() {
		this.isTestMode = ((global as any).IS_CODESYNC_TEST_MODE);
        this.settings = generateSettings();
		this.lockOptionsPopulateBuffer = {update:1000, onCompromised: this.onCompromisedPopulateBuffer};
		this.lockOptionsDiffsSend = {update:1000, onCompromised: this.onCompromisedDiffsSend};
		this.checkSyncOptions = {stale: 10000};
		this.instanceUUID = CodeSyncState.get(CODESYNC_STATES.INSTANCE_UUID);
	}

	onCompromisedPopulateBuffer = (err: any) => {
		if (this.isTestMode) return;
		CodeSyncLogger.debug(`populateBufferLock compromised, uuid=${this.instanceUUID}, error=${err}`);
		const canIgnore = CodeSyncState.canSkipRun(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED_AT, IGNORE_ACQUIRED_LOCK_TIMEOUT);
		if (canIgnore) return;
		CodeSyncLogger.debug(`populateBufferLock: Resetting state value, uuid=${this.instanceUUID}`);
		CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
	};
	
	onCompromisedDiffsSend = (err: any) => {
		if (this.isTestMode) return;
		CodeSyncLogger.debug(`diffsSendLock compromised, uuid=${this.instanceUUID}, error=${err}`);
		const canIgnore = CodeSyncState.canSkipRun(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED_AT, IGNORE_ACQUIRED_LOCK_TIMEOUT);
		if (canIgnore) return;
		CodeSyncLogger.debug(`diffsSendLock: Resetting state value, uuid=${this.instanceUUID}`);
		CodeSyncState.set(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED, false);
	};
	
	checkPopulateBufferLock () {
		try {
			return lockFile.checkSync(this.settings.POPULATE_BUFFER_LOCK_FILE, this.checkSyncOptions);
		} catch (e) {
			CodeSyncState.set(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED, false);
			return false;
		}
	}

	checkDiffsSendLock = () => {
		try {
			return lockFile.checkSync(this.settings.DIFFS_SEND_LOCK_FILE, this.checkSyncOptions);
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
		}
	};
}
