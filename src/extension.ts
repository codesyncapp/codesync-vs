'use strict';

import * as vscode from 'vscode';
import { handleChangeEvent, handleFilesCreated, handleFilesDeleted, handleFilesRenamed } from "./utils";
import { RESTART_DAEMON_AFTER } from "./constants";


export function activate(context: vscode.ExtensionContext) {
	// Get the active text editor
	const editor = vscode.window.activeTextEditor;
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;

	if (!repoPath || !repoName || !editor) { return; }
	
	console.log(`Configured repo: ${repoPath}`);

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

	function handleBuffer() {
		try {
			// Daemon functionality will go here
		} catch {
			console.log("Daemon failed");
		}

		// Recall daemon after X seconds
		setTimeout(() => {
			handleBuffer();
		}, RESTART_DAEMON_AFTER);
	}

	handleBuffer();
	// context.subscriptions.push(disposable);
}
