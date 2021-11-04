import fs from "fs";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from "untildify";
import fetchMock from "jest-fetch-mock";

import {getPublicPrivateMsg, NOTIFICATION} from "../../src/constants";
import {
    addUser,
    getConfigFilePath,
    getUserFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    TEST_EMAIL
} from "../helpers/helpers";
import {askPublicPrivate, showChooseAccount} from "../../src/utils/notifications";


describe("showChooseAccount",  () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(configPath, yaml.safeDump({repos: {}}));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("with no user",  () => {
        showChooseAccount(repoPath);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.NO_VALID_ACCOUNT);
    });

    test("with no active user",  () => {
        addUser(baseRepoPath, false);
        showChooseAccount(repoPath);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.NO_VALID_ACCOUNT);
    });

    test("with valid user",  async () => {
        addUser(baseRepoPath);
        const user = {
            "email": TEST_EMAIL,
            "plan": {
                REPO_COUNT: 5
            },
            "repo_count": 4
        };
        fetchMock
            .mockResponseOnce(JSON.stringify({ status: true }))
            .mockResponseOnce(JSON.stringify(user));
        const handler = await showChooseAccount(repoPath);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        expect(handler.accessToken).toStrictEqual("ACCESS_TOKEN");
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
