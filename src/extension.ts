'use strict';

import * as vscode from 'vscode';
import * as express from "express";

import { handleChangeEvent, handleFilesCreated, handleFilesDeleted, handleFilesRenamed, handlePastedFile } from "./event_handler";
import { handleBuffer } from "./buffer_handler";
import { initCodeSync } from "./utils/common";
import { handleRedirect } from "./utils/login_utils";

import { Auth0URLs, NOTIFICATION_CONSTANTS } from './constants';
const app = express();
const port = 8080; // default port to listen

// define a route handler for the default home page
app.get( "/", async (req: any, res: any) => {
	const redirectUri = 'http://localhost:8080';
	await handleRedirect(req, redirectUri);
	res.send( "Successfully Logged in. Check your IDE" );
} );

// start the Express server
app.listen(port, () => {
    console.log( `server started at http://localhost:${ port }` );
});

export function activate(context: vscode.ExtensionContext) {
	// Get the active text editor
	const editor = vscode.window.activeTextEditor;
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;

	if (!repoPath || !repoName || !editor) { return; }
	
	initCodeSync(repoPath);

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
