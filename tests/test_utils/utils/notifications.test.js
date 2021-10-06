import fs from "fs";
import vscode from "vscode";
import yaml from "js-yaml";
import untildify from "untildify";

import {getPublicPrivateMsg, NOTIFICATION} from "../../../src/constants";
import {getUserFilePath, randomBaseRepoPath, randomRepoPath, TEST_EMAIL} from "../../helpers/helpers";
import {askPublicPrivate, askToUpdateSyncIgnore, showChooseAccount} from "../../../src/utils/notifications";


describe("showChooseAccount",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {};
    userData[TEST_EMAIL] = {access_token: "ABC"};

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("with no user",  () => {
        fs.writeFileSync(userFilePath, yaml.safeDump({}));
        showChooseAccount(repoPath);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.NO_VALID_ACCOUNT);
    });

    test("with valid user",  () => {
        showChooseAccount(repoPath);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
        // TODO: In case we activate choose account option
        // expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        // expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.CHOOSE_ACCOUNT);
        // expect(vscode.window.showInformationMessage.mock.calls[0][1]).toStrictEqual(TEST_EMAIL);
        // expect(vscode.window.showInformationMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.USE_DIFFERENT_ACCOUNT);
    });

});

describe("askPublicPrivate",  () => {
    const repoPath = randomRepoPath();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("askPublicPrivate",  async () => {
        await askPublicPrivate(repoPath);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        const msg = getPublicPrivateMsg(repoPath);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(msg);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toStrictEqual({ modal: true });
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.PUBLIC);
        expect(vscode.window.showInformationMessage.mock.calls[0][3]).toStrictEqual(NOTIFICATION.PRIVATE);
    });
});
