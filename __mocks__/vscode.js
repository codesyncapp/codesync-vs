const languages = {
    createDiagnosticCollection: jest.fn()
};

const StatusBarAlignment = {};

const window = {
    createStatusBarItem: jest.fn(() => ({
        show: jest.fn()
    })),
    showErrorMessage: jest.fn(() => ({
        then: jest.fn()
    })),
    showWarningMessage: jest.fn(() => ({
        then: jest.fn()
    })),
    showInformationMessage: jest.fn(() => ({
        then: jest.fn()
    })),
    createTextEditorDecorationType: jest.fn(),
    showTextDocument: jest.fn(() => ({
        then: jest.fn()
    }))
};

Object.defineProperty(window, 'activeTextEditor', {
    get: jest.fn(() => undefined),
    set: jest.fn(),
    configurable: true
});

const workspace = {
    getConfiguration: jest.fn(),
    workspaceFolders: [],
    onDidSaveTextDocument: jest.fn(),
    createFileSystemWatcher: jest.fn(() => ({
        onDidCreate: jest.fn()
    })),
    onDidChangeTextDocument: jest.fn(),
    onDidCreateFiles: jest.fn(),
    onDidDeleteFiles: jest.fn(),
    onDidRenameFiles: jest.fn(),
    openTextDocument: jest.fn(() => ({
        then: jest.fn()
    }))
};

Object.defineProperty(workspace, 'rootPath', {
    get: jest.fn(() => undefined),
    set: jest.fn(),
    configurable: true
});

const OverviewRulerLane = {
    Left: null
};

const Uri = {
    file: f => f,
    parse: jest.fn()
};
const Range = jest.fn();
const Diagnostic = jest.fn();
const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };

const debug = {
    onDidTerminateDebugSession: jest.fn(),
    startDebugging: jest.fn()
};

const commands = {
    executeCommand: jest.fn(),
    registerCommand: jest.fn()
};

const env = {
    openExternal: jest.fn()
};

const ExtensionContext = {
    subscriptions: []
};

const extensions = {
    getExtension: jest.fn(() => {
        return {
            packageJSON: {
                version: "version"
            }
        };
    })
};

const vscode = {
    languages,
    StatusBarAlignment,
    window,
    workspace,
    OverviewRulerLane,
    Uri,
    Range,
    Diagnostic,
    DiagnosticSeverity,
    debug,
    commands,
    env,
    ExtensionContext,
    extensions
};

module.exports = vscode;
