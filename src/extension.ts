'use strict';

import * as vscode from 'vscode';
console.log(1);
import * as branchName from 'current-git-branch';
console.log(2);
console.log("branchName: ", branchName());

export function activate(context: vscode.ExtensionContext) {
	// const disposable = vscode.commands.registerCommand('extension.reverseWord', function () {
		// Get the active text editor
		const editor = vscode.window.activeTextEditor;
		const repoName = vscode.workspace.name;
		const repoPath = vscode.workspace.rootPath;
		
		console.log("repoName: ", repoName);
		console.log("rootPath: ", repoPath);
		
		if (editor) {
			vscode.workspace.onDidChangeTextDocument(changeEvent => {
				if (changeEvent.contentChanges.length) {
					// If you only care about changes to the active editor's text,
					//  just check to see if changeEvent.document matches the active editor's document.
					const filePath = changeEvent.document.fileName;
					const text = changeEvent.document.getText();
					console.log('fileName: ', filePath);
					console.log(`Did change: ${text}`);
					if (repoPath) {
						const relPath = filePath.split(`${repoPath}/`)[1];
						console.log("rootPath: ", relPath);
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