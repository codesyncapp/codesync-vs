'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import { diff_match_patch } from 'diff-match-patch';
import * as getBranchName from 'current-git-branch';
import * as dateFormat from "dateformat";

// TODO: Move to separate file
const CODESYNC_ROOT = '/usr/local/bin/.codesync';
const DIFFS_REPO = `${CODESYNC_ROOT}/.diffs`;
const ORIGINALS_REPO = `${CODESYNC_ROOT}/.originals`;
const CONFIG_PATH = `${CODESYNC_ROOT}/config.yml`;
const DIFF_SOURCE = 'vs-code';

// TODO: Move to separate file
interface IDiff {
	repo: string;
	branch: string;
	file_relative_path: string;
	created_at: string;
	source: string;
	diff?: string;
	is_binary?: boolean;
	is_rename?: boolean;
	is_new_file?: boolean;
}

export function activate(context: vscode.ExtensionContext) {
	// Get the active text editor
	const editor = vscode.window.activeTextEditor;
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;
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
		if (!changeEvent.contentChanges.length) { return; }
		// If you only care about changes to the active editor's text,
		//  just check to see if changeEvent.document matches the active editor's document.
		const editor = vscode.window.activeTextEditor;
		if (!editor) { return; }
		if (editor.document !== changeEvent.document) {
			console.log("Skipping InActive Editor's document");
			return;
		}
		const filePath = changeEvent.document.fileName;
		const text = changeEvent.document.getText();
		if (!repoPath) { 
			console.log(`Skipping: No repoPath`);
			return; 
		}
		const relPath = filePath.split(`${repoPath}/`)[1];
		const shadowPath = `${CODESYNC_ROOT}/${repoName}/${branch}/${relPath}`;
		const shadowExists = fs.existsSync(shadowPath);
		if (!shadowExists) { 
			// TODO: Create shadow file?
			console.log(`Skipping: Shadow does not exist`);
			return;
		}
		// Read shadow file 
		const shadowText = fs.readFileSync(shadowPath, "utf8");
		// If shadow text is same as current content, no need to compute diffs
		if (shadowText === text) {
			console.log(`Skipping: Shadow is same as text`);
			return;
		}
		// if (!shadowText) {
		// 	console.log(`Skipping: Shadow is empty`);
		// 	return;
		// }
		// Update shadow file 
		fs.writeFileSync(shadowPath, text);
		// Compute diffs
		const dmp = new diff_match_patch();
		const patches = dmp.patch_make(shadowText, text);
		//  Create text representation of patches objects
		const diffs = dmp.patch_toText(patches);
		// Skip empty diffs
		if (!diffs) { 
			console.log(`Skipping: Empty diffs`);
			return;
		}
		// Add new diff in the buffer
		const newDiff = <IDiff>{};
		newDiff.repo = repoName;
		newDiff.branch = branch || 'default';
		newDiff.file_relative_path = relPath;
		newDiff.diff = diffs;
		newDiff.source = DIFF_SOURCE;
		newDiff.created_at = dateFormat(new Date(), 'UTC:yyyy-mm-dd HH:MM:ss.l');
		// Append new diff in the buffer
		fs.writeFileSync(`${DIFFS_REPO}/${new Date().getTime()}.yml`, yaml.safeDump(newDiff));
	});
	
	vscode.workspace.onDidCreateFiles(changeEvent => {
		/*
		changeEvent looks like
			Object
				files: Array[1]
					0:Object
						$mid:1
						fsPath:"/Users/basit/projects/codesync/codesync/codesync/new.py"
						external:"file:///Users/basit/projects/codesync/codesync/codesync/new.py"
						path:"/Users/basit/projects/codesync/codesync/codesync/new.py"
						scheme:"file"
		
		*/
		// TODO: Handle multiple files
		changeEvent.files.forEach((file) => {
			const filePath = file.path;
			console.log(`FileCreated: ${filePath}`);
			const relPath = filePath.split(`${repoPath}/`)[1];
			const destOriginals = `${ORIGINALS_REPO}/${repoName}/${branch}/${relPath}`;
			const destOriginalsPathSplit = destOriginals.split("/");
			const destOrignalsBasePath = destOriginalsPathSplit.slice(0, destOriginalsPathSplit.length-1).join("/");
			const destShadow = `${CODESYNC_ROOT}/${repoName}/${branch}/${relPath}`;
			const destShadowPathSplit = destShadow.split("/");
			const destShadowBasePath = destShadowPathSplit.slice(0, destShadowPathSplit.length-1).join("/");
	
			// Add file in originals repo
			fs.mkdirSync(destOrignalsBasePath, { recursive: true });
			// File destination will be created or overwritten by default.
			fs.copyFileSync(filePath, destOriginals);
			// Add file in shadow repo
			fs.mkdirSync(destShadowBasePath, { recursive: true });
			// File destination will be created or overwritten by default.
			fs.copyFileSync(filePath, destShadow);  
			// Add new diff in the buffer
			const newDiff = <IDiff>{};
			newDiff.repo = repoName;
			newDiff.branch = branch || 'default';
			newDiff.file_relative_path = relPath;
			newDiff.is_new_file = true;
			newDiff.source = DIFF_SOURCE;
			newDiff.created_at = dateFormat(new Date(), 'UTC:yyyy-mm-dd HH:MM:ss.l');
			// Append new diff in the buffer
			fs.writeFileSync(`${DIFFS_REPO}/${new Date().getTime()}.yml`, yaml.safeDump(newDiff));	
		});
	});
	// context.subscriptions.push(disposable);
}
