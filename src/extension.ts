'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import { CONFIG_PATH} from "./constants";
import { handleChangeEvent, handleFilesCreated, handleFilesDeleted, handleFilesRenamed } from "./utils";

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

	// context.subscriptions.push(disposable);
}
