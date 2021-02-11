import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as vscode from 'vscode';
import * as dateFormat from "dateformat";
import { diff_match_patch } from 'diff-match-patch';
import * as getBranchName from 'current-git-branch';

import { IDiff } from "./interface";
import { SHADOW_REPO, DIFFS_REPO, ORIGINALS_REPO, DIFF_SOURCE, DEFAULT_BRANCH, DATETIME_FORMAT, GIT_REPO } from "./constants";

export function handleChangeEvent(changeEvent: vscode.TextDocumentChangeEvent) {
	const repoName = vscode.workspace.name;
	const repoPath = vscode.workspace.rootPath;
	if (!repoPath || !repoName) { return; }

	if (!changeEvent.contentChanges.length) { return; }
	const filePath = changeEvent.document.fileName;
	if (isGitFile(filePath)) {
		return;
	}
	const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
	// If you only care about changes to the active editor's text,
	//  just check to see if changeEvent.document matches the active editor's document.
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		console.log("Outside IDE");
		return;
	}
	if (editor.document !== changeEvent.document) {
		console.log("Skipping InActive Editor's document");
		return;
	}
	const text = changeEvent.document.getText();
	if (!repoPath) { 
		console.log(`Skipping: No repoPath`);
		return; 
	}
	const relPath = filePath.split(`${repoPath}/`)[1];
	const shadowPath = `${SHADOW_REPO}/${repoName}/${branch}/${relPath}`;
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
	if (!repoPath || !repoName) { return; }

	changeEvent.files.forEach((file) => {
		const filePath = file.path;
		if (isGitFile(filePath)) {
			return;
		}	
		const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
		const relPath = filePath.split(`${repoPath}/`)[1];
		const destOriginals = `${ORIGINALS_REPO}/${repoName}/${branch}/${relPath}`;
		const destOriginalsPathSplit = destOriginals.split("/");
		const destOriginalsBasePath = destOriginalsPathSplit.slice(0, destOriginalsPathSplit.length-1).join("/");
		const destShadow = `${SHADOW_REPO}/${repoName}/${branch}/${relPath}`;
		const destShadowPathSplit = destShadow.split("/");
		const destShadowBasePath = destShadowPathSplit.slice(0, destShadowPathSplit.length-1).join("/");
		if (fs.existsSync(destOriginals)) { return; }
		console.log(`FileCreated: ${filePath}`);
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
	if (!repoPath || !repoName) { return; }

	changeEvent.files.forEach((file) => {
		const filePath = file.path;
		if (isGitFile(filePath)) {
			return;
		}
		console.log(`FileDeleted: ${filePath}`);
		const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
		const relPath = filePath.split(`${repoPath}/`)[1];
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
	if (!repoPath || !repoName) { return; }
	changeEvent.files.forEach((file) => {
		const oldAbsPath = file.oldUri.path;
		const newAbsPath = file.newUri.path;
		console.log(`FileRenamed: ${oldAbsPath} -> ${newAbsPath}`);
		const oldRelPath = oldAbsPath.split(`${repoPath}/`)[1];
		const newRelPath = newAbsPath.split(`${repoPath}/`)[1];
		if (isGitFile(oldRelPath)) {
			return;
		}
		const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
		const shadowPath = `${SHADOW_REPO}/${repoName}/${branch}/${newRelPath}`;
		const shadowPathSplit = shadowPath.split("/");
		const shadowBasePath = shadowPathSplit.slice(0, shadowPathSplit.length-1).join("/");
		// Add file in shadow repo
		fs.mkdirSync(shadowBasePath, { recursive: true });
		fs.copyFileSync(newAbsPath, shadowPath);
		// Add new diff in the buffer
		const newDiff = <IDiff>{};
		newDiff.repo = repoName;
		newDiff.branch = branch || DEFAULT_BRANCH;
		newDiff.file_relative_path = newRelPath;
		newDiff.is_rename = true;
		newDiff.source = DIFF_SOURCE;
		newDiff.created_at = dateFormat(new Date(), DATETIME_FORMAT);
		newDiff.diff = JSON.stringify({ old_abs_path: oldAbsPath, new_abs_path: newAbsPath, old_rel_path: oldRelPath, new_rel_path: newRelPath});
		// Append new diff in the buffer
		fs.writeFileSync(`${DIFFS_REPO}/${new Date().getTime()}.yml`, yaml.safeDump(newDiff));
	});
}

export function isGitFile(path: string) {
	return path.startsWith(GIT_REPO);
}