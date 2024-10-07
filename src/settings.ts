import path from "path";
import untildify from "untildify";
import { prodConfig } from "./config/prod";
import { stagingConfig } from "./config/staging";
import { devConfig } from "./config/dev";

// Set this to true for Development
const DEBUG = true;
const useStaging = false;
const DevConfig = {
    ROOT_REPO: useStaging ? stagingConfig.ROOT_REPO: devConfig.ROOT_REPO,
    API_HOST: useStaging ? stagingConfig.API_HOST: devConfig.API_HOST,
    WEBAPP_HOST: useStaging ? stagingConfig.WEBAPP_HOST: devConfig.WEBAPP_HOST,
    WEBSOCKET_HOST: useStaging ? stagingConfig.SOCKET_HOST: devConfig.SOCKET_HOST,
    CW_LOGS_GROUP: useStaging ? stagingConfig.CW_LOGS_GROUP: devConfig.CW_LOGS_GROUP,
    AWS_REGION: useStaging ? stagingConfig.AWS_REGION: devConfig.AWS_REGION,
};

// const ProdConfig = {
//     ROOT_REPO: onPrem ? '~/.codesync-on-prem' : '~/.codesync',
//     API_HOST: onPrem ? "http://codesync-api-lb-iy6rm5-366877061.us-east-1.elb.amazonaws.com": "https://api.codesync.com",
//     SOCKET_HOST: onPrem ? "ws:///codesync-api-lb-iy6rm5-366877061.us-east-1.elb.amazonaws.com": "wss://api.codesync.com",
//     WEBAPP_HOST: onPrem ? "http://codesync-webapp-lb-iy6rm5-1152117582.us-east-1.elb.amazonaws.com": "https://www.codesync.com",
//     CW_LOGS_GROUP: onPrem ? "/codesync/plugin-logs" : "client-logs",
//     AWS_REGION: onPrem ? "us-east-1" : "us-east-1"
// };
export const API_HOST = DEBUG ? DevConfig.API_HOST: prodConfig.API_HOST;
export const WEBAPP_HOST = DEBUG ? DevConfig.WEBAPP_HOST : prodConfig.WEBAPP_HOST;

export const systemConfig = {
    ROOT_REPO: DEBUG ? DevConfig.ROOT_REPO : prodConfig.ROOT_REPO,
    API_HOST: API_HOST,
    API_BASE_URL: `${API_HOST}/v1`,
    SOCKET_HOST: DEBUG ? DevConfig.WEBSOCKET_HOST : prodConfig.SOCKET_HOST,
    WEBAPP_HOST: DEBUG ? DevConfig.WEBAPP_HOST : prodConfig.WEBAPP_HOST,
    CW_LOGS_GROUP: DEBUG ? DevConfig.AWS_REGION : prodConfig.AWS_REGION,
    AWS_REGION: DEBUG ? DevConfig.CW_LOGS_GROUP : prodConfig.CW_LOGS_GROUP
};

const LOG_STREAM = DEBUG ? "codesync-dev-common-logs" : "codesync-common-logs";
const PLUGIN_USER_URL = DEBUG ? "https://codesync-public.s3.amazonaws.com/plugin-dev-user.json" : "https://codesync-public.s3.amazonaws.com/plugin-user.json";
export const PLUGIN_USER = { 
    logStream: LOG_STREAM,
    url: PLUGIN_USER_URL
};
export const SYNCIGNORE_URL = "https://codesync-public.s3.amazonaws.com/syncignore.txt";

export const generateSettings = () => {
    /*
    Directory structure goes as:

    .codesync/
        .deleted
        .diffs
            /.vscode
            /.intellij
        .locks/
            daemon.lock
            (This is overall lock across all the IDEs to run PopulateBuffer from Daemon. Only 1 instance of populateBuffer
             should be running across all IDEs)

            vscode.lock 
            (Lock across all the VSCode instances to run handleBuffer from Daemon. Only 1 instance of VSCode should be
             sending diffs to the server)

            pricing.lock (Deprecatd: Will use alerts.lock for all type of alerts)
            (When plan limit is reached, 
                1. Primary IDE instance acquries this lock and set requestSentAt in the state variable. It then retries after
                   3 miuntes to see if the user has upgraded the plan and shows the alert again accordingly. 
                2. Secondary instances that do not send diffs, they watch this lock to show Upgrade Plan alert in their 
                   own windows)
            Note: Above lock files do not contain any data. It depends on the process which acquires the lock. 
        .originals/
        .shadow/
        .tabs/
        alerts.yml (Keeps track of different kind of alerts shown to user)
        config.yml 
        sequence_token.yml 
        user.yml (User credentials)
    */
    // System Directories for CodeSync
    const rootRepo = untildify(systemConfig.ROOT_REPO);
    const systemDirectories = {
        CODESYNC_ROOT: rootRepo,
        DIFFS_REPO: path.join(rootRepo, ".diffs", ".vscode"),
        TABS_PATH: path.join(rootRepo, ".tabs", ".vscode"),
        ORIGINALS_REPO: path.join(rootRepo, ".originals"),
        SHADOW_REPO: path.join(rootRepo, ".shadow"),
        DELETED_REPO: path.join(rootRepo, ".deleted"),
        LOCKS_REPO: path.join(rootRepo, ".locks"),
        S3_UPLOADER: path.join(rootRepo, ".s3_uploader"),
        CONFIG_PATH: path.join(rootRepo, "config.yml"),
        ON_PREM_CONFIG: path.join(rootRepo, "on_prem_config.json"),
        USER_PATH: path.join(rootRepo, "user.yml"),
        SEQUENCE_TOKEN_PATH: path.join(rootRepo, "sequence_token.yml"),
        SYNCIGNORE_PATH: path.join(rootRepo, "syncignore.yml"),
    };
    // Lock Files
    const lockFiles = {
        POPULATE_BUFFER_LOCK_FILE: path.join(rootRepo, ".locks", "daemon.lock"),
        DIFFS_SEND_LOCK_FILE: path.join(rootRepo, ".locks", "vscode.lock")
    };
    const alerts = {
        /*
        For now, we have following data in alerts.yml
            team_activity:
                userEmail:
                    checked_for: '2023-01-11'
                    shown_at: 2023-01-11T14:31:33.086Z
        */
        ALERTS: path.join(rootRepo, "alerts.yml")
    };

    return {
        ...systemDirectories,
        ...lockFiles,
        ...alerts,
        deprecatedFiles: [
            systemDirectories.SEQUENCE_TOKEN_PATH
        ]
    };
};
