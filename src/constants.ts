"use strict";

import {CODESYNC_DOMAIN, CODESYNC_HOST, WEB_APP_URL} from "./settings";

export const SYNCIGNORE = ".syncignore";
export const GITIGNORE = ".gitignore";

export const DIFF_SOURCE = 'vs-code';
export const DEFAULT_BRANCH = 'default';
export const GIT_REPO = '.git/';

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
export const WEBSOCKET_ENDPOINT = `ws://${CODESYNC_DOMAIN}/v1/websocket`;
export const LOGIN_SUCCESS_CALLBACK = "/login-success";

export const PLANS_URL = `${WEB_APP_URL}/plans`;
// Diff utils
export const DIFF_FILES_PER_ITERATION = 50;
export const REQUIRED_DIFF_KEYS = ['repo_path', 'branch', 'file_relative_path', 'created_at'];
export const REQUIRED_FILE_RENAME_DIFF_KEYS = ['old_abs_path', 'new_abs_path', 'old_rel_path', 'new_rel_path'];
export const REQUIRED_DIR_RENAME_DIFF_KEYS = ['old_path', 'new_path'];
export const DIFF_SIZE_LIMIT = 16 * 1000 * 1000;
export const SEQUENCE_MATCHER_RATIO = 0.8;
export const FILE_SIZE_AS_COPY = 100; // 100 bytes

// AWS constants
export const AWS_REGION = 'us-east-1';
export const CLIENT_LOGS_GROUP_NAME = 'client-logs';

// Error msgs
export const CONNECTION_ERROR_MESSAGE = 'Error => Server is not available. Please try again in a moment';

// Auth0
export const Auth0URLs = {
	AUTHORIZE: `${CODESYNC_HOST}/authorize`,
    LOGOUT: `${CODESYNC_HOST}/auth-logout`,
    LOGIN_SUCCESS_CALLBACK: "/login-success",
	// Pre defined ports
	PORTS: [
		49160,
		49165,
		49170,
		49175,
		49180,
		50100,
		50105,
		50110,
		50115,
		50120
	]
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
	TRACK_IT: "Track it",
	UNSYNC_REPO: "Unsync",
	WELCOME_MSG: "Welcome to CodeSync!",
	LOGIN_SUCCESS: "Successfully Authenticated. Please check your IDE for further instructions",
	CONNECT_REPO: "Connect your repo with CodeSync",
	CONNECT_AFTER_JOIN: "Successfully logged in to CodeSync. Let's connect your repo",
	CHOOSE_ACCOUNT: "Choose account to sync your repo",
	USE_DIFFERENT_ACCOUNT: "Use differnet account",
	PUBLIC_OR_PRIVATE: "Do you want to make the repo public?",
	REPO_SYNCED: "Repo synced successfully!",
	BRANCH_SYNCED: "Branch synced successfully!",
	UPDATE_SYNCIGNORE: "Add files in .syncignore you don't want to sync and save it!",
	SYNC_FAILED: "Ouch! Sync failed. Please try again a moment later",
	REPOS_LIMIT_BREACHED: "Repo size exceeds the limit. Allowed repo size is",
	FILES_LIMIT_BREACHED: "FIles count exceeds the limit.",
	SERVICE_NOT_AVAILABLE: "Service is unavailable. Please try again in a moment.",
	UPGRADE_PLAN: `Upgrade your plan: ${PLANS_URL}`,
	INIT_CANCELLED: "Init process was cancelled",
	NO_VALID_ACCOUNT: "No valid account found",
	REPO_IN_SYNC: "Repo is in sync with CodeSync.",
	AUTHENTICATION_FAILED: "Authentication failed. You need to login again",
	ERROR_SYNCING_REPO: "Error syncing repo.",
	ERROR_SYNCING_BRANCH: "Error syncing branch",
	REPO_UNSYNCED: "Repo disconnected successfully",
	REPO_UNSYNC_FAILED: "Could not unsync the repo",
	REPO_UNSYNC_CONFIRMATION: "Are you sure to continue? You won't be able to revert this!",
};

export const STATUS_BAR_MSGS = {
	ERROR_SENDING_DIFF: 'Error sending diff => Authentication failed',
	DEFAULT: 'CodeSync => Watching changes',
	SYNCING: 'CodeSync => Syncing changes',
	AUTHENTICATION_FAILED: 'CodeSync => Authentication failed. Click to Login!',
	SERVER_DOWN: 'CodeSync => Offline',
	GETTING_READY: 'CodeSync => Getting ready',
	NO_REPO_OPEN: 'CodeSync => No project is open',
	CONNECT_REPO: 'CodeSync => Click to connect repo!'
};

export const COMMAND = {
	triggerSignUp: 'codesync.signup',
	triggerSync: 'codesync.sync',
	triggerUnsync: 'codesync.unsync',
	trackRepo: 'codesync.trackRepo',
	trackFile: 'codesync.trackFile'
};
