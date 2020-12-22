'use strict';

import * as vscode from 'vscode';
import * as branchName from 'current-git-branch';
import * as FS from 'fs';

const CODESYNC_ROOT = '/usr/local/bin/.codesync';


export function activate(context: vscode.ExtensionContext) {
	// const disposable = vscode.commands.registerCommand('extension.reverseWord', function () {
		// Get the active text editor
		const editor = vscode.window.activeTextEditor;
		const repoName = vscode.workspace.name;
		const repoPath = vscode.workspace.rootPath;
		const branch = branchName({ altPath: repoPath });
		
		console.log("repoName: ", repoName);
		console.log("rootPath: ", repoPath);
		console.log("branchName: ", branch);
		
		if (editor) {
			vscode.workspace.onDidChangeTextDocument(changeEvent => {
				if (changeEvent.contentChanges.length) {
					// If you only care about changes to the active editor's text,
					//  just check to see if changeEvent.document matches the active editor's document.
					const filePath = changeEvent.document.fileName;
					const text = changeEvent.document.getText();
					console.log('fileName: ', filePath);
					// console.log(`Did change: ${text}`);
					if (repoPath) {
						const relPath = filePath.split(`${repoPath}/`)[1];
						const shadowPath = `${CODESYNC_ROOT}/${repoName}/${branch}/${relPath}`;
						console.log("relPath: ", relPath);
						console.log("shadowPath: ", shadowPath);
						console.log('ShadowExists: ', FS.existsSync(shadowPath));
						if (FS.existsSync(shadowPath)) {
							// Do something
						}
					}			
					// for (const change of changeEvent.contentChanges) {
						// console.log(change.range, 'range'); // range of text being replaced
						// console.log(change.text, 'text'); // text replacement
					// }	
				}
			});
		}
	// });

	// context.subscriptions.push(disposable);
}