'use strict';

import vscode from 'vscode';

import { eventHandler } from "./events/event_handler";
import { setupCodeSync, showConnectRepoView, showLogIn } from "./utils/setup_utils";
import { COMMAND, STATUS_BAR_MSGS } from './constants';

import { logout } from './utils/auth_utils';
import { pathUtils } from "./utils/path_utils";
import { updateStatusBarItem } from "./utils/common";
import { recallDaemon } from "./codesyncd/codesyncd";
import {
	unSyncHandler,
	SignUpHandler,
	SyncHandler,
	trackRepoHandler,
	trackFileHandler
} from './handlers/commands_handler';


export async function activate(context: vscode.ExtensionContext) {
	const repoPath = pathUtils.getRootPath() || "";

	vscode.commands.executeCommand('setContext', 'showLogIn', showLogIn());
	vscode.commands.executeCommand('setContext', 'showConnectRepoView', showConnectRepoView(repoPath));
	vscode.commands.executeCommand('setContext', 'CodeSyncActivated', true);

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerSignUp, SignUpHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerLogout, logout));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerSync, SyncHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerUnsync, unSyncHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.trackRepo, trackRepoHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.trackFile, trackFileHandler));

	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.command = COMMAND.triggerUnsync;
	context.subscriptions.push(statusBarItem);

	await setupCodeSync(repoPath);

	if (repoPath) {
		console.log(`Configured repo: ${repoPath}`);
	}

	const watcher = vscode.workspace.createFileSystemWatcher("**/*"); //glob search string

	watcher.onDidCreate((e) => {
		const handler = new eventHandler();
		handler.handlePastedFile(e.fsPath);
	});

	vscode.workspace.onDidChangeTextDocument(changeEvent => {
		const handler = new eventHandler();
		handler.handleChangeEvent(changeEvent);
	});

	vscode.workspace.onDidCreateFiles(changeEvent => {
		const handler = new eventHandler();
		handler.handleCreateEvent(changeEvent);
	});

	vscode.workspace.onDidDeleteFiles(changeEvent => {
		const handler = new eventHandler();
		handler.handleDeleteEvent(changeEvent);
	});

	vscode.workspace.onDidRenameFiles(changeEvent => {
		const handler = new eventHandler();
		handler.handleRenameEvent(changeEvent);
	});

	updateStatusBarItem(statusBarItem, STATUS_BAR_MSGS.GETTING_READY);

	// Do not run daemon in case of tests
	if ((global as any).IS_CODESYNC_DEV) return;
	recallDaemon(statusBarItem, false);
}

export function deactivate(context: vscode.ExtensionContext) {
	// pass 
}
