'use strict';

import * as vscode from 'vscode';

import { handleChangeEvent, handleFilesCreated, handleFilesDeleted, handleFilesRenamed, handlePastedFile } from "./event_handler";
import { handleBuffer } from "./buffer_handler";
import { initCodeSync } from "./utils/common";


export async function activate(context: vscode.ExtensionContext) {
	// Get the active text editor
	const editor = vscode.window.activeTextEditor;
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;

	if (!repoPath || !repoName || !editor) { return; }
	
	await initCodeSync(repoPath);

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
