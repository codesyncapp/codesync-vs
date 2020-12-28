'use strict';

import * as vscode from 'vscode';
import * as FS from 'fs';
import * as yaml from 'js-yaml';

import { diff_match_patch } from 'diff-match-patch';
import * as getBranchName from 'current-git-branch';
import * as dateFormat from "dateformat";


const CODESYNC_ROOT = '/usr/local/bin/.codesync';
const CODESYNC_BUFFER = `${CODESYNC_ROOT}/buffer.yml`;

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
	
	console.log("repoName: ", repoName);
	console.log("rootPath: ", repoPath);
	console.log("branchName: ", branch);
	vscode.workspace.onDidChangeTextDocument(changeEvent => {
		if (!changeEvent.contentChanges.length) { return; }
		// If you only care about changes to the active editor's text,
		//  just check to see if changeEvent.document matches the active editor's document.
		const filePath = changeEvent.document.fileName;
		const text = changeEvent.document.getText();
		// console.log(`Did change: ${text}`);
		if (!repoPath) { return; }
		const relPath = filePath.split(`${repoPath}/`)[1];
		const shadowPath = `${CODESYNC_ROOT}/${repoName}/${branch}/${relPath}`;
		console.log('filePath: ', filePath);
		console.log("relPath: ", relPath);
		console.log("shadowPath: ", shadowPath);
		const shadowExists = FS.existsSync(shadowPath);
		if (!shadowExists) { 
			// Create shadow file
			return;
		}
		const bufferExists = FS.existsSync(CODESYNC_BUFFER);
		if (!bufferExists) { 
			// Create buffer file
			return; 
		}

		// Read shadow file 
		const shadowText = FS.readFileSync(shadowPath, "utf8");
		const dmp = new diff_match_patch();
		const patches = dmp.patch_make(shadowText, text);
		//  Create text representation of patches objects
		const diffs = dmp.patch_toText(patches);
		// console.log(diffs);
		FS.writeFile(shadowPath, text, function (err) {
			if (err) throw err;
			console.log('Replaced!');
		});
		// Get document, or throw exception on error
		try {
			const doc = yaml.safeLoad(FS.readFileSync(CODESYNC_BUFFER, 'utf8'));
			const buffer = <IBuffer>{};
			Object.assign(buffer, doc);
			if (!buffer) { return; }
			if (!Object.prototype.hasOwnProperty.call(buffer, 'data')) { return; }
			// Add new diff in the buffer
			const newDiff = <IDiff>{};
			newDiff.repo = repoName;
			newDiff.branch = branch;
			newDiff.file = relPath;
			newDiff.diff = diffs;
			newDiff.created_at = dateFormat(new Date(), 'UTC:yyyy-mm-dd hh:MM:ss.l');
			// Append new diff in the buffer
			buffer.data.push(newDiff);
			// Write to buffer
			FS.writeFileSync(CODESYNC_BUFFER, yaml.safeDump(buffer));
		} catch (e) {
			console.log(e);
		}
	});			
		// for (const change of changeEvent.contentChanges) {
			// console.log(change.range, 'range'); // range of text being replaced
			// console.log(change.text, 'text'); // text replacement
		// }
	// });
	// context.subscriptions.push(disposable);
}
