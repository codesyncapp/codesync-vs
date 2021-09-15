import path from "path";
import vscode from "vscode";
import express from "express";
import { createUser } from "../utils/auth_utils";
import {
    Auth0URLs,
    staticFiles
} from "../constants";

export const initExpressServer = () => {
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
        const repoPath = vscode.workspace.rootPath || "";
        const files = new staticFiles(__dirname);
        try {
            await createUser(req.query.access_token, req.query.id_token, repoPath);
            res.sendFile(files.LOGIN_SUCCESS);
        } catch (e) {
            res.sendFile(files.LOGIN_FAILURE);
        }
    });

    // start the Express server
    expressApp.listen(port, () => {
        console.log(`server started at ${port}`);
    });
};
