"use strict";

import untildify =  require('untildify');
import * as authConfig from "./config.json";

export const CODESYNC_ROOT = untildify('~/.codesync');
export const DIFFS_REPO = `${CODESYNC_ROOT}/.diffs/.vscode`;
export const ORIGINALS_REPO = `${CODESYNC_ROOT}/.originals`;
export const SHADOW_REPO = `${CODESYNC_ROOT}/.shadow`;
export const DELETED_REPO = `${CODESYNC_ROOT}/.deleted`;
export const CONFIG_PATH = `${CODESYNC_ROOT}/config.yml`;
export const USER_PATH = `${CODESYNC_ROOT}/user.yml`;
export const SEQUENCE_TOKEN_PATH = `${CODESYNC_ROOT}/sequence_token.yml`;

export const SYNCIGNORE = ".syncignore";
export const GITIGNORE = ".gitignore";


export const DIFF_SOURCE = 'vs-code';
export const DEFAULT_BRANCH = 'default';
export const GIT_REPO = '.git/';

// TODO: Use standard .gitignore
export const IGNOREABLE_REPOS = [
	".git",
	"node_modules",
	".DS_Store",
	".idea",
];

export const DATETIME_FORMAT = 'UTC:yyyy-mm-dd HH:MM:ss.l';
export const RESTART_DAEMON_AFTER = 5000;

// export const CODESYNC_DOMAIN = '127.0.0.1:8000';
// export const CODESYNC_HOST = 'http://127.0.0.1:8000';
export const CODESYNC_DOMAIN = "codesync-server.herokuapp.com";
export const CODESYNC_HOST = 'https://codesync-server.herokuapp.com';
export const API_ENDPOINT = `${CODESYNC_HOST}/v1`;
export const API_FILES = `${API_ENDPOINT}/files`;
export const API_INIT =  `${API_ENDPOINT}/init`;
export const API_USERS =  `${API_ENDPOINT}/users`;
export const API_HEALTHCHECK = `${CODESYNC_HOST}/healthcheck`;
export const WEBSOCKET_ENDPOINT = `ws://${CODESYNC_DOMAIN}/v1/websocket`;

export const PLANS_URL = `${CODESYNC_HOST}/plans`;
// Diff utils
export const DIFF_FILES_PER_ITERATION = 50;
export const REQUIRED_DIFF_KEYS = ['repo_path', 'branch', 'file_relative_path', 'created_at'];
export const REQUIRED_FILE_RENAME_DIFF_KEYS = ['old_abs_path', 'new_abs_path', 'old_rel_path', 'new_rel_path'];
export const REQUIRED_DIR_RENAME_DIFF_KEYS = ['old_path', 'new_path'];
export const DIFF_SIZE_LIMIT = 16 * 1000 * 1000;

// AWS constants
export const AWS_REGION = 'us-east-1';
export const CLIENT_LOGS_GROUP_NAME = 'client-logs';

// Error msgs
export const CONNECTION_ERROR_MESSAGE = 'Error => Server is not available. Please try again in a moment';
export const INVALID_TOKEN_MESSAGE = 'Error => Auth token provided is invalid';
export const ERROR_SYNCING_REPO = "Error syncing repo/branch.";

// Auth0 
export const Auth0URLs = {
	AUTHORIZE: "https://codesyncapp.us.auth0.com/authorize",
	GET_TOKEN: "https://codesyncapp.us.auth0.com/oauth/token",
	LOGOUT: "https://codesyncapp.us.auth0.com/v2/logout?federated",
	CLIENT_KEY: authConfig.clientKey,
	CLIENT_SECRET: authConfig.clientSecret,
	REDIRECT_URI: "http://localhost",
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
	CONTINUE: "Continue",
	WELCOME_MSG: "Welcome to CodeSync!",
	LOGIN_SUCCESS: "Successfully Authenticated. Please check your IDE for further instructions",
	CONNECT_REPO: "Connect your repo with CodeSync",
	CONNECT_AFTER_JOIN: "Successfully logged in to CodeSync. Let's connect your repo",
	CHOOSE_ACCOUNT: "Choose account to sync your repo",
	USE_DIFFERENT_ACCOUNT: "Use differnet account",
	PUBLIC_OR_PRIVATE: "Do you want to make the repo public?",
	REPO_SYNCED: "Successfully synced the repo",
	BRANCH_SYNCED: "Successfully synced the branch",
	UPDATE_SYNCIGNORE: "Add files in .syncignore you don't wnat to sync",
	SYNC_FAILED: "Ouch! Sync failed. Please try again a moment later",
	REPOS_LIMIT_BREACHED: `Repo size exceeds the limit. Allowed repo size is`,
	FILES_LIMIT_BREACHED: `FIles count exceeds the limit.`,
	SERVICE_NOT_AVAILABLE: "Service is unavailable. Please try again in a moment.",
	UPGRADE_PLAN: `Upgrade your plan: ${PLANS_URL}`,
	INIT_CANCELLED: "Init process was cancelled",
	NO_VALID_ACCOUNT: "No valid account found",
	REPO_IN_SYNC: "Repo is in sync with CodeSync",
	AUTHENTICATION_FAILED: "Authentication failed. You need to login again"
};

export const COMMAND = {
	triggerSignUp: 'codesync.signup',
	triggerSync: 'codesync.sync',
	triggerUnsync: 'codesync.unsync'
};