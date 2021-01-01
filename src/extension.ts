'use strict';

import * as vscode from 'vscode';
import * as FS from 'fs';
import * as yaml from 'js-yaml';

import { diff_match_patch } from 'diff-match-patch';
import * as getBranchName from 'current-git-branch';
import * as dateFormat from "dateformat";

// TODO: Move to separate file
const CODESYNC_ROOT = '/usr/local/bin/.codesync';
const CODESYNC_BUFFER = `${CODESYNC_ROOT}/buffer.yml`;
const DIFFS_REPO = `${CODESYNC_ROOT}/.diffs`;

// TODO: Move to separate file
interface IBuffer {
	data: IDiff[]
}

interface IDiff {
	repo: string;
	branch: string;
	file: string;
	created_at: string;
	diff: string;
	is_binary?: boolean;
	is_rename?: boolean;
}

export function activate(context: vscode.ExtensionContext) {
	// Get the active text editor
	const editor = vscode.window.activeTextEditor;
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;
	const branch = getBranchName({ altPath: repoPath });
	
	if (!branch || !repoName || !editor) { return; }
	
	console.log(`repoPath: ${repoPath}, branchName: ${branch}`);
	vscode.workspace.onDidChangeTextDocument(changeEvent => {
		if (!changeEvent.contentChanges.length) { return; }
		// If you only care about changes to the active editor's text,
		//  just check to see if changeEvent.document matches the active editor's document.
		const filePath = changeEvent.document.fileName;
		const text = changeEvent.document.getText();
		if (!repoPath) { return; }
		const relPath = filePath.split(`${repoPath}/`)[1];
		const shadowPath = `${CODESYNC_ROOT}/${repoName}/${branch}/${relPath}`;
		const shadowExists = FS.existsSync(shadowPath);
		if (!shadowExists) { 
			// TODO: Create shadow file?
			return;
		}
		// Read shadow file 
		const shadowText = FS.readFileSync(shadowPath, "utf8");
		// Update shadow file 
		FS.writeFile(shadowPath, text, function (err) {
			if (err) throw err;
		});
		// Compute diffs
		const dmp = new diff_match_patch();
		const patches = dmp.patch_make(shadowText, text);
		//  Create text representation of patches objects
		const diffs = dmp.patch_toText(patches);
		// Skip empty diffs
		if (!diffs) { return; }
		// Add new diff in the buffer
		const newDiff = <IDiff>{};
		newDiff.repo = repoName;
		newDiff.branch = branch;
		newDiff.file = relPath;
		newDiff.diff = diffs;
		newDiff.created_at = dateFormat(new Date(), 'UTC:yyyy-mm-dd HH:MM:ss.l');
		// Append new diff in the buffer
		FS.writeFileSync(`${DIFFS_REPO}/${new Date().getTime()}.yml`, yaml.safeDump(newDiff));	
	});			
	// context.subscriptions.push(disposable);
}
