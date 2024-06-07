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
import { tabEventHandler } from './events/tab_event_handler';


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
			const handler = new tabEventHandler(repoPath);
			handler.handleTabChangeEvent(true);
		}

		// Register tab change event
		vscode.window.tabGroups.onDidChangeTabs(changeEvent => {
			try {
				const isTabEvent = changeEvent.changed.length == 0
				const handler = new tabEventHandler(repoPath);
				handler.handleTabChangeEvent(isTabEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error("Failed handling tabChangeEvent", e.stack);
			}
		})

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
