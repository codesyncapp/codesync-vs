import vscode from 'vscode';
import { NOTIFICATION, PRICING_URL, RETRY_REQUEST_AFTER } from '../constants';
import { CodeSyncState, CODESYNC_STATES } from "./state_utils";


export const setPlanLimitReached = () => {
	// Return if key is already set
	CodeSyncState.set(CODESYNC_STATES.REQUEST_SENT_AT, new Date().getTime());
	// Set the key to true
	CodeSyncState.set(CODESYNC_STATES.PRICING_PLAN_LIMIT_REACHED, true);
	vscode.commands.executeCommand('setContext', 'upgradePlan', true);
	// Show alert msg
	vscode.window.showErrorMessage(NOTIFICATION.UPGRADE_PLAN, ...[
		NOTIFICATION.UPGRADE
	]).then(async selection => {
		if (selection === NOTIFICATION.UPGRADE) {
			vscode.env.openExternal(vscode.Uri.parse(PRICING_URL));
		}
	});	
};


export const getPlanLimitReached = () => {
	// Return if key is already set
	const planLimitReached = CodeSyncState.get(CODESYNC_STATES.PRICING_PLAN_LIMIT_REACHED);
	const requestSentAt = CodeSyncState.get(CODESYNC_STATES.REQUEST_SENT_AT);
	const canRetry = requestSentAt && (new Date().getTime() - requestSentAt) > RETRY_REQUEST_AFTER;
	return {
		planLimitReached,
		canRetry
	};
};
