import path from "path";
import vscode from 'vscode';
import express from "express";
import { createUser, postSuccessLogin } from "../utils/auth_utils";
import {
    Auth0URLs,
    NOTIFICATION,
    contextVariables,
    staticFiles
} from "../constants";
import { CodeSyncLogger } from "../logger";
import { CODESYNC_STATES, CodeSyncState } from "../utils/state_utils";
import { getActiveUsers } from "../utils/common";
import { createUserWithApi } from "../utils/api_utils";

export const initExpressServer = () => {
    const msgs = {
        OK: "OK",
        TOKEN_VERIFICATION_FAILED: "Token verification failed"
    };
    // Create an express server
    const expressApp = express();
    const port = (global as any).port;

    let staticPath = path.join(__dirname, 'static');
    staticPath = staticPath.replace("out", "src");
    expressApp.use(express.static(staticPath));

    // define a route handler for the default home page
    expressApp.get("/", async (req: any, res: any) => {
        res.send("OK");
    });

    // define a route handler for the authorization callback
    expressApp.get(Auth0URLs.LOGIN_CALLBACK_PATH, async (req: any, res: any) => {
        const files = new staticFiles(__dirname);
        let responseFile = files.LOGIN_SUCCESS;
        try {
            const userResponse = await createUser(req.query.access_token, req.query.id_token);
            if (!userResponse.success) {
                responseFile = files.LOGIN_FAILURE;
            } else if (userResponse.isDeactivated) {
                responseFile = files.DEACTIVATED_ACCOUNT;
            }
            res.sendFile(responseFile);
        } catch (e) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            CodeSyncLogger.critical("Login failed", e.stack);
            res.sendFile(files.LOGIN_FAILURE);
        }
    });

    // define a route handler for the default home page
    expressApp.get(Auth0URLs.REACTIVATE_CALLBACK_PATH, async (req: any, res: any) => {
        const files = new staticFiles(__dirname);
        CodeSyncLogger.debug("Reactivated callback received");
        const accessToken = req.query.access_token;
        const userResponse = await createUserWithApi(accessToken);
        if (userResponse.error) return res.send(msgs.TOKEN_VERIFICATION_FAILED);
        // Verify that accessToken's user is same as logged-in user
        const activeUser = getActiveUsers()[0];
        if (activeUser.email !== userResponse.email) return res.send(msgs.TOKEN_VERIFICATION_FAILED);
        vscode.window.showInformationMessage(NOTIFICATION.REACTIVATED_SUCCESS);
        CodeSyncState.set(CODESYNC_STATES.ACCOUNT_DEACTIVATED, false);
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
