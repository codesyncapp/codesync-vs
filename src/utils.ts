import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as vscode from 'vscode';
import * as dateFormat from "dateformat";
import { diff_match_patch } from 'diff-match-patch';

import { IDiff } from "./interface";
import { CODESYNC_ROOT, DIFFS_REPO, ORIGINALS_REPO, DIFF_SOURCE, DEFAULT_BRANCH, DATETIME_FORMAT } from "./constants";

export function handleChangeEvent(changeEvent: vscode.TextDocumentChangeEvent, repoName: string, repoPath: string, branch: string) {
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
	newDiff.branch = branch || DEFAULT_BRANCH;
	newDiff.file_relative_path = relPath;
	newDiff.diff = diffs;
	newDiff.source = DIFF_SOURCE;
	newDiff.created_at = dateFormat(new Date(), DATETIME_FORMAT);
	// Append new diff in the buffer
	fs.writeFileSync(`${DIFFS_REPO}/${new Date().getTime()}.yml`, yaml.safeDump(newDiff));
}

export function handleFilesCreated(changeEvent: vscode.FileCreateEvent, repoName: string, repoPath: string, branch: string) {
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

	changeEvent.files.forEach((file) => {
		const filePath = file.path;
		console.log(`FileCreated: ${filePath}`);
		const relPath = filePath.split(`${repoPath}/`)[1];
		const destOriginals = `${ORIGINALS_REPO}/${repoName}/${branch}/${relPath}`;
		const destOriginalsPathSplit = destOriginals.split("/");
		const destOriginalsBasePath = destOriginalsPathSplit.slice(0, destOriginalsPathSplit.length-1).join("/");
		const destShadow = `${CODESYNC_ROOT}/${repoName}/${branch}/${relPath}`;
		const destShadowPathSplit = destShadow.split("/");
		const destShadowBasePath = destShadowPathSplit.slice(0, destShadowPathSplit.length-1).join("/");

		// Add file in originals repo
		fs.mkdirSync(destOriginalsBasePath, { recursive: true });
		// File destination will be created or overwritten by default.
		fs.copyFileSync(filePath, destOriginals);
		// Add file in shadow repo
		fs.mkdirSync(destShadowBasePath, { recursive: true });
		// File destination will be created or overwritten by default.
		fs.copyFileSync(filePath, destShadow);  
		// Add new diff in the buffer
		const newDiff = <IDiff>{};
		newDiff.repo = repoName;
		newDiff.branch = branch || DEFAULT_BRANCH;
		newDiff.file_relative_path = relPath;
		newDiff.is_new_file = true;
		newDiff.source = DIFF_SOURCE;
		newDiff.created_at = dateFormat(new Date(), DATETIME_FORMAT);
		// Append new diff in the buffer
		fs.writeFileSync(`${DIFFS_REPO}/${new Date().getTime()}.yml`, yaml.safeDump(newDiff));	
	});
}

export function handleFilesDeleted(changeEvent: vscode.FileDeleteEvent, repoName: string, repoPath: string, branch: string) {
	/*
	changeEvent looks like
		Object
			files:Array[1]
				0:Object
					$mid:1
					fsPath:"/Users/basit/projects/codesync/codesync/4.py"
					external:"file:///Users/basit/projects/codesync/codesync/4.py"
					path:"/Users/basit/projects/codesync/codesync/4.py"
					scheme:"file"	
	*/
	changeEvent.files.forEach((file) => {
		const filePath = file.path;
		console.log(`FileDeleted: ${filePath}`);
		const relPath = filePath.split(`${repoPath}/`)[1];
		const shadowPath = `${CODESYNC_ROOT}/${repoName}/${branch}/${relPath}`;
		const shadowExists = fs.existsSync(shadowPath);
		if (!shadowExists) { 
			console.log(`Skipping: Shadow does not exist`);
			return;
		}
		// Add new diff in the buffer
		const newDiff = <IDiff>{};
		newDiff.repo = repoName;
		newDiff.branch = branch || DEFAULT_BRANCH;
		newDiff.file_relative_path = relPath;
		newDiff.is_deleted = true;
		newDiff.source = DIFF_SOURCE;
		newDiff.created_at = dateFormat(new Date(), DATETIME_FORMAT);
		// Append new diff in the buffer
		fs.writeFileSync(`${DIFFS_REPO}/${new Date().getTime()}.yml`, yaml.safeDump(newDiff));
	});
}