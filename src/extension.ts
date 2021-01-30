'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as getBranchName from 'current-git-branch';

import { DEFAULT_BRANCH, CONFIG_PATH} from "./constants";
import { handleChangeEvent, handleFilesCreated, handleFilesDeleted, handleFilesRenamed } from "./utils";

export function activate(context: vscode.ExtensionContext) {
	// Get the active text editor
	const editor = vscode.window.activeTextEditor;
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath) { return; }
	const branch = getBranchName({ altPath: repoPath });
	
	if (!repoName || !editor) { return; }

	// TODO: Show some alert to user
	// If config.yml does not exists, return
	const configExists = fs.existsSync(CONFIG_PATH);
	if (!configExists) { return; }
	// Return if user hasn't synced the repo
	try {
		const config = yaml.load(fs.readFileSync(CONFIG_PATH, "utf8"));
		if (!(repoName in config['repos']) || config['repos'][repoName].path !== repoPath) {
			return;
		}
	} catch (e) {
		return;
	}
	
	console.log(`repoPath: ${repoPath}, branchName: ${branch}`);

	vscode.workspace.onDidChangeTextDocument(changeEvent => {
		handleChangeEvent(changeEvent, repoName, repoPath, branch || DEFAULT_BRANCH);
	});
	
	vscode.workspace.onDidCreateFiles(changeEvent => {
		return handleFilesCreated(changeEvent, repoName, repoPath, branch || DEFAULT_BRANCH);
	});

	vscode.workspace.onDidDeleteFiles(changeEvent => {
		handleFilesDeleted(changeEvent, repoName, repoPath, branch || DEFAULT_BRANCH);
	});

	vscode.workspace.onDidRenameFiles(changeEvent => {
		handleFilesRenamed(changeEvent, repoName, repoPath, branch || DEFAULT_BRANCH);
	});

	// context.subscriptions.push(disposable);
}
