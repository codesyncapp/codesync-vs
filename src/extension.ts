'use strict';

import vscode from 'vscode';
import lockFile from 'lockfile';

import { eventHandler } from "./events/event_handler";
import { setupCodeSync, showConnectRepoView, showLogIn } from "./utils/setup_utils";
import { COMMAND, STATUS_BAR_MSGS } from './constants';

import { logout } from './utils/auth_utils';
import { pathUtils } from "./utils/path_utils";
import { checkSubDir } from "./utils/common";
import { recallDaemon } from "./codesyncd/codesyncd";
import {
	unSyncHandler,
	SignUpHandler,
	SyncHandler,
	trackRepoHandler,
	trackFileHandler,
	openSyncIgnoreHandler
} from './handlers/commands_handler';
import { putLogEvent } from "./logger";
import { generateSettings } from './settings';
import { CodeSyncState, CODESYNC_STATES } from './utils/state_utils';

export async function activate(context: vscode.ExtensionContext) {
	try {
		let repoPath = pathUtils.getRootPath();
		const subDirResult = checkSubDir(repoPath);
		vscode.commands.executeCommand('setContext', 'showLogIn', showLogIn());
		vscode.commands.executeCommand('setContext', 'showConnectRepoView', showConnectRepoView(repoPath));
		vscode.commands.executeCommand('setContext', 'isSubDir', subDirResult.isSubDir);
		vscode.commands.executeCommand('setContext', 'isSyncIgnored', subDirResult.isSyncIgnored);
		vscode.commands.executeCommand('setContext', 'CodeSyncActivated', true);

		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerSignUp, SignUpHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerLogout, logout));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerSync, SyncHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerUnsync, unSyncHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.trackRepo, trackRepoHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.trackFile, trackFileHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.openSyncIgnore, openSyncIgnoreHandler));

		const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		statusBarItem.command = COMMAND.triggerUnsync;
		context.subscriptions.push(statusBarItem);

		await setupCodeSync(repoPath);

		if (repoPath) {
			console.log(`Configured repo: ${repoPath}`);
			if (subDirResult.isSubDir) {
				repoPath = subDirResult.parentRepo;
				console.log(`Parent repo: ${repoPath}`);
			}	
		}

		const watcher = vscode.workspace.createFileSystemWatcher("**/*"); //glob search string

		watcher.onDidCreate((e) => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handlePastedFile(e.fsPath);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				putLogEvent(e.stack);
			}
		});

		vscode.workspace.onDidChangeTextDocument(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleChangeEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				putLogEvent(e.stack);
			}
		});

		vscode.workspace.onDidCreateFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleCreateEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				putLogEvent(e.stack);
			}
		});

		vscode.workspace.onDidDeleteFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleDeleteEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				putLogEvent(e.stack);
			}
		});

		vscode.workspace.onDidRenameFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleRenameEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				putLogEvent(e.stack);
			}
		});

		recallDaemon(statusBarItem, false);
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		putLogEvent(e.stack);
	}
}

export function deactivate(context: vscode.ExtensionContext) {
	const settings = generateSettings();
	// If locks were acquired by current instance, release the locks
	const canRunPopulateBuffer = CodeSyncState.get(CODESYNC_STATES.POPULATE_BUFFER_LOCK_ACQUIRED);
	const canRunBufferHandler = CodeSyncState.get(CODESYNC_STATES.DIFFS_SEND_LOCK_ACQUIRED);
	if (canRunPopulateBuffer) {
		try {
			lockFile.unlockSync(settings.POPULATE_BUFFER_LOCK_FILE);
		} catch (e) {
			// 
		}
	}
	if (canRunBufferHandler) {
		try {
			lockFile.unlockSync(settings.DIFFS_SEND_LOCK_FILE);
		} catch (e) {
			// 
		}
	}
}
