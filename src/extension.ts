'use strict';

import vscode from 'vscode';

import { eventHandler } from "./events/event_handler";
import {
	createStatusBarItem,
	registerCommands,
	registerGitListener,
	setInitialContext,
	setupCodeSync,
	uuidv4
} from "./utils/setup_utils";
import { pathUtils } from "./utils/path_utils";
import { recallDaemon } from "./codesyncd/codesyncd";
import { CodeSyncLogger } from "./logger";
import { CODESYNC_STATES, CodeSyncState } from './utils/state_utils';
import { RepoState } from './utils/repo_state_utils';
import { captureTabs } from './utils/tab_utils';
import { BRANCH_SYNC_TIMEOUT } from './constants';

export async function activate(context: vscode.ExtensionContext) {
	const uuid = uuidv4();
	CodeSyncState.set(CODESYNC_STATES.INSTANCE_UUID, uuid);

	try {
		let repoPath = pathUtils.getRootPath();
		await setupCodeSync(repoPath);
		await registerGitListener(repoPath);
		// vscode.commands.executeCommand
		setInitialContext();
		// vscode.commands.registerCommand
		registerCommands(context);
		// Create status bar item
		const statusBarItem = createStatusBarItem(context);
		if (repoPath) {
			CodeSyncLogger.info(`Configured repo: ${repoPath}, uuid=${uuid}`);
			if (RepoState.isSubDir()) {
				repoPath = RepoState.getParentRepo();
				CodeSyncLogger.debug(`Parent repo: ${repoPath}`);
			}
			// Capturing initial tabs
			captureTabs(repoPath);
		}

		// Register workspace events
		vscode.workspace.onDidChangeTextDocument(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleChangeEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error("Failed handling changeEvent", e.stack);
			}
		});

		vscode.workspace.onDidCreateFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleCreateEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error("Failed handling createEvent", e.stack);
			}
		});

		vscode.workspace.onDidDeleteFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleDeleteEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error("Failed handling deleteEvent", e.stack);
			}
		});

		vscode.workspace.onDidRenameFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleRenameEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error("Failed handling renameEvent", e.stack);
			}
		});

		// Register tab change event
		vscode.window.tabGroups.onDidChangeTabs(changeEvent => {
			// Return if any branch is being synced
			const isBranchSyncInProcess = CodeSyncState.canSkipRun(CODESYNC_STATES.IS_SYNCING_BRANCH, BRANCH_SYNC_TIMEOUT);
			if (isBranchSyncInProcess) return false;
			try {
				let fileChanged = false;
				if (changeEvent.changed.length > 0) {
					const oldPath = CodeSyncState.get(CODESYNC_STATES.ACTIVE_TAB_PATH);
					if  (!changeEvent.changed[0]?.input) return 
					// @ts-ignore
					const filePath = changeEvent.changed[0]?.input?.uri.path;
					if (filePath !== oldPath) {
						fileChanged = true;
						CodeSyncState.set(CODESYNC_STATES.ACTIVE_TAB_PATH, filePath);
					}
				}
				const isTabEvent = fileChanged || changeEvent.opened.length > 0 || changeEvent.closed.length > 0;
				captureTabs(repoPath, isTabEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error("Failed handling tabChangeEvent", e.stack);
			}
		});

		// Do not run daemon in case of tests
		if ((global as any).IS_CODESYNC_TEST_MODE) return;
		recallDaemon(statusBarItem, false);
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		CodeSyncLogger.critical("Failed to activate extension", e.stack);
	}
	CodeSyncLogger.info(`activated, uuid=${uuid}`);
}

export function deactivate(context: vscode.ExtensionContext) {
	CodeSyncLogger.info("deactivated...");
}
