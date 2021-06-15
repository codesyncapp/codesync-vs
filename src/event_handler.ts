import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { diff_match_patch } from 'diff-match-patch';
import * as getBranchName from 'current-git-branch';

import { SHADOW_REPO, DEFAULT_BRANCH, DELETED_REPO } from "./constants";
import { handleDirectoryDeleteDiffs, manageDiff } from './utils/diff_utils';
import { shouldSkipEvent, shouldIgnoreFile, handleRename, handleNewFile } from './utils/event_utils';


export function handleChangeEvent(changeEvent: vscode.TextDocumentChangeEvent) {
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath || !repoName || shouldSkipEvent(repoPath)) { return; }
	if (!changeEvent.contentChanges.length) { return; }
	const filePath = changeEvent.document.fileName;
	const relPath = filePath.split(`${repoPath}/`)[1];

	// Skip .git/ and syncignore files
	if (shouldIgnoreFile(repoPath, relPath)) { return; }

	const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
	// If you only care about changes to the active editor's text,
	//  just check to see if changeEvent.document matches the active editor's document.
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document !== changeEvent.document) {
		console.log("Skipping InActive Editor's document");
		return;
	}
	const text = changeEvent.document.getText();
	if (!repoPath) { 
		console.log(`Skipping: No repoPath`);
		return; 
	}
	const shadowPath = path.join(SHADOW_REPO, `${repoPath}/${branch}/${relPath}`);
	const shadowExists = fs.existsSync(shadowPath);
	if (!shadowExists) { 
		// TODO: Create shadow file?
		console.log(`Skipping: Shadow does not exist, ${filePath}`);
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
	// Add new diff in the buffer
	manageDiff(repoPath, branch, relPath, diffs);
}

export function handleFilesCreated(changeEvent: vscode.FileCreateEvent) {
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
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath || !repoName || shouldSkipEvent(repoPath)) { return; }

	changeEvent.files.forEach((file) => {
		handleNewFile(repoPath, file.path);
	});
}

export function handlePastedFile(filePath: string) {
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath || !repoName || shouldSkipEvent(repoPath)) { return; }
	handleNewFile(repoPath, filePath);
}

export function handleFilesDeleted(changeEvent: vscode.FileDeleteEvent) {
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
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath || !repoName || shouldSkipEvent(repoPath)) { return; }

	changeEvent.files.forEach((item) => {
		const itemPath = item.path;
		const relPath = itemPath.split(`${repoPath}/`)[1];

		// Skip .git/ and syncignore files
		if (shouldIgnoreFile(repoPath, relPath)) { return; }

		const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;

		// Shadow path
		const shadowPath = path.join(SHADOW_REPO, `${repoPath}/${branch}/${relPath}`);

		const lstat = fs.lstatSync(shadowPath);
		
		if (!fs.existsSync(shadowPath)) { return; }

		if (lstat.isDirectory()) {
			console.log(`DirectoryDeleted: ${itemPath}`);
			handleDirectoryDeleteDiffs(repoPath, branch, relPath);
			return;
		}
		if (!lstat.isFile()) { return; }

		console.log(`FileDeleted: ${itemPath}`);
		
		// Cache path
		const destDeleted = path.join(DELETED_REPO, `${repoPath}/${branch}/${relPath}`);
		const destDeletedPathSplit = destDeleted.split("/");
		const destDeletedBasePath = destDeletedPathSplit.slice(0, destDeletedPathSplit.length-1).join("/");

		if (fs.existsSync(destDeleted)) { return; }
		// Add file in .deleted repo
		if (!fs.existsSync(destDeletedBasePath)) {
			// Create directories
			fs.mkdirSync(destDeletedBasePath, { recursive: true });
		}
		// File destination will be created or overwritten by default.
		fs.copyFileSync(shadowPath, destDeleted);
		manageDiff(repoPath, branch, relPath, "", false, false, true);
	});
}

export function handleFilesRenamed(changeEvent: vscode.FileRenameEvent) {
	/*
	changeEvent looks like
		Object
			files:Array[1]
				0:
					oldUri:
						$mid:1
						fsPath:"/Users/basit/projects/codesync/codesync/4.py"
						external:"file:///Users/basit/projects/codesync/codesync/4.py"
						path:"/Users/basit/projects/codesync/codesync/4.py"
						scheme:"file"	
					newUri:
						$mid:1
						fsPath:"/Users/basit/projects/codesync/codesync/5.py"
						external:"file:///Users/basit/projects/codesync/codesync/5.py"
						path:"/Users/basit/projects/codesync/codesync/5.py"
						scheme:"file
	*/
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;
	
	if (!repoPath || !repoName || shouldSkipEvent(repoPath)) { return; }
	changeEvent.files.forEach((event) => {
		const oldAbsPath = event.oldUri.path;
		const newAbsPath = event.newUri.path;
		const newRelPath = newAbsPath.split(`${repoPath}/`)[1];
		// Skip .git/ and syncignore files
		if (shouldIgnoreFile(repoPath, newRelPath)) { return; }
		const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
		handleRename(repoPath, branch, oldAbsPath, newAbsPath, fs.lstatSync(newAbsPath).isFile());
	});
}

