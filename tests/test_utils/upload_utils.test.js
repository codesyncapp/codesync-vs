import fs from "fs";
import vscode from "vscode";
import path from "path";
import untildify from "untildify";
import fetchMock from "jest-fetch-mock";
import {
    INVALID_TOKEN_JSON, 
    PRE_SIGNED_URL, 
    randomRepoPath, 
    randomBaseRepoPath, 
    TEST_REPO_RESPONSE,
    REPO_UPLOAD_402,
    PRIVATE_REPO_UPLOAD_402,
    getConfigFilePath,
    Config,
    setWorkspaceFolders,
    USER_REPO_CAN_AVAIL_TRIAL, 
    USER_REPO_PLAN_INFO,
    ORG_REPO_PLAN_INFO,
    ORG_REPO_CAN_AVAIL_TRIAL
} from "../helpers/helpers";
import {uploadFile, uploadFileTos3, uploadFileToServer, uploadRepoToServer} from "../../src/utils/upload_utils";
import { generateServerUrl } from "../../src/utils/url_utils";
import {
    API_ROUTES,
    DEFAULT_BRANCH, 
    HttpStatusCodes, 
    getUpgradePlanMsg,
    NOTIFICATION_BUTTON,
    contextVariables,
    API_PATH,
    NOTIFICATION
} from "../../src/constants";
import { formatDatetime } from "../../src/utils/common";
import { createSystemDirectories } from "../../src/utils/setup_utils";

describe('uploadRepoToServer', () => {
    let baseRepoPath;
    let repoPath;

    beforeEach(() => {
        fetch.resetMocks();
        baseRepoPath = randomBaseRepoPath();
        repoPath = randomRepoPath();
        untildify.mockReturnValue(baseRepoPath);
    });

    const assertAPICall = (token="ACCESS_TOKEN") => {
        // Assert API call
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.REPO_INIT);
        const options = fetch.mock.calls[0][1];
        expect(options.method).toStrictEqual('POST');
        expect(options.headers).toStrictEqual({
            'Content-Type': 'application/json',
            'Authorization': `Basic ${token}`
        });
        return true;
    };

    test('Invalid token', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const res = await uploadRepoToServer("INVALID_TOKEN", {});
        expect(res.error).toBe(INVALID_TOKEN_JSON.error.message);
        expect(res.response).toStrictEqual({});
        expect(assertAPICall("INVALID_TOKEN")).toBe(true);
    });

    test('Valid response', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(TEST_REPO_RESPONSE));
        const res = await uploadRepoToServer("ACCESS_TOKEN", {});
        expect(res.error).toBe("");
        expect(res.response).toStrictEqual(TEST_REPO_RESPONSE);
        expect(assertAPICall()).toBe(true);
    });

    test('null response', async () => {
        fetchMock.mockResponseOnce(null);
        const res = await uploadRepoToServer("ACCESS_TOKEN", {});
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
    });
});

describe('uploadRepoToServer: Payment Errors', () => {
    let baseRepoPath;
    let repoPath;

    const repoId = 1234;

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        baseRepoPath = randomBaseRepoPath();
        repoPath = randomRepoPath();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        fs.mkdirSync(repoPath, {recursive: true});
        setWorkspaceFolders(repoPath);
        const configPath = getConfigFilePath(baseRepoPath);
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
    });

    afterEach(() => {
        fs.rmSync(repoPath, {recursive: true, force: true});
        fs.rmSync(baseRepoPath, {recursive: true, force: true});
    });

    const assertAPICall = (token="ACCESS_TOKEN") => {
        // Assert API call
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.REPO_INIT);
        const options = fetch.mock.calls[0][1];
        expect(options.method).toStrictEqual('POST');
        expect(options.headers).toStrictEqual({
            'Content-Type': 'application/json',
            'Authorization': `Basic ${token}`
        });
        return true;
    };

    const assertgetPlanInfoAPICall = (token="ACCESS_TOKEN") => {
        const url = generateServerUrl(`${API_PATH.REPOS}/${repoId}/upgrade_plan`);
        expect(fetch.mock.calls[1][0]).toStrictEqual(url);
        const options = fetch.mock.calls[1][1];
        expect(options.headers).toStrictEqual({
            'Authorization': `Basic ${token}`
        });
        return true;
    };

    test('Payment Required: New Repo', async () => {        
        fetchMock.mockResponseOnce(JSON.stringify(REPO_UPLOAD_402), { status: HttpStatusCodes.PAYMENT_REQUIRED });
        const res = await uploadRepoToServer("ACCESS_TOKEN", { repo_path: repoPath });
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
        const msg = getUpgradePlanMsg(repoPath, false);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toBe(NOTIFICATION_BUTTON.UPGRADE_TO_PRO);
    });

    test('Payment Required: More than 1 Private Repos', async () => {        
        fetchMock.mockResponseOnce(JSON.stringify(PRIVATE_REPO_UPLOAD_402), { status: HttpStatusCodes.PAYMENT_REQUIRED });
        const res = await uploadRepoToServer("ACCESS_TOKEN", { repo_path: repoPath });
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
        const msg = getUpgradePlanMsg(repoPath, true);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toBe(NOTIFICATION_BUTTON.UPGRADE_TO_PRO);
    });

    test('Payment Required: Brnach Upload for currently opened User Repo', async () => {        
        fetchMock
            .mockResponseOnce(JSON.stringify(REPO_UPLOAD_402), { status: HttpStatusCodes.PAYMENT_REQUIRED })
            .mockResponseOnce(JSON.stringify(USER_REPO_PLAN_INFO));
        const res = await uploadRepoToServer("ACCESS_TOKEN", { repo_path: repoPath }, repoId);
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
        expect(assertgetPlanInfoAPICall()).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(2);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.canAvailTrial);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
        let msg = NOTIFICATION.FREE_TIER_LIMIT_REACHED;
		const subMsg = NOTIFICATION.UPGRADE_PRICING_PLAN;
		msg = `${msg} ${repoPath}. ${subMsg}`;
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toBe(NOTIFICATION_BUTTON.UPGRADE_TO_PRO);
    });

    test('Payment Required: Brnach Upload for UserRepo, canAvtailTrial', async () => {        
        fetchMock
            .mockResponseOnce(JSON.stringify(REPO_UPLOAD_402), { status: HttpStatusCodes.PAYMENT_REQUIRED })
            .mockResponseOnce(JSON.stringify(USER_REPO_CAN_AVAIL_TRIAL));
        const res = await uploadRepoToServer("ACCESS_TOKEN", { repo_path: repoPath }, repoId);
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
        expect(assertgetPlanInfoAPICall()).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(2);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.canAvailTrial);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
        let msg = NOTIFICATION.FREE_TIER_LIMIT_REACHED;
		const subMsg = NOTIFICATION.UPGRADE_PRICING_PLAN;
		msg = `${msg} ${repoPath}. ${subMsg}`;
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toBe(NOTIFICATION_BUTTON.TRY_PRO_FOR_FREE);
    });

    test('Payment Required: Brnach Upload for currently opened Org Repo', async () => {        
        fetchMock
            .mockResponseOnce(JSON.stringify(REPO_UPLOAD_402), { status: HttpStatusCodes.PAYMENT_REQUIRED })
            .mockResponseOnce(JSON.stringify(ORG_REPO_PLAN_INFO));
        const res = await uploadRepoToServer("ACCESS_TOKEN", { repo_path: repoPath }, repoId);
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
        expect(assertgetPlanInfoAPICall()).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(2);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.canAvailTrial);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(false);
		const subMsg = NOTIFICATION.UPGRADE_ORG_PLAN;
		const msg = `${NOTIFICATION.FREE_TIER_LIMIT_REACHED} ${repoPath}. ${subMsg}`;
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toBe(NOTIFICATION_BUTTON.UPGRADE_TO_TEAM);
    });

    test('Payment Required: Brnach Upload for OrgRepo, canAvailTrial', async () => {        
        fetchMock
            .mockResponseOnce(JSON.stringify(REPO_UPLOAD_402), { status: HttpStatusCodes.PAYMENT_REQUIRED })
            .mockResponseOnce(JSON.stringify(ORG_REPO_CAN_AVAIL_TRIAL));
        const res = await uploadRepoToServer("ACCESS_TOKEN", { repo_path: repoPath }, repoId);
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
        expect(assertgetPlanInfoAPICall()).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(2);
        expect(vscode.commands.executeCommand.mock.calls[0][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[0][1]).toStrictEqual(contextVariables.upgradePricingPlan);
        expect(vscode.commands.executeCommand.mock.calls[0][2]).toStrictEqual(true);
        expect(vscode.commands.executeCommand.mock.calls[1][0]).toStrictEqual(contextVariables.setContext);
        expect(vscode.commands.executeCommand.mock.calls[1][1]).toStrictEqual(contextVariables.canAvailTrial);
        expect(vscode.commands.executeCommand.mock.calls[1][2]).toStrictEqual(true);
		const subMsg = NOTIFICATION.UPGRADE_ORG_PLAN;
		const msg = `${NOTIFICATION.FREE_TIER_LIMIT_REACHED} ${repoPath}. ${subMsg}`;
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toBe(NOTIFICATION_BUTTON.TRY_TEAM_FOR_FREE);
    });

    test('Payment Required: Brnach Upload for non-opened OrgRepo', async () => {
        const currentRepoPath = randomRepoPath();
        setWorkspaceFolders(currentRepoPath);
        fetchMock
            .mockResponseOnce(JSON.stringify(REPO_UPLOAD_402), { status: HttpStatusCodes.PAYMENT_REQUIRED })
            .mockResponseOnce(JSON.stringify(ORG_REPO_CAN_AVAIL_TRIAL));
        const res = await uploadRepoToServer("ACCESS_TOKEN", { repo_path: repoPath }, repoId);
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
        expect(assertgetPlanInfoAPICall()).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(0);
		const subMsg = NOTIFICATION.UPGRADE_ORG_PLAN;
		const msg = `${NOTIFICATION.FREE_TIER_LIMIT_REACHED} ${repoPath}. ${subMsg}`;
        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage.mock.calls[0][0]).toBe(msg);
        expect(vscode.window.showErrorMessage.mock.calls[0][1]).toBe(NOTIFICATION_BUTTON.TRY_TEAM_FOR_FREE);
    });

});

describe('uploadFile', () => {
    beforeEach(() => {
        fetch.resetMocks();
        const baseRepoPath = randomBaseRepoPath();
        untildify.mockReturnValue(baseRepoPath);
    });

    const assertAPICall = (token="ACCESS_TOKEN") => {
        // Assert API call
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.FILES);
        const options = fetch.mock.calls[0][1];
        expect(options.method).toStrictEqual('POST');
        expect(options.headers).toStrictEqual({
            'Content-Type': 'application/json',
            'Authorization': `Basic ${token}`
        });
        return true;
    };

    test('Invalid token', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON));
        const res = await uploadFile("INVALID_TOKEN", {});
        expect(res.error).toBe(INVALID_TOKEN_JSON.error.message);
        expect(res.response).toStrictEqual({});
        expect(assertAPICall("INVALID_TOKEN")).toBe(true);
    });

    test('Valid response', async () => {
        const response = {id: 1234, url: "url"};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFile("ACCESS_TOKEN", {});
        expect(res.error).toBe("");
        expect(res.response.id).toBe(response.id);
        expect(res.response.url).toBe(response.url);
        expect(assertAPICall()).toBe(true);
    });

    test('null response', async () => {
        fetchMock.mockResponseOnce(null);
        const res = await uploadFile("ACCESS_TOKEN", {});
        expect(res.error).toBeTruthy();
        expect(res.response).toStrictEqual({});
        expect(assertAPICall()).toBe(true);
    });
});

describe('uploadFileTos3', () => {
    let repoPath;
    let baseRepoPath;
    let filePath;

    beforeEach(() => {
        fetch.resetMocks();
        function FormDataMock() {
            this.append = jest.fn();
        }
        global.FormData = FormDataMock;
        repoPath = randomRepoPath();
        baseRepoPath = randomBaseRepoPath();
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(repoPath, {recursive: true});
        fs.mkdirSync(baseRepoPath, {recursive: true});
        createSystemDirectories();
        filePath = path.join(repoPath, "file.txt");
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test('Non Existing File', async () => {
        const res = await uploadFileTos3("INVALID_FILE_PATH", "");
        expect(res.error).toBeTruthy();
    });

    test('Valid response', async () => {
        fs.writeFileSync(filePath, "12345");
        const resp = await uploadFileTos3(filePath, PRE_SIGNED_URL);
        expect(resp.error).toStrictEqual(null);
    });

    test('InValid response', async () => {
        fs.writeFileSync(filePath, "12345");
        const resp = await uploadFileTos3(filePath, {url: "http://localhost:8005", fields: {}});
        expect(resp.error).toBeTruthy();
    });

});

describe('uploadFileToServer', () => {
    const repoPath = randomRepoPath();
    const filePath = path.join(repoPath, "file.txt");

    beforeEach(() => {
        fetch.resetMocks();
        fs.mkdirSync(repoPath, {recursive: true});
        fs.writeFileSync(filePath, "");
        const baseRepoPath = randomBaseRepoPath();
        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
    });

    const assertAPICall = (token="ACCESS_TOKEN") => {
        // Assert API call
        expect(fetch.mock.calls[0][0]).toStrictEqual(API_ROUTES.FILES);
        const options = fetch.mock.calls[0][1];
        expect(options.method).toStrictEqual('POST');
        expect(options.headers).toStrictEqual({
            'Content-Type': 'application/json',
            'Authorization': `Basic ${token}`
        });
        return true;
    };

    test('Auth Error', async () => {
        fetchMock.mockResponseOnce(JSON.stringify(INVALID_TOKEN_JSON), { status: 401 });
        const res = await uploadFileToServer("ACCESS_TOKEN", 12345, DEFAULT_BRANCH, filePath,
            "file.txt", formatDatetime());
        expect(res.error.endsWith(INVALID_TOKEN_JSON.error.message)).toBe(true);
        expect(res.statusCode).toStrictEqual(401);
        expect(assertAPICall()).toBe(true);
    });

    test('Branch not found', async () => {
        const error = {"error": {"message": "Branch not found"}};
        fetchMock.mockResponseOnce(JSON.stringify(error), { status: 404 });
        const res = await uploadFileToServer("ACCESS_TOKEN", 12345, DEFAULT_BRANCH, filePath,
            "file.txt", formatDatetime());
        expect(res.statusCode).toStrictEqual(404);
        expect(assertAPICall()).toBe(true);
    });

    test('Empty file: fileInfo.size = 0', async () => {
        const response = {id: 1234, url: PRE_SIGNED_URL};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFileToServer("ACCESS_TOKEN", 6789, DEFAULT_BRANCH, filePath,
            "file.txt", formatDatetime());
        expect(res.fileId).toStrictEqual(response.id);
        expect(res.error).toStrictEqual(null);
        expect(assertAPICall()).toBe(true);
        expect(res.statusCode).toStrictEqual(200);
    });

    test('InValid response', async () => {
        fs.rmSync(filePath);
        fs.writeFileSync(filePath, "Dummy Content Is In The File");
        const response = {error: {message: "ERROR msg"}};
        fetchMock.mockResponseOnce(JSON.stringify(response), { status: 500 });
        const res = await uploadFileToServer("ACCESS_TOKEN", 6789, DEFAULT_BRANCH, filePath,
            "file.txt", formatDatetime());
        expect(res.fileId).toStrictEqual(response.id);
        expect(res.error).toBeTruthy();
        expect(assertAPICall()).toBe(true);
        expect(res.statusCode).toStrictEqual(500);
    });

    test('Valid file', async () => {
        fs.rmSync(filePath);
        fs.writeFileSync(filePath, "Dummy Content Is In The File");
        const response = {id: 1234, url: PRE_SIGNED_URL};
        fetchMock.mockResponseOnce(JSON.stringify(response));
        const res = await uploadFileToServer("ACCESS_TOKEN", 6789, DEFAULT_BRANCH, filePath,
            "file.txt", formatDatetime());
        expect(res.fileId).toStrictEqual(response.id);
        expect(res.error).toStrictEqual(null);
        expect(assertAPICall()).toBe(true);
        expect(res.statusCode).toStrictEqual(200);
    });
});
