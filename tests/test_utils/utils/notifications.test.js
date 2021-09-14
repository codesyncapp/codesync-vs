import fs from "fs";
import vscode from "vscode";
import {NOTIFICATION} from "../../../src/constants";
import {randomBaseRepoPath, randomRepoPath, TEST_EMAIL} from "../../helpers/helpers";
import yaml from "js-yaml";
import {askPublicPrivate, askToUpdateSyncIgnore, showChooseAccount} from "../../../src/utils/notifications";
import untildify from "untildify";


describe("showChooseAccount",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const userFilePath = `${baseRepoPath}/user.yml`;
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
        fs.rmdirSync(repoPath, {recursive: true});
        fs.rmdirSync(baseRepoPath, {recursive: true});
    });

    test("with no user",  () => {
        fs.writeFileSync(userFilePath, yaml.safeDump({}));
        showChooseAccount(repoPath);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.NO_VALID_ACCOUNT);
    });

    test("with valid user",  () => {
        showChooseAccount(repoPath);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.CHOOSE_ACCOUNT);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toStrictEqual(TEST_EMAIL);
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.USE_DIFFERENT_ACCOUNT);
    });

});

describe("askPublicPrivate",  () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("askPublicPrivate",  async () => {
        await askPublicPrivate();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.PUBLIC_OR_PRIVATE);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toStrictEqual({ modal: true });
        expect(vscode.window.showInformationMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.YES);
        expect(vscode.window.showInformationMessage.mock.calls[0][3]).toStrictEqual(NOTIFICATION.NO);
    });
});


describe("askToUpdateSyncIgnore",  () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("New .syncignore",  async () => {
        const selection = await askToUpdateSyncIgnore(false);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.SYNC_IGNORE_CREATED);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toStrictEqual(NOTIFICATION.OK);
    });

    test(".syncignore exists",  async () => {
        const selection = await askToUpdateSyncIgnore(true);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.UPDATE_SYNCIGNORE);
        expect(vscode.window.showInformationMessage.mock.calls[0][1]).toStrictEqual(NOTIFICATION.OK);
    });

});
