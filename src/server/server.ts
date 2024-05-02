import path from "path";
import vscode from 'vscode';
import express from "express";
import cors from "cors";
import { createUser, postSuccessLogout } from "../utils/auth_utils";
import {
    Auth0URLs,
    NOTIFICATION,
    contextVariables,
    staticFiles
} from "../constants";
import { CodeSyncLogger } from "../logger";
import { CODESYNC_STATES, CodeSyncState } from "../utils/state_utils";
import { createUserWithApi } from "../utils/api_utils";
import { UserState } from "../utils/user_utils";
import { WEB_APP_URL } from "../settings";
import { generateWebUrl } from "../utils/url_utils";

export const initExpressServer = () => {
    const msgs = {
        OK: "OK",
        TOKEN_VERIFICATION_FAILED: "Token verification failed",
        ACCESS_TOKEN_NOT_FOUND: "Access token not found"
    };
    // Create an express server
    const expressApp = express();
    const port = (global as any).port;

    let staticPath = path.join(__dirname, 'static');
    staticPath = staticPath.replace("out", "src");
    expressApp.use(express.static(staticPath));
    expressApp.use(cors());

    // define a route handler for the default home page
    expressApp.get("/", async (req: any, res: any) => {
        res.send("OK");
    });

    // define a route handler for the authorization callback
    expressApp.get(Auth0URLs.LOGIN_CALLBACK_PATH, async (req: any, res: any) => {
        if (!req.query.access_token || !req.query.id_token) return res.send(msgs.ACCESS_TOKEN_NOT_FOUND);
        try {
            await createUser(req.query.access_token, req.query.id_token);
        } catch (e) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            CodeSyncLogger.critical("Login callback failed", e.stack);
        }
        const redirectURL = generateWebUrl("", {type: "login"});
        // http://localhost:3000/?utm_medium=plugin&utm_source=vscode&type=login
        res.redirect(redirectURL);
    });

    expressApp.get(Auth0URLs.LOGOUT_CALLBACK_PATH, async (req: any, res: any) => {
        if (!req.query.access_token) return res.send(msgs.ACCESS_TOKEN_NOT_FOUND);
        const userResponse = await createUserWithApi(req.query.access_token);
        if (userResponse.error) return res.send(msgs.TOKEN_VERIFICATION_FAILED);
        // Verify that accessToken's user is same as logged-in user
        const userState = new UserState();
		const activeUser = userState.getUser();
        if (activeUser && activeUser.email !== userResponse.email) return res.send(msgs.TOKEN_VERIFICATION_FAILED);
        postSuccessLogout();
        const redirectURL = generateWebUrl("", {type: "logout"});
        // http://localhost:3000/?utm_medium=plugin&utm_source=vscode&type=logout
        res.redirect(redirectURL);
    });

    // define a route handler for the default home page
    expressApp.get(Auth0URLs.REACTIVATE_CALLBACK_PATH, async (req: any, res: any) => {
        const files = new staticFiles(__dirname);
        CodeSyncLogger.debug("Reactivated callback received");
        const accessToken = req.query.access_token;
        const userResponse = await createUserWithApi(accessToken);
        if (userResponse.error) return res.send(msgs.TOKEN_VERIFICATION_FAILED);
        // Verify that accessToken's user is same as logged-in user
        const userState = new UserState();
		const activeUser = userState.getUser();
        if (activeUser && activeUser.email !== userResponse.email) return res.send(msgs.TOKEN_VERIFICATION_FAILED);
        vscode.window.showInformationMessage(NOTIFICATION.REACTIVATED_SUCCESS);
        userState.setValidAccount();
        CodeSyncState.set(CODESYNC_STATES.WEBSOCKET_ERROR_OCCURRED_AT, false);
        vscode.commands.executeCommand('setContext', contextVariables.showLogIn, false);
        vscode.commands.executeCommand('setContext', contextVariables.showReactivateAccount, false);
        res.sendFile(files.REACTIVATED_ACCOUNT);
    });
    
    // start the Express server
    expressApp.listen(port, () => {
        console.log(`server started at ${port}`);
    });
};
