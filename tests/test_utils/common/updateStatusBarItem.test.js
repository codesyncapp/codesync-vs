import vscode from "vscode";
import untildify from "untildify";
import {updateStatusBarItem} from "../../../src/utils/common";
import {COMMAND, STATUS_BAR_MSGS} from "../../../src/constants";
import {bufferHandler} from "../../../src/codesyncd/handlers/buffer_handler";
import {randomBaseRepoPath} from "../../helpers/helpers";


describe("updateStatusBarItem", () => {
    const baseRepoPath = randomBaseRepoPath();
    untildify.mockReturnValue(baseRepoPath);

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

    test('Random Text', () => {
        const handler = new bufferHandler(statusBarItem);
        handler.updateStatusBarItem("text");
        expect(statusBarItem.text).toEqual("text");
        expect(statusBarItem.command).toEqual(undefined);
    });

    test('Auth Failed', () => {
        const handler = new bufferHandler(statusBarItem);
        handler.updateStatusBarItem(STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
        expect(statusBarItem.text).toEqual(STATUS_BAR_MSGS.AUTHENTICATION_FAILED);
        expect(statusBarItem.command).toEqual(COMMAND.triggerSignUp);
    });

    test('Connect Repo', () => {
        const handler = new bufferHandler(statusBarItem);
        handler.updateStatusBarItem(STATUS_BAR_MSGS.CONNECT_REPO);
        expect(statusBarItem.text).toEqual(STATUS_BAR_MSGS.CONNECT_REPO);
        expect(statusBarItem.command).toEqual(COMMAND.triggerSync);
    });
});

