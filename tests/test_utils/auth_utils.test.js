import fs from "fs";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from "untildify";
import fetchMock from "jest-fetch-mock";
import {
    askAndTriggerSignUp,
    createUser,
    isPortAvailable,
    postSuccessLogout
} from "../../src/utils/auth_utils";
import { logoutHandler } from "../../src/handlers/user_commands";
import { Auth0URLs, contextVariables, NOTIFICATION, WebPaths } from "../../src/constants";
import { createRedirectUri, generateWebUrl, generateRequestDemoUrl, appendGAparams } from "../../src/utils/url_utils";
import {
    addUser,
    getUserFilePath,
    INVALID_TOKEN_JSON,
    randomBaseRepoPath,
    randomRepoPath,
    TEST_EMAIL,
    waitFor,
    AUTH0_TEST_ID_TOKEN,
    setWorkspaceFolders
} from "../helpers/helpers";
import { readYML } from "../../src/utils/common";
import { initExpressServer } from "../../src/server/server";
import { getSystemConfig } from "../../src/utils/setup_utils";


describe("isPortAvailable",  () => {

    test("random free port", async () => {
        expect(await isPortAvailable(59402)).toBe(true);
    });
    
    // TODO: Won't run on GitHub Actions
    // test("server port", async () => {
    //     expect(await isPortAvailable(8000)).toBe(false);
    // });
});

describe("initExpressServer",  () => {

    test("initExpressServer",  () => {
        const port = 1234;
        global.port = port;
        initExpressServer();
        const refUrl = `http://localhost:${port}${Auth0URLs.LOGIN_CALLBACK_PATH}`;
        const url = createRedirectUri();
        expect(url).toEqual(refUrl);
    });
});

describe("createRedirectUri",  () => {

    const baseRepoPath = randomBaseRepoPath();
    
    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
    });

    test("createRedirectUri",  () => {
        const port = 1234;
        global.port = port;
        const refUrl = `http://localhost:${port}${Auth0URLs.LOGIN_CALLBACK_PATH}`;
        const url = createRedirectUri();
        expect(url).toEqual(refUrl);
    });
});

describe("generateRequestDemoUrl",  () => {

    const baseRepoPath = randomBaseRepoPath();
    let url = "";

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        url = generateRequestDemoUrl();
    });


    test("url should have valid path",  async () => {
        expect(url.includes(WebPaths.REQUEST_DEMO)).toBe(true);
    });

    test("url should have valid domain",  async () => {
        expect(url.includes(getSystemConfig().WEBAPP_HOST)).toBe(true);
    });

    test("url should have proper params",  async () => {
        expect(url.includes("utm_medium=plugin")).toBe(true);
        expect(url.includes("utm_source=vscode")).toBe(true);
    });

    test("url should have proper pattern",  async () => {
        expect(url).not.toBeNull();
        expect(url).toBeDefined();

        const expectedUrl = getSystemConfig().WEBAPP_HOST + WebPaths.REQUEST_DEMO;
        expect(url).toEqual(`${appendGAparams(expectedUrl)}`);
    });
});

describe("logoutHandler",  () => {
    let userFilePath = '';
    const baseRepoPath = randomBaseRepoPath();

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        userFilePath = addUser(baseRepoPath);
    });

    afterEach(() => {
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Verify Logout URL",  async () => {
        const logoutUrl = logoutHandler();
        expect(logoutUrl.startsWith(generateWebUrl(WebPaths.LOGOUT))).toBe(true);
        // Mocking Server Callback here
        postSuccessLogout();
        // Verify user has been marked as inActive in user.yml
        const users = readYML(userFilePath);
        expect(users[TEST_EMAIL].is_active).toBe(false);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual("showLogIn");
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toBe(true);
        await waitFor(2);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.LOGGED_OUT_SUCCESSFULLY);
    });
});


describe("createUser",  () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {"dummy_email": {access_token: "ABC"}};

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        setWorkspaceFolders(repoPath);
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(userFilePath, yaml.dump(userData));
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("with invalid token", async () => {
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        await createUser("TOKEN", AUTH0_TEST_ID_TOKEN);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
    });

    test("with valid token and user not in user.yml", async () => {
        const user = {"user": {"id": 1, "email": TEST_EMAIL}};
        fetchMock.mockResponseOnce(JSON.stringify(user));
        global.skipAskConnect = false;
        await createUser("TOKEN", AUTH0_TEST_ID_TOKEN);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        const users = readYML(userFilePath);
        expect(TEST_EMAIL in users).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(3);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toBe(false);
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showReactivateAccount);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toBe(false);
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toBe(true);
    });

    test("with user in user.yml", async () => {
        let users = {};
        users[TEST_EMAIL] = {access_token: "abc"};
        fs.writeFileSync(userFilePath, yaml.dump(users));
        const user = {"user": {"id": 1}};
        fetchMock.mockResponseOnce(JSON.stringify(user));
        await createUser("TOKEN", AUTH0_TEST_ID_TOKEN);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(0);
        users = readYML(userFilePath);
        expect(TEST_EMAIL in users).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(3);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.showLogIn);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toBe(false);
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.showReactivateAccount);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toBe(false);
        expect(vscode.commands.executeCommand.mock.calls[2][0]).toStrictEqual("setContext");
        expect(vscode.commands.executeCommand.mock.calls[2][1]).toStrictEqual(contextVariables.showConnectRepoView);
        expect(vscode.commands.executeCommand.mock.calls[2][2]).toBe(true);
    });
});

describe("askAndTriggerSignUp",  () => {

    const baseRepoPath = randomBaseRepoPath();
    
    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
    });

    test("askAndTriggerSignUp", () => {
        askAndTriggerSignUp();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toStrictEqual(NOTIFICATION.AUTHENTICATION_FAILED);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toStrictEqual(NOTIFICATION.LOGIN);
        expect(vscode.window.showErrorMessage.mock.calls[0][2]).toStrictEqual(NOTIFICATION.IGNORE);
    });
});
