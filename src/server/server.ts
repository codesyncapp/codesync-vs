import path from "path";
import express from "express";
import { createUser } from "../utils/auth_utils";
import {
    Auth0URLs,
    staticFiles
} from "../constants";
import {pathUtils} from "../utils/path_utils";
import { CodeSyncLogger } from "../logger";

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

    // start the Express server
    expressApp.listen(port, () => {
        console.log(`server started at ${port}`);
    });
};
