import fs from "fs";
import vscode from "vscode";
import fetchMock from "jest-fetch-mock";
import {
    askAndTriggerSignUp,
    createRedirectUri,
    createUser, initExpressServer,
    isPortAvailable,
    logout,
    redirectToBrowser
} from "../../../src/utils/auth_utils";
import {Auth0URLs, LOGIN_SUCCESS_CALLBACK, NOTIFICATION} from "../../../src/constants";
import {randomBaseRepoPath, randomRepoPath, TEST_EMAIL} from "../../helpers/helpers";
import { readYML } from "../../../src/utils/common";
import yaml from "js-yaml";

describe("isPortAvailable",  () => {

    test("random free port", async () => {
        expect(await isPortAvailable(59402)).toBe(true);
    });

    test("server port", async () => {
        expect(await isPortAvailable(8000)).toBe(false);
    });
});

describe("initExpressServer",  () => {
    test("initExpressServer",  () => {
        const port = 1234;
        global.port = port;
        initExpressServer();

        const refUrl = `http://localhost:${port}${LOGIN_SUCCESS_CALLBACK}`;
        const url = createRedirectUri();
        expect(url).toEqual(refUrl);
    });
});

describe("createRedirectUri",  () => {
    test("createRedirectUri",  () => {
        const port = 1234;
        global.port = port;
        const refUrl = `http://localhost:${port}${LOGIN_SUCCESS_CALLBACK}`;
        const url = createRedirectUri();
        expect(url).toEqual(refUrl);
    });
});

describe("redirectToBrowser",  () => {
    test("skipAskConnect=false",  () => {
        redirectToBrowser();
        expect(global.skipAskConnect).toBe(false);
    });
    test("skipAskConnect=true",  () => {
        redirectToBrowser(true);
        expect(global.skipAskConnect).toBe(true);
    });
});

describe("logout",  () => {
    test("Verify Logout URL",  () => {
        const logoutUrl = logout();
        expect(logoutUrl.startsWith(Auth0URLs.LOGOUT)).toBe(true);
    });
});

describe("createUser",  () => {
    const idToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RAY29kZXN5bmMuY29tIn0.bl7QQajhg2IjPp8h0gzFku85qCrXQN4kThoo1AxB_Dc";
    const decodedSample = {
        "email": TEST_EMAIL
    };
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const userFilePath = `${baseRepoPath}/user.yml`;
    const userData = {"dummy_email": {access_token: "ABC"}};

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
    });

    afterEach(() => {
        fs.rmdirSync(repoPath, {recursive: true});
        fs.rmdirSync(baseRepoPath, {recursive: true});
    });

    test("with invalid token", async () => {
        const err = {"error": "Invalid token"};
        fetchMock.mockResponseOnce(JSON.stringify(err));
        await createUser("TOKEN", idToken, repoPath);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
    });

    test("with valid token", async () => {
        const user = {"user": {"id": 1}};
        fetchMock.mockResponseOnce(JSON.stringify(user));
        await createUser("TOKEN", idToken, repoPath, userFilePath);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        const users = readYML(userFilePath);
        expect(TEST_EMAIL in users).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toBe(false);
    });

    test("with user in user.yml", async () => {
        let users = {};
        users[TEST_EMAIL] = {access_token: "abc"};
        fs.writeFileSync(userFilePath, yaml.safeDump(users));
        const user = {"user": {"id": 1}};
        fetchMock.mockResponseOnce(JSON.stringify(user));
        await createUser("TOKEN", idToken, repoPath, userFilePath);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        users = readYML(userFilePath);
        expect(TEST_EMAIL in users).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toBe(false);
    });
});


describe("askAndTriggerSignUp",  () => {
    test("askAndTriggerSignUp", () => {
        askAndTriggerSignUp();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showWarningMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.AUTHENTICATION_FAILED);
        expect(vscode.window.showWarningMessage.mock.calls[0][1]).toStrictEqual(NOTIFICATION.LOGIN);
        expect(vscode.window.showWarningMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.IGNORE);
    });
});
