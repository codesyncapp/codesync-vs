import path from "path";
import untildify from "untildify";

// Set this to true for Development
const DEBUG = true;
const useStaging = false;
const DevConfig = {
    ROOT_REPO: useStaging ? '~/.codesync-staging': '~/.codesync-local',
    WEBSOCKET_HOST: useStaging ? 'wss://api-staging.codesync.com': 'ws://localhost:8000',
    CODESYNC_HOST: useStaging ? 'https://api-staging.codesync.com': 'http://localhost:8000',
    WEB_APP_URL: useStaging ? "https://staging.codesync.com": "http://localhost:3000"
};

const ROOT_REPO_NAME = DEBUG ? DevConfig.ROOT_REPO : '~/.codesync';
export const CODESYNC_WEBSOCKET_HOST = DEBUG ? DevConfig.WEBSOCKET_HOST : "wss://api.codesync.com";
export const CODESYNC_HOST = DEBUG ? DevConfig.CODESYNC_HOST: "https://api.codesync.com";
export const WEB_APP_URL = DEBUG ? DevConfig.WEB_APP_URL : "https://www.codesync.com";
export const LOGS_METADATA = {
    AWS_REGION: 'us-east-1',
    GROUP: DEBUG ? 'client-logs-dev' : 'client-logs'
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
    const rootRepo = untildify(ROOT_REPO_NAME);
    const systemDirectories = {
        CODESYNC_ROOT: rootRepo,
        DIFFS_REPO: path.join(rootRepo, ".diffs", ".vscode"),
        ORIGINALS_REPO: path.join(rootRepo, ".originals"),
        SHADOW_REPO: path.join(rootRepo, ".shadow"),
        DELETED_REPO: path.join(rootRepo, ".deleted"),
        LOCKS_REPO: path.join(rootRepo, ".locks"),
        S3_UPLOADER: path.join(rootRepo, ".s3_uploader"),
        CONFIG_PATH: path.join(rootRepo, "config.yml"),
        USER_PATH: path.join(rootRepo, "user.yml"),
        SEQUENCE_TOKEN_PATH: path.join(rootRepo, "sequence_token.yml"),
        SYNCIGNORE_PATH: path.join(rootRepo, "syncignore.yml"),
        TABS_PATH: path.join(rootRepo, ".tabs")
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
