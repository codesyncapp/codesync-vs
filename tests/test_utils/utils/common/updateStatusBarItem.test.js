import vscode from "vscode";
import {updateStatusBarItem} from "../../../../src/utils/common";
import {COMMAND, STATUS_BAR_MSGS} from "../../../../src/constants";

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

test('updateStatusBarItem', () => {
    updateStatusBarItem(statusBarItem, "text");
    expect(statusBarItem.text).toEqual("text");
    expect(statusBarItem.command).toEqual(undefined);
});

test('updateStatusBarItem for Auth Failed', () => {
    updateStatusBarItem(statusBarItem, STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
    expect(statusBarItem.text).toEqual(STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
    expect(statusBarItem.command).toEqual(COMMAND.triggerSignUp);
});

test('updateStatusBarItem with Connect Repo', () => {
    updateStatusBarItem(statusBarItem, STATUS_BAR_MSGS.CONNECT_REPO);
    expect(statusBarItem.text).toEqual(STATUS_BAR_MSGS.CONNECT_REPO);
    expect(statusBarItem.command).toEqual(COMMAND.triggerSync);
});
