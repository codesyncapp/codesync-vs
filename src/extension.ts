'use strict';

import vscode from 'vscode';

import { eventHandler } from "./events/event_handler";
import { 
	createStatusBarItem,
	registerCommands, 
	setInitialContext, 
	setupCodeSync 
} from "./utils/setup_utils";
import { pathUtils } from "./utils/path_utils";
import { checkSubDir } from "./utils/common";
import { recallDaemon } from "./codesyncd/codesyncd";
import { CodeSyncLogger } from "./logger";


export async function activate(context: vscode.ExtensionContext) {
	try {
		let repoPath = pathUtils.getRootPath();
		await setupCodeSync(repoPath);

		const subDirResult = checkSubDir(repoPath);
		
		// vscode.commands.executeCommand
		setInitialContext();
		// vscode.commands.registerCommand
		registerCommands(context);
		// Create status bar item
		const statusBarItem = createStatusBarItem(context);

		if (repoPath) {
			CodeSyncLogger.info(`Configured repo: ${repoPath}`);
			if (subDirResult.isSubDir) {
				repoPath = subDirResult.parentRepo;
				CodeSyncLogger.debug(`Parent repo: ${repoPath}`);
			}	
		}

		vscode.workspace.onDidChangeTextDocument(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleChangeEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error("Failed handling changeEvent", e.stack);
			}
		});

		vscode.workspace.onDidCreateFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleCreateEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error("Failed handling createEvent", e.stack);
			}
		});

		vscode.workspace.onDidDeleteFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleDeleteEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error("Failed handling deleteEvent", e.stack);
			}
		});

		vscode.workspace.onDidRenameFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleRenameEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				CodeSyncLogger.error("Failed handling renameEvent", e.stack);
			}
		});

		// Do not re-run daemon in case of tests
		if ((global as any).IS_CODESYNC_DEV) return;
		recallDaemon(statusBarItem, false);
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		CodeSyncLogger.critical("Failed to activate extension", e.stack);
	}
	CodeSyncLogger.info("activated...");
}

export function deactivate(context: vscode.ExtensionContext) {
	CodeSyncLogger.info("deactivated...");
}
