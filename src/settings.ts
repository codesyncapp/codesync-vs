import path from "path";
import untildify from "untildify";

const ROOT_REPO_NAME = '~/.codesync';
export const CODESYNC_WEBSOCKET_HOST = "wss://api.codesync.com";
export const CODESYNC_HOST = "https://api.codesync.com";
export const WEB_APP_URL = "https://www.codesync.com";
// AWS constants
export const LOGS_METADATA = {
    AWS_REGION: 'us-east-1',
    GROUP: 'client-logs',
};
export const PLUGIN_USER = {
    logStream: "codesync-common-logs",
    url: "https://codesync-public.s3.amazonaws.com/plugin-user.json",
};

// TODO: Figure out better way to use dev values
// const ROOT_REPO_NAME = '~/.codesync-local';
// export const CODESYNC_WEBSOCKET_HOST = "ws://127.0.0.1:8000";
// export const CODESYNC_HOST = 'http://127.0.0.1:8000';
// export const WEB_APP_URL = "http://localhost:3000";
// export const LOGS_METADATA = {
//     AWS_REGION: 'us-east-1',
//     GROUP: 'client-logs-dev'
// };
// export const PLUGIN_USER = {
//     logStream: "codesync-dev-common-logs",
//     url: "https://codesync-public.s3.amazonaws.com/plugin-dev-user.json"
// };

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
        CONFIG_PATH: path.join(rootRepo, "config.yml"),
        USER_PATH: path.join(rootRepo, "user.yml"),
        SEQUENCE_TOKEN_PATH: path.join(rootRepo, "sequence_token.yml"),
    };
    // Lock Files
    const lockFiles = {
        POPULATE_BUFFER_LOCK_FILE: path.join(rootRepo, ".locks", "daemon.lock"),
        DIFFS_SEND_LOCK_FILE: path.join(rootRepo, ".locks", "vscode.lock"),
        UPGRADE_PLAN_ALERT: path.join(rootRepo, ".locks", "pricing.lock"),
    };
    const alerts = {
        /*
        Keeping 
        1- alert name as key 
        2- last-shown-at as value

        We can have following data in alerts.yml 
            team_activity: '2022-07-05 16:30:27.210'
            user_activity: '2022-07-05 16:30:27.210'
            upgrade_plan: '2022-07-05 21:51:27.210'
        */
        ALERTS: path.join(rootRepo, "alerts.yml")
    };
    return {
        ...systemDirectories,
        ...lockFiles,
        ...alerts
    };
};
