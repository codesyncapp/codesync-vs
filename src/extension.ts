'use strict';

import * as vscode from 'vscode';

import { handleChangeEvent, handleFilesCreated, handleFilesDeleted, handleFilesRenamed, handlePastedFile } from "./event_handler";
import { handleBuffer } from "./buffer_handler";
import { setupCodeSync, showConnectRepoView, showLogIn } from "./utils/setup_utils";
import { COMMAND } from './constants';
import { unSyncHandler, SignUpHandler, SyncHandler } from './commands_handler';
    

export async function activate(context: vscode.ExtensionContext) {
	// Get the active text editor
	const editor = vscode.window.activeTextEditor;
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath || !repoName || !editor) { return; }

	vscode.commands.executeCommand('setContext', 'showLogIn', showLogIn());
	vscode.commands.executeCommand('setContext', 'showConnectRepoView', showConnectRepoView(repoPath));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerSignUp, SignUpHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerSync, SyncHandler));
	context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerUnsync, unSyncHandler));

	await setupCodeSync(repoPath);

	console.log(`Configured repo: ${repoPath}`);

	const watcher = vscode.workspace.createFileSystemWatcher("**/*"); //glob search string

	watcher.onDidCreate((e) => {
		handlePastedFile(e.path);
	});

	vscode.workspace.onDidChangeTextDocument(changeEvent => {
		handleChangeEvent(changeEvent);
	});
	
	vscode.workspace.onDidCreateFiles(changeEvent => {
		handleFilesCreated(changeEvent);
	});

	vscode.workspace.onDidDeleteFiles(changeEvent => {
		handleFilesDeleted(changeEvent);
	});

	vscode.workspace.onDidRenameFiles(changeEvent => {
		handleFilesRenamed(changeEvent);
	});

	handleBuffer();
		
}
