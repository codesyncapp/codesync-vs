"use strict";

import path from "path";
import {
	CODESYNC_WEBSOCKET_HOST,
	CODESYNC_HOST,
	WEB_APP_URL
} from "./settings";

export const SYNCIGNORE = ".syncignore";
export const GITIGNORE = ".gitignore";

export const DIFF_SOURCE = 'vscode';
export const DEFAULT_BRANCH = 'default';

// TODO: Use standard .gitignore
export const IGNORABLE_DIRECTORIES = [
	".git",
	"node_modules",
	".DS_Store",
	".idea",
];

export const DATETIME_FORMAT = 'UTC:yyyy-mm-dd HH:MM:ss.l';
export const RESTART_DAEMON_AFTER = 5000;

export const API_ENDPOINT = `${CODESYNC_HOST}/v1`;
export const API_FILES = `${API_ENDPOINT}/files`;
export const API_INIT =  `${API_ENDPOINT}/init`;
export const API_USERS =  `${API_ENDPOINT}/users`;
export const API_HEALTHCHECK = `${CODESYNC_HOST}/healthcheck`;
export const WEBSOCKET_ENDPOINT = `${CODESYNC_WEBSOCKET_HOST}/v2/websocket`;

export const PRICING_URL = `${WEB_APP_URL}/pricing`;
// Diff utils
export const DIFF_FILES_PER_ITERATION = 50;
export const REQUIRED_DIFF_KEYS = ['repo_path', 'branch', 'file_relative_path', 'created_at'];
export const REQUIRED_FILE_RENAME_DIFF_KEYS = ['old_rel_path', 'new_rel_path'];
export const REQUIRED_DIR_RENAME_DIFF_KEYS = ['old_path', 'new_path'];
export const DIFF_SIZE_LIMIT = 16 * 1000 * 1000;
export const SEQUENCE_MATCHER_RATIO = 0.8;

// AWS constants
export const AWS_REGION = 'us-east-1';
export const CLIENT_LOGS_GROUP_NAME = 'client-logs';

// Error msgs
export const CONNECTION_ERROR_MESSAGE = 'Error => Server is not available. Please try again in a moment';

// Auth0
export const MIN_PORT = 49152;
export const MAX_PORT = 65535;
export const Auth0URLs = {
	AUTHORIZE: `${CODESYNC_HOST}/authorize`,
    LOGOUT: `${CODESYNC_HOST}/auth-logout`,
	LOGIN_CALLBACK_PATH: "/login-callback"
};

// Notification Messages
export const NOTIFICATION = {
	JOIN: "Join",
	LOGIN: "Login",
	CONNECT: "Connect",
	IGNORE: 'Ignore',
	YES: "Yes",
	NO: "No",
	CANCEL: "Cancel",
	OK: "OK!",
	CONTINUE: "Continue",
	UPGRADE: "Upgrade",
	TRACK_IT: "View repo on web",
	TRACK_PARENT_REPO: "View parent repo on web",
	OPEN_SYNCIGNORE: "Open .syncignore",
	DISCONNECT_REPO: "Dicsonnect",
	DISCONNECT_PARENT_REPO: "Dicsonnect parent repo",
	WELCOME_MSG: "Welcome to CodeSync!",
	LOGIN_SUCCESS: "Success! Now, switch back to Visual Studio Code to connect your repo.",
	CONNECT_REPO: "Connect your repo with CodeSync",
	CONNECT_AFTER_JOIN: "Successfully logged in to CodeSync. Let's connect your repo",
	CHOOSE_ACCOUNT: "Choose account to sync your repo",
	USE_DIFFERENT_ACCOUNT: "Use different account",
	PUBLIC: "Public",
	PRIVATE: "Private",
	REPO_SYNCED: "Repo synced successfully!",
	SYNC_FAILED: "Ouch! Sync failed. Please try again a moment later",
	REPOS_LIMIT_BREACHED: "Repo size exceeds the limit. Allowed repo size is",
	FILES_LIMIT_BREACHED: "FIles count exceeds the limit.",
	SERVICE_NOT_AVAILABLE: "CodeSync service is unavailable. Please try again in a moment.",
	UPGRADE_PRICING_PLAN: "Please upgrade your plan to continue using CodeSync",
	UPGRADE_ORG_PLAN: "Please upgrade your Organization's plan to continue using CodeSync",
	INIT_CANCELLED: "Init process was cancelled",
	NO_VALID_ACCOUNT: "No valid account found",
	REPO_IN_SYNC: "is in sync with CodeSync.",
	AUTHENTICATION_FAILED: "Authentication failed. You need to login again",
	ERROR_SYNCING_REPO: "Error syncing repo.",
	ERROR_SYNCING_BRANCH: "Error syncing branch",
	REPO_DISCONNECTED: "Repo disconnected successfully",
	REPO_DISCONNECT_FAILED: "Could not disconnect the repo",
	REPO_DISCONNECT_CONFIRMATION: "Are you sure to continue? You won't be able to revert this!",
	REPO_DISCONNECT_PARENT_CONFIRMATION: "Are you sure to disconnect parent repo? You won't be able to revert this!",
	LOGGED_OUT_SUCCESSFULLY: "Successfully logged out!"
};

export const getRepoInSyncMsg = (repoPath: string) => {
    const repoName = path.basename(repoPath);
    return `Repo ${repoName} ${NOTIFICATION.REPO_IN_SYNC}`;
};

export const getDirectoryIsSyncedMsg = (repoPath: string, parentPath: string) => {
	const subDirName = path.basename(repoPath);
	return `You are good to go ✅. Directory ${subDirName} is in sync with CodeSync because parent repo ${parentPath} is in sync.`;
};

export const getDirectorySyncIgnoredMsg = (repoPath: string, parentPath: string) => {
    const subDirName = path.basename(repoPath);
	return `Directory ${subDirName} is syncignored by parent repo at ${parentPath}. To sync this directory, remove it from .syncignore`;
};

export const getPublicPrivateMsg = (repoPath: string) => {
	// Do you want the repo <name> public or private?
	const repoName = path.basename(repoPath);
	return `Do you want the repo ${repoName} public or private? (You can change this later)`;
};

export const STATUS_BAR_MSGS = {
	AUTH_FAILED_SENDING_DIFF: 'Authentication failed while sending diff ',
	DEFAULT: ' CodeSync ✅',
	AUTHENTICATION_FAILED: ' CodeSync ❌, Click to authenticate!',
	SERVER_DOWN: ' CodeSync ❌, Offline',
	GETTING_READY: ' CodeSync => Getting ready',
	NO_REPO_OPEN: ' CodeSync => No project is open',
	CONNECT_REPO: ' CodeSync ❌, Click to connect repo!',
	IS_SYNCIGNORED_SUB_DIR: ' CodeSync ❌, Repo is syncignored and not being synced!',
	NO_CONFIG: ' CodeSync ❌, Reload required!',
	UPGRADE_PRICING_PLAN: ' CodeSync ❌, Click to upgrade pricing plan!',
};

export const COMMAND = {
	triggerSignUp: 'codesync.signup',
	triggerLogout: 'codesync.logout',
	triggerSync: 'codesync.sync',
	triggerDisconnectRepo: 'codesync.disconnectRepo',
	trackRepo: 'codesync.trackRepo',
	trackFile: 'codesync.trackFile',
	openSyncIgnore: 'codesync.openSyncIgnore',
	upgradePlan: 'codesync.upgradePlan',
	viewDashboard: 'codesync.viewDashboard'
};

export class staticFiles {
	LOGIN_SUCCESS: string;
	LOGIN_FAILURE: string;

	constructor(baseRepo: string) {
		const rootPath = baseRepo.replace("out", "src");
		this.LOGIN_SUCCESS = path.join(rootPath, "static", "login-success.html");
		this.LOGIN_FAILURE = path.join(rootPath, "static", "login-failure.html");
	}
}

export const FILE_UPLOAD_WAIT_TIMEOUT = 5 * 60;
export const SYNC_IGNORE_FILE_DATA = "# CodeSync won't sync the files in the .syncignore. It follows same format as .gitignore.";
// Log after 5 min, as daemon restarts after 5s so it will log after 60 iterations
export const LOG_AFTER_X_TIMES = (5 * 60) / 5;
export const RETRY_REQUEST_AFTER = 3 * 60 * 1000; // 1000 is for ms;
export const SOCKET_CONNECT_ERROR_CODES = ["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"];
export const SOCKET_ERRORS = {
	ERROR_MSG_RECEIVE: 'Error receiving socket msg'
};
