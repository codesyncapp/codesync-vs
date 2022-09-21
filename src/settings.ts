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
// const ROOT_REPO_NAME = '~/.codesync-local-2';
// export const CODESYNC_WEBSOCKET_HOST = "ws://127.0.0.1:8000";
// export const CODESYNC_HOST = 'http://127.0.0.1:8000';
// export const WEB_APP_URL = "http://localhost:3000";
// export const LOGS_METADATA = {
//     AWS_REGION: 'us-east-1',
//     GROUP: 'client-logs-local'
// };
// export const PLUGIN_USER = {
//     logStream: "codesync-dev-common-logs",
//     url: "https://codesync-public.s3.amazonaws.com/plugin-dev-user.json"
// };

export const generateSettings = () => {
    const rootRepo = untildify(ROOT_REPO_NAME);
    return {
        CODESYNC_ROOT: rootRepo,
        DIFFS_REPO: path.join(rootRepo, ".diffs", ".vscode"),
        ORIGINALS_REPO: path.join(rootRepo, ".originals"),
        SHADOW_REPO: path.join(rootRepo, ".shadow"),
        DELETED_REPO: path.join(rootRepo, ".deleted"),
        LOCKS_REPO: path.join(rootRepo, ".locks"),
        CONFIG_PATH: path.join(rootRepo, "config.yml"),
        USER_PATH: path.join(rootRepo, "user.yml"),
        SEQUENCE_TOKEN_PATH: path.join(rootRepo, "sequence_token.yml"),
        POPULATE_BUFFER_LOCK_FILE: path.join(rootRepo, ".locks", "daemon.lock"),
        DIFFS_SEND_LOCK_FILE: path.join(rootRepo, ".locks", "vscode.lock"),
        PRICING_ALERT_LOCK: path.join(rootRepo, ".locks", "pricing.lock")
    };
};
