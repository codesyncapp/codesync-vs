'use strict';

import vscode from 'vscode';

import { eventHandler } from "./events/event_handler";
import { setupCodeSync, showConnectRepoView, showLogIn } from "./utils/setup_utils";
import { COMMAND } from './constants';

import { logout } from './utils/auth_utils';
import { pathUtils } from "./utils/path_utils";
import { checkSubDir } from "./utils/common";
import { recallDaemon } from "./codesyncd/codesyncd";
import {
	unSyncHandler,
	SignUpHandler,
	SyncHandler,
	trackRepoHandler,
	trackFileHandler,
	openSyncIgnoreHandler,
	upgradePlanHandler,
	viewDashboardHandler
} from './handlers/commands_handler';
import { putLogEvent } from "./logger";


export async function activate(context: vscode.ExtensionContext) {
	try {
		let repoPath = pathUtils.getRootPath();
		const subDirResult = checkSubDir(repoPath);
		vscode.commands.executeCommand('setContext', 'showLogIn', showLogIn());
		vscode.commands.executeCommand('setContext', 'showConnectRepoView', showConnectRepoView(repoPath));
		vscode.commands.executeCommand('setContext', 'isSubDir', subDirResult.isSubDir);
		vscode.commands.executeCommand('setContext', 'isSyncIgnored', subDirResult.isSyncIgnored);
		vscode.commands.executeCommand('setContext', 'CodeSyncActivated', true);
		vscode.commands.executeCommand('setContext', 'upgradePricingPlan', false);

		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerSignUp, SignUpHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerLogout, logout));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerSync, SyncHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.triggerUnsync, unSyncHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.trackRepo, trackRepoHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.trackFile, trackFileHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.openSyncIgnore, openSyncIgnoreHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.upgradePlan, upgradePlanHandler));
		context.subscriptions.push(vscode.commands.registerCommand(COMMAND.viewDashboard, viewDashboardHandler));

		const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		statusBarItem.command = COMMAND.triggerUnsync;
		context.subscriptions.push(statusBarItem);

		await setupCodeSync(repoPath);

		if (repoPath) {
			console.log(`Configured repo: ${repoPath}`);
			if (subDirResult.isSubDir) {
				repoPath = subDirResult.parentRepo;
				console.log(`Parent repo: ${repoPath}`);
			}	
		}

		vscode.workspace.onDidChangeTextDocument(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleChangeEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				putLogEvent(e.stack);
			}
		});

		vscode.workspace.onDidCreateFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleCreateEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				putLogEvent(e.stack);
			}
		});

		vscode.workspace.onDidDeleteFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleDeleteEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				putLogEvent(e.stack);
			}
		});

		vscode.workspace.onDidRenameFiles(changeEvent => {
			try {
				const handler = new eventHandler(repoPath);
				handler.handleRenameEvent(changeEvent);
			} catch (e) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				putLogEvent(e.stack);
			}
		});

		recallDaemon(statusBarItem, false);
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		putLogEvent(e.stack);
	}
}

export function deactivate(context: vscode.ExtensionContext) {
	// Empty body for now
}
