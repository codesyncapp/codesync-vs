import fs from 'fs';
import path from 'path';
import vscode from 'vscode';
import { diff_match_patch } from 'diff-match-patch';
import getBranchName from 'current-git-branch';

import { DEFAULT_BRANCH} from "../constants";
import { pathUtils } from "../utils/path_utils";
import { isRepoSynced, shouldIgnoreFile } from './utils';
import {
	handleDirectoryDeleteDiffs,
	handleDirectoryRenameDiffs,
	manageDiff
} from './diff_utils';


export class eventHandler {
	repoPath: string;
	branch: string;
	settings: any;
	repoIsNotSynced: boolean;
	pathUtils: any;
	shadowRepoBranchPath: string;
	deletedRepoBranchPath: string;
	originalsRepoBranchPath: string

	constructor() {
		this.repoPath = pathUtils.getRootPath();
		this.branch = getBranchName({ altPath: this.repoPath }) || DEFAULT_BRANCH;
		this.repoIsNotSynced = !isRepoSynced(this.repoPath);
		this.pathUtils = new pathUtils(this.repoPath, this.branch);
		this.shadowRepoBranchPath = this.pathUtils.getShadowRepoBranchPath();
		this.deletedRepoBranchPath = this.pathUtils.getDeletedRepoBranchPath();
		this.originalsRepoBranchPath = this.pathUtils.getOriginalsRepoBranchPath();
	}

	handleChangeEvent = (changeEvent: vscode.TextDocumentChangeEvent) => {
		if (this.repoIsNotSynced) return;
		const filePath = pathUtils.normalizePath(changeEvent.document.fileName);
		const relPath = filePath.split(path.join(this.repoPath, path.sep))[1];
		// Skip .git and .syncignore files
		if (shouldIgnoreFile(this.repoPath, relPath)) return;
		if (!changeEvent.contentChanges.length) return;
		const shadowPath = path.join(this.shadowRepoBranchPath, relPath);
		if (!fs.existsSync(shadowPath)) {
			// Creating shadow file if shadow does not exist somehow
			const destShadowBasePath = path.dirname(shadowPath);
			// Add file in shadow repo
			fs.mkdirSync(destShadowBasePath, {recursive: true});
			// File destination will be created or overwritten by default.
			fs.copyFileSync(filePath, shadowPath);
			return;
		}
		const text = changeEvent.document.getText();
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
		manageDiff(this.repoPath, this.branch, relPath, diffs);
	}

	handleFilesCreated = (event: vscode.FileCreateEvent) => {
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
		if (this.repoIsNotSynced) return;
		event.files.forEach((file) => {
			this.handleNewFile(file.fsPath);
		});
	}

	handlePastedFile = (filePath: string) => {
		if (this.repoIsNotSynced) return;
		this.handleNewFile(filePath);
	}

	handleNewFile = (_filePath: string) => {
		const filePath = pathUtils.normalizePath(_filePath);
		// Do not continue if file does not exist
		if (!fs.existsSync(filePath)) return;
		// Skip directory
		const lstat = fs.lstatSync(filePath);
		if (lstat.isDirectory()) return;

		const relPath = filePath.split(path.join(this.repoPath, path.sep))[1];
		if (shouldIgnoreFile(this.repoPath, relPath)) { return; }
		const shadowPath = path.join(this.shadowRepoBranchPath, relPath);
		const originalsPath = path.join(this.originalsRepoBranchPath, relPath);
		if (fs.existsSync(shadowPath) || fs.existsSync(originalsPath)) { return; }

		console.log(`FileCreated: ${filePath}`);
		const destShadowBasePath = path.dirname(shadowPath);
		const destOriginalsBasePath = path.dirname(originalsPath);
		// Add file in shadow repo
		fs.mkdirSync(destShadowBasePath, { recursive: true });
		// File destination will be created or overwritten by default.
		fs.copyFileSync(filePath, shadowPath);
		// Add file in originals repo
		fs.mkdirSync(destOriginalsBasePath, { recursive: true });
		// File destination will be created or overwritten by default.
		fs.copyFileSync(filePath, originalsPath);
		// Add new diff in the buffer
		manageDiff(this.repoPath, this.branch, relPath, "", true);
	};

	handleFilesDeleted = (event: vscode.FileDeleteEvent) => {
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
		if (this.repoIsNotSynced) return;
		event.files.forEach((item) => {
			const itemPath = pathUtils.normalizePath(item.fsPath);
			const relPath = itemPath.split(path.join(this.repoPath, path.sep))[1];

			// Skip .git/ and syncignore files
			if (shouldIgnoreFile(this.repoPath, relPath)) { return; }

			// Shadow path
			const shadowPath = path.join(this.shadowRepoBranchPath, relPath);
			if (!fs.existsSync(shadowPath)) { return; }

			const lstat = fs.lstatSync(shadowPath);

			if (lstat.isDirectory()) {
				console.log(`DirectoryDeleted: ${itemPath}`);
				handleDirectoryDeleteDiffs(this.repoPath, this.branch, relPath);
			}
			if (!lstat.isFile()) { return; }

			console.log(`FileDeleted: ${itemPath}`);
			// Cache path
			const cacheFilePath = path.join(this.deletedRepoBranchPath, relPath);
			const cacheDirectories = path.dirname(cacheFilePath);

			if (fs.existsSync(cacheFilePath)) { return; }
			// Add file in .deleted repo
			if (!fs.existsSync(cacheDirectories)) {
				// Create directories
				fs.mkdirSync(cacheDirectories, { recursive: true });
			}
			// File destination will be created or overwritten by default.
			fs.copyFileSync(shadowPath, cacheFilePath);
			manageDiff(this.repoPath, this.branch, relPath, "", false, false, true);
		});
	}

	handleRenameEvent = (event: vscode.FileRenameEvent) => {
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
		if (this.repoIsNotSynced) return;
		event.files.forEach(_event => {
			const oldAbsPath = pathUtils.normalizePath(_event.oldUri.fsPath);
			const newAbsPath = pathUtils.normalizePath(_event.newUri.fsPath);
			const newRelPath = newAbsPath.split(path.join(this.repoPath, path.sep))[1];
			if (shouldIgnoreFile(this.repoPath, newRelPath)) { return; }
			this.handleRename(oldAbsPath, newAbsPath, fs.lstatSync(newAbsPath).isFile());
		});
	}

	handleRename = (oldAbsPath: string, newAbsPath: string, isFile: boolean) => {
		const oldRelPath = oldAbsPath.split(path.join(this.repoPath, path.sep))[1];
		const newRelPath = newAbsPath.split(path.join(this.repoPath, path.sep))[1];

		const oldShadowPath = path.join(this.shadowRepoBranchPath, oldRelPath);
		const newShadowPath = path.join(this.shadowRepoBranchPath, newRelPath);
		// rename file in shadow repo
		fs.renameSync(oldShadowPath, newShadowPath);

		if (!isFile) {
			console.log(`DirectoryRenamed: ${oldAbsPath} -> ${newAbsPath}`);
			const diff = JSON.stringify({ old_path: oldAbsPath, new_path: newAbsPath });
			handleDirectoryRenameDiffs(this.repoPath, this.branch, diff);
			return;
		}

		console.log(`FileRenamed: ${oldAbsPath} -> ${newAbsPath}`);
		// Create diff
		const diff = JSON.stringify({
			old_abs_path: oldAbsPath,
			new_abs_path: newAbsPath,
			old_rel_path: oldRelPath,
			new_rel_path: newRelPath
		});
		manageDiff(this.repoPath, this.branch, newRelPath, diff, false, true);
	};
}
