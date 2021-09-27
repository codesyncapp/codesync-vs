import fs from 'fs';
import path from 'path';
import vscode from 'vscode';
import { diff_match_patch } from 'diff-match-patch';
import getBranchName from 'current-git-branch';

import { DEFAULT_BRANCH} from "../constants";
import { handleDirectoryDeleteDiffs, manageDiff } from './diff_utils';
import { repoIsNotSynced, shouldIgnoreFile, handleRename, handleNewFile } from './utils';
import { pathUtils } from "../utils/path_utils";


export function handleChangeEvent(changeEvent: vscode.TextDocumentChangeEvent) {
	const repoName = vscode.workspace.name;
	const repoPath = pathUtils.getRootPath();
	if (!repoPath || !repoName) return;
	const filePath = pathUtils.normalizePath(changeEvent.document.fileName);
	const relPath = filePath.split(path.join(repoPath, path.sep))[1];
	// Skip .git/ and syncignore files
	if (repoIsNotSynced(repoPath) || shouldIgnoreFile(repoPath, relPath)) return;
	if (!changeEvent.contentChanges.length) return;

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
	const pathUtilsObj = new pathUtils(repoPath, branch);
	const shadowPath = path.join(pathUtilsObj.getShadowRepoBranchPath(), relPath);
	if (!fs.existsSync(shadowPath)) {
		// Creating shadow file if shadow does not exist somehow
		const destShadowBasePath = path.dirname(shadowPath);
		// Add file in shadow repo
		fs.mkdirSync(destShadowBasePath, {recursive: true});
		// File destination will be created or overwritten by default.
		fs.copyFileSync(filePath, shadowPath);
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
	const repoPath = pathUtils.getRootPath();
	if (!repoPath || !repoName || repoIsNotSynced(repoPath)) { return; }
	const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
	changeEvent.files.forEach((file) => {
		const filePath = pathUtils.normalizePath(file.fsPath);
		handleNewFile(repoPath, branch, filePath);
	});
}

export function handlePastedFile(filePath: string) {
	const repoName = vscode.workspace.name;
	const repoPath = pathUtils.getRootPath();
	if (!repoPath || !repoName || repoIsNotSynced(repoPath)) { return; }
	const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
	const normalizePath = pathUtils.normalizePath(filePath);
	handleNewFile(repoPath, branch, normalizePath);
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
	const repoPath = pathUtils.getRootPath();
	if (!repoPath || !repoName || repoIsNotSynced(repoPath)) { return; }

	changeEvent.files.forEach((item) => {
		const itemPath = pathUtils.normalizePath(item.fsPath);
		const relPath = itemPath.split(path.join(repoPath, path.sep))[1];

		// Skip .git/ and syncignore files
		if (shouldIgnoreFile(repoPath, relPath)) { return; }

		const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;

		// Shadow path
		const pathUtilsObj = new pathUtils(repoPath, branch);
		const shadowPath = path.join(pathUtilsObj.getShadowRepoBranchPath(), relPath);

		if (!fs.existsSync(shadowPath)) { return; }

		const lstat = fs.lstatSync(shadowPath);

		if (lstat.isDirectory()) {
			console.log(`DirectoryDeleted: ${itemPath}`);
			handleDirectoryDeleteDiffs(repoPath, branch, relPath);
			return;
		}
		if (!lstat.isFile()) { return; }

		console.log(`FileDeleted: ${itemPath}`);

		// Cache path
		const cacheFilePath = path.join(pathUtilsObj.getDeletedRepoBranchPath(), relPath);
		const cacheDirectories = path.dirname(cacheFilePath);

		if (fs.existsSync(cacheFilePath)) { return; }
		// Add file in .deleted repo
		if (!fs.existsSync(cacheDirectories)) {
			// Create directories
			fs.mkdirSync(cacheDirectories, { recursive: true });
		}
		// File destination will be created or overwritten by default.
		fs.copyFileSync(shadowPath, cacheFilePath);
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
	const repoPath = pathUtils.getRootPath();

	if (!repoPath || !repoName || repoIsNotSynced(repoPath)) { return; }
	changeEvent.files.forEach((event) => {
		const oldAbsPath = pathUtils.normalizePath(event.oldUri.fsPath);
		const newAbsPath = pathUtils.normalizePath(event.newUri.fsPath);
		const newRelPath = newAbsPath.split(path.join(repoPath, path.sep))[1];
		// Skip .git/ and syncignore files
		if (shouldIgnoreFile(repoPath, newRelPath)) { return; }
		const branch = getBranchName({ altPath: repoPath }) || DEFAULT_BRANCH;
		handleRename(repoPath, branch, oldAbsPath, newAbsPath, fs.lstatSync(newAbsPath).isFile());
	});
}

