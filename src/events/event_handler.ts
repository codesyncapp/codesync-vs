import fs from 'fs';
import path from 'path';
import yaml from "js-yaml";
import vscode from 'vscode';
import { globSync } from 'glob';

import { IDiff } from "../interface";
import { initUtils } from "../connect_repo/utils";
import { formatDatetime, getBranch, getDefaultIgnorePatterns, getSyncIgnoreItems, readFile, readYML, shouldIgnorePath } from "../utils/common";
import { generateSettings } from "../settings";
import { pathUtils } from "../utils/path_utils";
import { diff_match_patch } from 'diff-match-patch';
import { VSCODE } from "../constants";
import { removeFile } from '../utils/file_utils';
import { CODESYNC_STATES, CodeSyncState } from '../utils/state_utils';
import gitCommitInfo from 'git-commit-info';
import { RepoState } from '../utils/repo_state_utils';
import { UserState } from '../utils/user_utils';


export class eventHandler {
	repoPath = "";
	branch = "";
	commitHash: string|null = null;
	viaDaemon = false;
	pathUtils: any;
	shadowRepoBranchPath = "";
	deletedRepoBranchPath = "";
	originalsRepoBranchPath = "";
	syncIgnoreItems: string[] = [];
	defaultIgnorePatterns: string[] = [];

	// Diff props
	isNewFile = false;
	isRename = false;
	isDelete = false;
	createdAt = '';
	settings = generateSettings();
	shouldProceed = false;

	constructor(repoPath="", createdAt="", viaDaemon=false) {
		const userState = new UserState();
		const isValidAccount = userState.isValidAccount();
		this.createdAt = createdAt || formatDatetime();
		this.viaDaemon = viaDaemon;
		this.repoPath = repoPath || pathUtils.getRootPath();
		const repoState = new RepoState(this.repoPath).get();
		const repoIsConnected = repoState.IS_CONNECTED;
		this.shouldProceed = isValidAccount && repoIsConnected;
		if (!this.shouldProceed) return;
		this.branch = getBranch(this.repoPath);
		this.pathUtils = new pathUtils(this.repoPath, this.branch);
		this.shadowRepoBranchPath = this.pathUtils.getShadowRepoBranchPath();
		this.deletedRepoBranchPath = this.pathUtils.getDeletedRepoBranchPath();
		this.originalsRepoBranchPath = this.pathUtils.getOriginalsRepoBranchPath();
		this.syncIgnoreItems = getSyncIgnoreItems(this.repoPath);
		this.defaultIgnorePatterns = getDefaultIgnorePatterns();
		if (viaDaemon) {
			const commitInfo = gitCommitInfo({cwd: this.repoPath});
			this.commitHash = commitInfo.hash || null;
		} else {
			this.commitHash = CodeSyncState.get(CODESYNC_STATES.GIT_COMMIT_HASH) || null;
			if (!this.commitHash) {
				const commitInfo = gitCommitInfo({cwd: this.repoPath});
				this.commitHash = commitInfo.hash || null;	
			}
		}
	}

	addDiff = (relPath: string, diffs="") => {
		// Skip empty diffs
		if (!diffs && !this.isNewFile && !this.isDelete) {
			this.log(`addDiff: Skipping empty diffs`);
			return;
		}
		// Add new diff in the buffer
		const newDiff = <IDiff>{};
		newDiff.source = VSCODE;
		newDiff.repo_path = this.repoPath;
		newDiff.branch = this.branch;
		newDiff.commit_hash = this.commitHash;
		newDiff.file_relative_path = relPath;
		newDiff.diff = diffs;
		newDiff.is_new_file = this.isNewFile;
		newDiff.is_rename = this.isRename;
		newDiff.is_deleted = this.isDelete;
		newDiff.created_at = this.createdAt;
		if (this.isNewFile) {
			newDiff.added_at = formatDatetime();
		}
		// Append new diff in the buffer
		const diffFileName = `${new Date().getTime()}.yml`;
		const diffFilePath = path.join(this.settings.DIFFS_REPO, diffFileName);
		fs.writeFileSync(diffFilePath, yaml.dump(newDiff));
		return diffFilePath;
	};

	addPathToConfig = (relPath: string, oldRelPath = "") => {
		const configJSON = readYML(this.settings.CONFIG_PATH);
		const configFiles = configJSON.repos[this.repoPath].branches[this.branch];
		// If branch is not synced, discard the event
		if (!configFiles) return;
		if (this.isNewFile) {
			configFiles[relPath] = null;
		}
		if (this.isRename) {
			// Use old file ID for the renamed file
			configFiles[relPath] = configFiles[oldRelPath] || null;
			delete configFiles[oldRelPath];
		}
		// write file id to config.yml
		fs.writeFileSync(this.settings.CONFIG_PATH, yaml.dump(configJSON));
	}

	handleChangeEvent = (changeEvent: vscode.TextDocumentChangeEvent) => {
		if (!this.shouldProceed) return;
		// If you only care about changes to the active editor's text,
		// just check to see if changeEvent.document matches the active editor's document.
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document !== changeEvent.document) {
			this.log("Skipping InActive Editor's document");
			return;
		}
		const filePath = pathUtils.normalizePath(changeEvent.document.fileName);
		if (!changeEvent.contentChanges.length) return;
		const currentText = changeEvent.document.getText();
		this.handleChanges(filePath, currentText);
	}

	handleChanges = (filePath: string, currentText: string) => {
		if (!filePath.startsWith(this.repoPath)) return;
		// If file does not exist, return
		if (!fs.existsSync(filePath)) return;
		const relPath = filePath.split(path.join(this.repoPath, path.sep))[1];
		// Skip .git and .syncignore files
		if (shouldIgnorePath(relPath, this.defaultIgnorePatterns, this.syncIgnoreItems)) return;
		let shadowText = "";
		const shadowPath = path.join(this.shadowRepoBranchPath, relPath);
		if (!fs.existsSync(shadowPath)) {
			const initUtilsObj = new initUtils(this.repoPath);
			initUtilsObj.copyFilesTo([filePath], this.shadowRepoBranchPath);
		} else {
			const lstatShadow = fs.lstatSync(shadowPath);
			const lstatFile =  fs.lstatSync(filePath);
			// If populating buffer via daemon, check if shadow was modified after the file was written to disk
			const shadowHasBeenUpdated = lstatShadow.mtimeMs >= lstatFile.mtimeMs;
			if (shadowHasBeenUpdated) {
				if (this.viaDaemon) return;
				this.createdAt = formatDatetime(lstatShadow.mtimeMs);
			}
			// Read shadow file
			shadowText = readFile(shadowPath);
		}
		// If shadow text is same as current content, no need to compute diffs
		if (shadowText === currentText) return;
		// Update shadow file
		fs.writeFileSync(shadowPath, currentText);
		// Compute diffs
		const dmp = new diff_match_patch();
		const patches = dmp.patch_make(shadowText, currentText);
		// Create text representation of patches objects
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
		event.files.forEach((file) => {
			this.handleNewFile(file.fsPath);
		});
	}

	handleNewFile = (_filePath: string, forceUpload=false) => {
		if (!this.shouldProceed) return;
		const filePath = pathUtils.normalizePath(_filePath);
		// Do not continue if file does not exist
		if (!fs.existsSync(filePath)) return;
		// Ignore directories, symlinks etc
		const lstat = fs.lstatSync(filePath);
		if (!lstat.isFile()) return;
		// Skip if it is not from current repo
		if (!filePath.startsWith(this.repoPath)) return;

		const relPath = filePath.split(path.join(this.repoPath, path.sep))[1];
		if (shouldIgnorePath(relPath, this.defaultIgnorePatterns, this.syncIgnoreItems)) return;

		const shadowPath = path.join(this.shadowRepoBranchPath, relPath);
		const originalsPath = path.join(this.originalsRepoBranchPath, relPath);

		if (!forceUpload && (fs.existsSync(shadowPath) || fs.existsSync(originalsPath))) return;
		
		this.log(`FileCreated: ${filePath}`);

		const initUtilsObj = new initUtils(this.repoPath);
		// Copy file to .shadow & .originals, it is conditional as in case of branch upload, file is copied to .shadow and .original but 
		// server only process X number of files in /init , it is not uploaded immediately
		if (!fs.existsSync(shadowPath)) {
			initUtilsObj.copyFilesTo([filePath], this.shadowRepoBranchPath);
		}
		// Copy file to .originals
		if (!fs.existsSync(originalsPath)) {
			initUtilsObj.copyFilesTo([filePath], this.originalsRepoBranchPath);
		}
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
		event.files.forEach((item) => {
			this.handleDelete(item.fsPath);
		});
	}

	handleDelete = (filePath: string) => {
		if (!this.shouldProceed) return;
		const itemPath = pathUtils.normalizePath(filePath);
		if (!itemPath.startsWith(this.repoPath)) return;

		const relPath = itemPath.split(path.join(this.repoPath, path.sep))[1];
		// Skip .git/ and syncignore files
		if (shouldIgnorePath(relPath, this.defaultIgnorePatterns, this.syncIgnoreItems)) return;

		// Shadow path
		const shadowPath = path.join(this.shadowRepoBranchPath, relPath);
		if (!fs.existsSync(shadowPath)) { return; }

		const lstat = fs.lstatSync(shadowPath);

		if (lstat.isDirectory()) {
			this.log(`DirectoryDeleted: ${itemPath}`);
			this.handleDirectoryDeleteDiffs(relPath);
		}
		if (!lstat.isFile()) { return; }

		// Cache file path
		const cacheFilePath = path.join(this.deletedRepoBranchPath, relPath);
		if (fs.existsSync(cacheFilePath)) { return; }

		this.log(`FileDeleted: ${itemPath}`);
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
		// No need to skip repos here as it is for specific directory
		const shadowFiles = globSync("**", { 
			cwd: shadowDirPath,
			nodir: true, 
			dot: true,
			withFileTypes: true
		});
		shadowFiles.forEach(globFile => {
			const shadowFilePath = globFile.fullpath();
			const relPath = shadowFilePath.split(path.join(pathUtilsObj.formattedRepoPath, branch, path.sep))[1];
			const cacheRepoBranchPath = pathUtilsObj.getDeletedRepoBranchPath();
			const cacheFilePath = path.join(cacheRepoBranchPath, relPath);
			if (fs.existsSync(cacheFilePath)) return;
			// Create directories
			const initUtilsObj = new initUtils(repoPath);
			initUtilsObj.copyFilesTo([shadowFilePath], pathUtilsObj.getDeletedRepoPath(), true);
			this.addDiff(relPath, "");
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
		if (!this.shouldProceed) return;
		event.files.forEach(_event => {
			this.handleRename(_event.oldUri.fsPath, _event.newUri.fsPath);
		});
	}

	handleRename = (oldPath: string, newPath: string) => {
		const oldAbsPath = pathUtils.normalizePath(oldPath);
		const newAbsPath = pathUtils.normalizePath(newPath);
		const oldRelPath = oldAbsPath.split(path.join(this.repoPath, path.sep))[1];
		const newRelPath = newAbsPath.split(path.join(this.repoPath, path.sep))[1];

		if (!newAbsPath.startsWith(this.repoPath)) return;
		if (shouldIgnorePath(newRelPath, this.defaultIgnorePatterns, this.syncIgnoreItems)) return;

		const isDirectory = fs.lstatSync(newAbsPath).isDirectory();
		if (isDirectory) {
			this.log(`DirectoryRenamed: ${oldAbsPath} -> ${newAbsPath}`);
			this.handleDirectoryRenameDiffs(oldAbsPath, newAbsPath);
			return;
		}
		this.log(`FileRenamed: ${oldAbsPath} -> ${newAbsPath}`);

		const oldShadowPath = path.join(this.shadowRepoBranchPath, oldRelPath);
		const newShadowPath = path.join(this.shadowRepoBranchPath, newRelPath);
		if (fs.existsSync(oldShadowPath)) {
			const initUtilsObj = new initUtils(this.repoPath);
			initUtilsObj.copyForRename(oldShadowPath, newShadowPath);
			removeFile(oldShadowPath, "handleRename");
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
		// No need to skip repos here as it is for specific directory
		const renamedFiles = globSync("**", { 
			cwd: newPath,
			nodir: true, 
			dot: true,
			withFileTypes: true
		});
		renamedFiles.forEach(globFile => {
			const renamedFilePath = globFile.fullpath();
			const oldFilePath = renamedFilePath.replace(newPath, oldPath);
			const oldRelPath = oldFilePath.split(path.join(repoPath, path.sep))[1];
			const newRelPath = renamedFilePath.split(path.join(repoPath, path.sep))[1];
			const diff = JSON.stringify({
				'old_rel_path': oldRelPath,
				'new_rel_path': newRelPath
			});
			// Rename shadow file
			const oldShadowPath = path.join(this.shadowRepoBranchPath, oldRelPath);
			const newShadowPath = path.join(this.shadowRepoBranchPath, newRelPath);
			if (fs.existsSync(oldShadowPath)) {
				const initUtilsObj = new initUtils(repoPath);
				initUtilsObj.copyForRename(oldShadowPath, newShadowPath);
				removeFile(oldShadowPath, "handleDirectoryRenameDiffs");
			}
			this.addPathToConfig(newRelPath, oldRelPath);
			this.addDiff(newRelPath, diff);
		});
	};

	log(msg: string) {
		console.log(msg);
	}
}
