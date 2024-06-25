import * as vscode from 'vscode';


let provider: CodeSyncViewProvider;

export function createWebViewProvider (context: vscode.ExtensionContext) {
    provider = new CodeSyncViewProvider(context.extensionUri);
    return provider;
}

export function updateWebviewContent(content: string) {
    if (provider) {
        provider.updateWebviewContent(content);
    } else {
        console.error('WebView provider is not initialized');
    }
}

export class CodeSyncViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codesyncWebView';

    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
		console.log("resolvingWebView");
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(message => {
            console.log("222", message);
            switch (message.command) {
                case 'openFolder':
                    vscode.commands.executeCommand('vscode.openFolder');
                    break;
                case 'login':
                    vscode.commands.executeCommand('codesync.signup');
                    break;
                case "updateContent":
                    webviewView.webview.html = this.getHtmlForWebview1(webviewView.webview);
                // Handle other commands as needed
            }
        });
    }

    public updateWebviewContent(content: string) {
        console.log("111", content, this._view);
        if (this._view) {
            this._view.webview.html = this.getHtmlForWebview1(this._view.webview);
            // this._view.webview.postMessage({ command: 'updateContent', content });
        }
    }

    private getHtmlForWebview1(webview: vscode.Webview): string {
		console.log("Here1");
        // Construct HTML content for the WebView
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>CodeSync</title>
            </head>
            <body>
            
                <h1>Welcome to CodeSync</h1>`;
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
		console.log("Here");
        // Construct HTML content for the WebView
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>CodeSync</title>
            </head>
            <body>
            
                <h1>Welcome to CodeSync</h1>
                <p>Use the appropriate command to perform actions.</p>
                <button onclick="vscode.postMessage({ command: 'openFolder' })">Open Folder</button>
                <button onclick="vscode.postMessage({ command: 'login' })">Login</button>
                <!-- Add more buttons or links as needed -->
                <script>
                    const vscode = acquireVsCodeApi();
                    window.addEventListener('message', event => {
                        const message = event.data; // The JSON data our extension sent
                        switch (message.command) {
                            case 'openFolder':
                                vscode.postMessage({ command: 'vscode.openFolder' });
                                break;
                            case 'login':
                                vscode.postMessage({ command: 'codesync.signup' });
                                break;
                            // Handle other commands as needed
                        }
                    });
                </script>
            </body>
            </html>`;
    }
}
