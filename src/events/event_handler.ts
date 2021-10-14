import fs from 'fs';
import path from 'path';
import walk from "walk";
import yaml from "js-yaml";
import vscode from 'vscode';
import dateFormat from "dateformat";

import { IDiff } from "../interface";
import { initUtils } from "../init/utils";
import { getBranch, readYML } from "../utils/common";
import { generateSettings } from "../settings";
import { pathUtils } from "../utils/path_utils";
import { diff_match_patch } from 'diff-match-patch';
import { DATETIME_FORMAT, DIFF_SOURCE } from "../constants";
import { isRepoSynced, shouldIgnoreFile } from './utils';


export class eventHandler {
	repoPath: string;
	branch: string;
	viaDaemon: boolean;
	repoIsNotSynced: boolean;
	pathUtils: any;
	shadowRepoBranchPath: string;
	deletedRepoBranchPath: string;
	originalsRepoBranchPath: string

	// Diff props
	isNewFile = false;
	isRename = false;
	isDelete = false;
	createdAt = '';
	settings = generateSettings();

	constructor(repoPath="", createdAt="", viaDaemon=false) {
		this.createdAt = createdAt;
		this.viaDaemon = viaDaemon;
		this.repoPath = repoPath || pathUtils.getRootPath();
		this.repoIsNotSynced = !isRepoSynced(this.repoPath);
		this.branch = getBranch(this.repoPath);
		this.pathUtils = new pathUtils(this.repoPath, this.branch);
		this.shadowRepoBranchPath = this.pathUtils.getShadowRepoBranchPath();
		this.deletedRepoBranchPath = this.pathUtils.getDeletedRepoBranchPath();
		this.originalsRepoBranchPath = this.pathUtils.getOriginalsRepoBranchPath();
	}

	addDiff = (relPath: string, diffs: any) => {
		// Skip empty diffs
		if (!diffs && !this.isNewFile && !this.isDelete) {
			console.log(`addDiff: Skipping empty diffs`);
			return;
		}
		if (!this.createdAt) {
			this.createdAt = dateFormat(new Date(), DATETIME_FORMAT);
		}
		// Add new diff in the buffer
		const newDiff = <IDiff>{};
		newDiff.source = DIFF_SOURCE;
		newDiff.repo_path = this.repoPath;
		newDiff.branch = this.branch;
		newDiff.file_relative_path = relPath;
		newDiff.diff = diffs;
		newDiff.is_new_file = this.isNewFile;
		newDiff.is_rename = this.isRename;
		newDiff.is_deleted = this.isDelete;
		newDiff.created_at = this.createdAt;
		// Append new diff in the buffer
		const diffFileName = `${new Date().getTime()}.yml`;
		const diffFilePath = path.join(this.settings.DIFFS_REPO, diffFileName);
		fs.writeFileSync(diffFilePath, yaml.safeDump(newDiff));
	};

	addPathToConfig = (relPath: string, oldRelPath = "") => {
		const configJSON = readYML(this.settings.CONFIG_PATH);
		const configFiles = configJSON.repos[this.repoPath].branches[this.branch];
		if (this.isNewFile) {
			configFiles[relPath] = null;
		}
		if (this.isRename) {
			// Use old file ID for the renamed file
			configFiles[relPath] = configFiles[oldRelPath] || null;
			delete configFiles[oldRelPath];
		}
		// write file id to config.yml
		fs.writeFileSync(this.settings.CONFIG_PATH, yaml.safeDump(configJSON));
	}

	handleChangeEvent = (changeEvent: vscode.TextDocumentChangeEvent) => {
		if (this.repoIsNotSynced) return;
		// If you only care about changes to the active editor's text,
		//  just check to see if changeEvent.document matches the active editor's document.
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document !== changeEvent.document) {
			console.log("Skipping InActive Editor's document");
			return;
		}
		const filePath = pathUtils.normalizePath(changeEvent.document.fileName);
		if (!changeEvent.contentChanges.length) return;
		const currentText = changeEvent.document.getText();
		this.handleChanges(filePath, currentText);
	}

	handleChanges = (filePath: string, currentText: string) => {
		const relPath = filePath.split(path.join(this.repoPath, path.sep))[1];
		// Skip .git and .syncignore files
		if (shouldIgnoreFile(this.repoPath, relPath)) return;
		let shadowText = "";
		const shadowPath = path.join(this.shadowRepoBranchPath, relPath);
		if (!fs.existsSync(shadowPath)) {
			const initUtilsObj = new initUtils(this.repoPath);
			initUtilsObj.copyFilesTo([filePath], this.shadowRepoBranchPath);
		} else {
			// Read shadow file
			shadowText = fs.readFileSync(shadowPath, "utf8");
		}
		// If shadow text is same as current content, no need to compute diffs
		if (shadowText === currentText) {
			if (!this.viaDaemon) {
				console.log(`Skipping handleChanges: Shadow is same as text`);
			}
			return;
		}
		// Update shadow file
		fs.writeFileSync(shadowPath, currentText);
		// Compute diffs
		const dmp = new diff_match_patch();
		const patches = dmp.patch_make(shadowText, currentText);
		//  Create text representation of patches objects
		const diffs = dmp.patch_toText(patches);
		// Add new diff in the buffer
		this.addDiff(relPath, diffs);
	};

	handleCreateEvent = (event: vscode.FileCreateEvent) => {
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
		const initUtilsObj = new initUtils(this.repoPath);
		initUtilsObj.copyFilesTo([filePath], this.shadowRepoBranchPath);
		initUtilsObj.copyFilesTo([filePath], this.originalsRepoBranchPath);
		// Add new diff in the buffer
		this.isNewFile = true;
		// Add null fileId in config
		this.addPathToConfig(relPath);
		this.addDiff(relPath, "");
	};

	handleDeleteEvent = (event: vscode.FileDeleteEvent) => {
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
			this.handleDelete(item.fsPath);
		});
	}

	handleDelete = (filePath: string) => {
		const itemPath = pathUtils.normalizePath(filePath);
		const relPath = itemPath.split(path.join(this.repoPath, path.sep))[1];

		// Skip .git/ and syncignore files
		if (shouldIgnoreFile(this.repoPath, relPath)) { return; }

		// Shadow path
		const shadowPath = path.join(this.shadowRepoBranchPath, relPath);
		if (!fs.existsSync(shadowPath)) { return; }

		const lstat = fs.lstatSync(shadowPath);

		if (lstat.isDirectory()) {
			console.log(`DirectoryDeleted: ${itemPath}`);
			this.handleDirectoryDeleteDiffs(relPath);
		}
		if (!lstat.isFile()) { return; }

		// Cache file path
		const cacheFilePath = path.join(this.deletedRepoBranchPath, relPath);
		if (fs.existsSync(cacheFilePath)) { return; }

		console.log(`FileDeleted: ${itemPath}`);
		const initUtilsObj = new initUtils(this.repoPath);
		initUtilsObj.copyFilesTo([shadowPath], this.pathUtils.getDeletedRepoPath(), true);
		// Add new diff in the buffer
		this.isDelete = true;
		this.addDiff(relPath, "");
	};

	handleDirectoryDeleteDiffs = (dirRelPath: string) => {
		const shadowDirPath = path.join(this.shadowRepoBranchPath, dirRelPath);
		const pathUtilsObj = this.pathUtils;
		const repoPath = this.repoPath;
		const branch = this.branch;
		this.isDelete = true;
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;
		// No need to skip repos here as it is for specific repo
		const walker = walk.walk(shadowDirPath);
		walker.on("file", function (root, fileStats, next) {
			const filePath = path.join(root, fileStats.name);
			const relPath = filePath.split(path.join(pathUtilsObj.formattedRepoPath, branch, path.sep))[1];
			const cacheRepoBranchPath = pathUtilsObj.getDeletedRepoBranchPath();
			const cacheFilePath = path.join(cacheRepoBranchPath, relPath);
			if (fs.existsSync(cacheFilePath)) {
				return next();
			}
			// Create directories
			const initUtilsObj = new initUtils(repoPath);
			initUtilsObj.copyFilesTo([filePath], pathUtilsObj.getDeletedRepoPath(), true);
			that.addDiff(relPath, "");
			next();
		});
	};

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
			this.handleRename(_event.oldUri.fsPath, _event.newUri.fsPath);
		});
	}

	handleRename = (oldPath: string, newPath: string) => {
		const oldAbsPath = pathUtils.normalizePath(oldPath);
		const newAbsPath = pathUtils.normalizePath(newPath);
		const oldRelPath = oldAbsPath.split(path.join(this.repoPath, path.sep))[1];
		const newRelPath = newAbsPath.split(path.join(this.repoPath, path.sep))[1];
		if (shouldIgnoreFile(this.repoPath, newRelPath)) { return; }

		const isDirectory = fs.lstatSync(newAbsPath).isDirectory();
		if (isDirectory) {
			console.log(`DirectoryRenamed: ${oldAbsPath} -> ${newAbsPath}`);
			this.handleDirectoryRenameDiffs(oldAbsPath, newAbsPath);
			return;
		}
		console.log(`FileRenamed: ${oldAbsPath} -> ${newAbsPath}`);

		const oldShadowPath = path.join(this.shadowRepoBranchPath, oldRelPath);
		const newShadowPath = path.join(this.shadowRepoBranchPath, newRelPath);
		if (fs.existsSync(oldShadowPath)) {
			const initUtilsObj = new initUtils(this.repoPath);
			initUtilsObj.copyForRename(oldShadowPath, newShadowPath);
			fs.unlinkSync(oldShadowPath);
		}
		// Create diff
		const diff = JSON.stringify({
			old_rel_path: oldRelPath,
			new_rel_path: newRelPath
		});
		// Add new diff in the buffer
		this.isRename = true;
		this.addPathToConfig(newRelPath, oldRelPath);
		this.addDiff(newRelPath, diff);
	}

	handleDirectoryRenameDiffs = (oldPath: string, newPath: string) => {
		// No need to skip repos here as it is for specific repo
		this.isRename = true;
		const repoPath = this.repoPath;
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;
		const walker = walk.walk(newPath);
		walker.on("file", function (root, fileStats, next) {
			const newFilePath = path.join(root, fileStats.name);
			const oldFilePath = newFilePath.replace(newPath, oldPath);
			const oldRelPath = oldFilePath.split(path.join(repoPath, path.sep))[1];
			const newRelPath = newFilePath.split(path.join(repoPath, path.sep))[1];
			const diff = JSON.stringify({
				'old_rel_path': oldRelPath,
				'new_rel_path': newRelPath
			});
			// // Rename shadow file
			const oldShadowPath = path.join(that.shadowRepoBranchPath, oldRelPath);
			const newShadowPath = path.join(that.shadowRepoBranchPath, newRelPath);
			if (fs.existsSync(oldShadowPath)) {
				const initUtilsObj = new initUtils(repoPath);
				initUtilsObj.copyForRename(oldShadowPath, newShadowPath);
				fs.unlinkSync(oldShadowPath);
			}
			that.addPathToConfig(newRelPath, oldRelPath);
			that.addDiff(newRelPath, diff);
			next();
		});
	};
}
