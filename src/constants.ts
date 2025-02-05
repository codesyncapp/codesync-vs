"use strict";

import path from "path";
import vscode from 'vscode';

import { generateApiUrl, generateApiHostUrl, generateSocketUrl } from "./utils/url_utils";
import { IApiRoutes } from "./interface";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export const VERSION = vscode.extensions.getExtension('codesync.codesync').packageJSON.version;

export const SYNCIGNORE = ".syncignore";
export const GITIGNORE = ".gitignore";

export const VSCODE = 'vscode';
export const DEFAULT_BRANCH = 'default';

export const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const DATETIME_FORMAT = 'UTC:yyyy-mm-dd HH:MM:ss.l';
export const RESTART_DAEMON_AFTER = 5 * 1000;

export const API_PATH = {
	REPOS: "/repos"
};

export const apiRoutes = (): IApiRoutes => {
	return {
		HEALTHCHECK: generateApiHostUrl("/healthcheck"),
		FILES: generateApiUrl("/files"),
		REPO_INIT: generateApiUrl("/init"),
		REPOS: generateApiUrl(API_PATH.REPOS),
		USERS: generateApiUrl("/users"),
		USER_ORGANIZATIONS: generateApiUrl("/orgs"),
		REACTIVATE_ACCOUNT: generateApiUrl("/users/reactivate"),
		USER_SUBSCRIPTION: generateApiUrl("/users/subscription"),
		DIFFS_WEBSOCKET: generateSocketUrl("/v2/websocket"),
		TEAM_ACTIVITY: generateApiUrl("/team_activity", true),
		USER_PRICING: generateApiUrl("/pricing/subscription")
	};
};
// Auth0
export const MIN_PORT = 49152;
export const MAX_PORT = 65535;
export const Auth0URLs = {
	LOGIN_CALLBACK_PATH: "/login-callback",
	LOGOUT_CALLBACK_PATH: "/logout-callback",
	REACTIVATE_CALLBACK_PATH: "/reactivate-callback"
};

// Diff utils
export const DIFF_FILES_PER_ITERATION = 30;
export const REQUIRED_DIFF_KEYS = ['repo_path', 'branch', 'file_relative_path', 'created_at'];
export const REQUIRED_FILE_RENAME_DIFF_KEYS = ['old_rel_path', 'new_rel_path'];
export const REQUIRED_DIR_RENAME_DIFF_KEYS = ['old_path', 'new_path'];
export const DIFF_SIZE_LIMIT = 16 * 1000 * 1000;
export const SEQUENCE_MATCHER_RATIO = 0.8;

// Tab utils
export const TAB_FILES_PER_ITERATION = 15;
export const REQUIRED_KEYS_TAB_FILE_YML = ['repository_id', 'created_at', 'file_name', 'tabs', 'source'];
export const TAB_SIZE_LIMIT = 16 * 1000 * 1000;

// Error msgs
export const CONNECTION_ERROR_MESSAGE = 'Error => Server is not available. Please try again in a moment';

export const NOTIFICATION_BUTTON = {
	REACTIVATE_ACCOUNT: "Reactivate Account",
	RECONNECT_REPO: "Reconnect Repo",
	TRY_PRO_FOR_FREE: "Try Pro plan for free",
	TRY_TEAM_FOR_FREE: "Try Team plan for free",
	UPGRADE_TO_PRO: "Upgrade to Pro plan",
	UPGRADE_TO_TEAM: "Upgrade to Team plan",
	REPO_IS_PERSONAL: "Repo is personal"
};

// Notification Messages
export const NOTIFICATION = {
	LOGIN: "Login",
	REQUEST_DEMO: "Request a demo",
	CONNECT: "Connect",
	IGNORE: 'Ignore',
	YES: "Yes",
	NO: "No",
	CANCEL: "Cancel",
	OK: "OK!",
	CONTINUE: "Continue",
	UPGRADE: "Upgrade",
	VIEW_DASHBOARD: "View Dashboard",
	REVIEW_TEAM_PLAYBACK: "Review Team Playback",
	REVIEW_PLAYBACK: "Review Playback",
	TRACK_IT: "View this repo on the web",
	TRACK_PARENT_REPO: "View parent repo on web",
	OPEN_SYNCIGNORE: "Open .syncignore",
	DISCONNECT_REPO: "Dicsonnect",
	DISCONNECT_PARENT_REPO: "Dicsonnect parent repo",
	WELCOME_MSG: "Welcome to CodeSync!",
	REQUEST_MSG_FOR_DEMO: "Please submit the Sign-Up Request Form on Webapp. We will notify you once your request is approved.",
	REACTIVATED_SUCCESS: "Successfully reactivated your account",
	CONNECT_REPO: "Connect your repo with CodeSync",
	CHOOSE_ACCOUNT: "Choose account to sync your repo",
	USE_DIFFERENT_ACCOUNT: "Use different account",
	PUBLIC: "Public",
	PRIVATE: "Private",
	REPO_CONNECTED: "Repo connected successfully!",
	REPO_CONNECTE_FAILED: "Repo could not be connected. Please try again a moment later",
	SERVICE_NOT_AVAILABLE: "CodeSync service is unavailable. Please try again in a moment.",
	UPGRADE_PRICING_PLAN: "Please upgrade your plan to continue using CodeSync",
	UPGRADE_ORG_PLAN: "Please upgrade your Organization's plan to continue using CodeSync",
	UPGRADE_TO_PRO: "Upgrade to Pro plan",
	TRY_PRO_FOR_FREE: "Try Pro plan for free",
	CONNECT_REPO_CANCELLED: "'Connect Repo' process was cancelled",
	NO_VALID_ACCOUNT: "No valid account found",
	WAITING_FOR_LOGIN_CONFIRMATION: "Waiting for login confirmation from CodeSync...",
	REPO_IN_SYNC: "is in sync with CodeSync.",
	REPO_IS_DISCONNECTED: "is disconnected.",
	AUTHENTICATION_FAILED: "Authentication failed. You need to login again",
	ERROR_CONNECTING_REPO: "Error connecting repo.",
	ERROR_SYNCING_BRANCH: "Error syncing branch",
	REPO_DISCONNECT_FAILED: "Could not disconnect the repo",
	REPO_RECONNECT_FAILED: "Could not reconnect the repo",
	REPO_DISCONNECT_CONFIRMATION: "Are you sure to continue? Your changes won't sync anymore!",
	REPO_DISCONNECT_PARENT_CONFIRMATION: "Are you sure to disconnect parent repo? Your changes won't sync anymore!",
	LOGGED_OUT_SUCCESSFULLY: "Successfully logged out!",
	TEAM_ACTIVITY_ALERT: "Hope you had a great day! It's time to get in sync with your team's code.",
	USER_ACTIVITY_ALERT: "Hope you had a great day! Shall we review today's code playback?",
	SIGNUP_FAILED: "Sign up to CodeSync failed!",
	ACCOUNT_DEACTIVATED: "Your account has been deactivated. Please click 'Reactivate Account' below to resume syncing.",
	FREE_TIER_LIMIT_REACHED: "We hope you've found CodeSync useful. You'have hit the limit of Free tier for repo",
	PRIVATE_REPO_COUNT_LIMIT_REACHED: "In the Free plan, you can have just one Private Repository",
	ASK_ORG_REPO: "Would you like to add this repository to any of the following organizations?",
	ASK_TEAM_REPO: "Which team should this repository be added to?"
};

export const getRepoInSyncMsg = (repoPath: string) => {
	const repoName = path.basename(repoPath);
	return `Repo "${repoName}" ${NOTIFICATION.REPO_IN_SYNC}`;
};

export const getDisconnectedRepoMsg = (repoPath: string) => {
	const repoName = path.basename(repoPath);
	return `Repo "${repoName}" ${NOTIFICATION.REPO_IS_DISCONNECTED}`;
};

export const getRepoDisconnectedMsg = (repoPath: string) => {
	const repoName = path.basename(repoPath);
	return `Repo "${repoName}" disconnected successfully`;
};

export const getRepoReconnectedMsg = (repoPath: string) => {
	const repoName = path.basename(repoPath);
	return `Repo "${repoName}" reconnected successfully`;
};

export const getUpgradePlanMsg = (repoPath: string, isNewPrivateRepo: boolean) => {
	const title = isNewPrivateRepo ? NOTIFICATION.PRIVATE_REPO_COUNT_LIMIT_REACHED : `${NOTIFICATION.FREE_TIER_LIMIT_REACHED} ${repoPath}`;
	return `${title}. ${NOTIFICATION.UPGRADE_PRICING_PLAN}`;
};

export const getConnectRepoMsgAfterJoin = (email: string) => {
	return `Successfully logged in to CodeSync with ${email}. Let's connect your repo`;
};

export const getSubDirectoryInSyncMsg = (repoPath: string, parentPath: string) => {
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

export const ERROR_SENDING_DIFFS = {
	REPO_SIZE_LIMIT_REACHED: "Failed sending diff: Repo-Size Limit has been reached!",
	AUTH_FAILED_SENDING_DIFF: 'Error sending diffs: Authentication Failed!',
	DEACTIVATED_ACCOUNT_FOUND: 'Error sending diffs: Account is Deactivated!',
};

export const STATUS_BAR_MSGS = {
	DEFAULT: ' CodeSync ✅',
	WAITING_FOR_LOGIN: ' CodeSync $(loading~spin) Waiting for Login confirmation...',
	AUTHENTICATION_FAILED: ' CodeSync ❌ Click to authenticate!',
	ACCOUNT_DEACTIVATED: ' CodeSync ❌ Click to reactivate your account!',
	SERVER_DOWN: ' CodeSync ❌ Offline',
	GETTING_READY: ' CodeSync $(loading~spin)',
	NO_REPO_OPEN: ' CodeSync => No project is open',
	CONNECT_REPO: ' CodeSync ❌ Click to connect repo!',
	RECONNECT_REPO: ' CodeSync ❌ Click to reconnect repo!',
	IS_SYNCIGNORED_SUB_DIR: ' CodeSync ❌ Repo is syncignored and not being synced!',
	NO_CONFIG: ' CodeSync ❌ Reload required!',
	UPGRADE_PRICING_PLAN: ' CodeSync ❌ Click to upgrade pricing plan!',
	UPGRADE_PRICING_PLAN_FOR_FREE: ' CodeSync ❌ Click to upgrade pricing plan for free!',
	USER_ACTIVITY_ALERT: "CodeSync 🔁 Click to review your activity today!",
	TEAM_ACTIVITY_ALERT: "CodeSync 🔁 Click to review your team's activity today!",
	UPLOADING_BRANCH: ' CodeSync $(loading~spin) Uploading files...'
};

export const COMMAND = {
	triggerSignUp: 'codesync.signup',
	triggerRequestADemo: 'codesync.requestDemo',
	reactivateAccount: 'codesync.accountReactivate',
	triggerLogout: 'codesync.logout',
	triggerSync: 'codesync.sync',
	triggerDisconnectRepo: 'codesync.disconnectRepo',
	triggerReconnectRepo: 'codesync.reconnectRepo',
	trackRepo: 'codesync.trackRepo',
	trackFile: 'codesync.trackFile',
	openSyncIgnore: 'codesync.openSyncIgnore',
	upgradePlan: 'codesync.upgradePlan',
	viewDashboard: 'codesync.viewDashboard',
	viewActivity: 'codesync.viewActivity',
};

export const contextVariables = {
	showLogIn: "showLogIn",
	showConnectRepoView: "showConnectRepoView",
	showReactivateAccount: "showReactivateAccount",
	isSubDir: "isSubDir",
	isSyncIgnored: "isSyncIgnored",
	isDisconnectedRepo: "isDisconnectedRepo",
	upgradePricingPlan: "upgradePricingPlan",
	canAvailTrial: "canAvailTrial",
	codesyncActivated: "CodeSyncActivated",
	setContext: "setContext"
};

export class staticFiles {
	DEACTIVATED_ACCOUNT: string;
	REACTIVATED_ACCOUNT: string;
	fileNames = {
		deactivatedAccount: "deactivated-account.html",
		reactivatedAccount: "reactivated-account.html"
	}

	constructor(baseRepo: string) {
		const rootPath = baseRepo.replace("out", "src");
		const basePath = path.join(rootPath, "static");
		this.DEACTIVATED_ACCOUNT = path.join(basePath, this.fileNames.deactivatedAccount);
		this.REACTIVATED_ACCOUNT = path.join(basePath, this.fileNames.reactivatedAccount);
	}
}

export const ECONNREFUSED = "ECONNREFUSED";

export const FILE_UPLOAD_WAIT_TIMEOUT = 5 * 60;
export const SYNC_IGNORE_FILE_DATA = "# CodeSync won't sync the files in the .syncignore. It follows same format as .gitignore.";
// Log after 5 min, as daemon restarts after 5s so it will log after 60 iterations
export const LOG_AFTER_X_TIMES = (5 * 60) / 5;
export const RETRY_REQUEST_AFTER = 3 * 60 * 1000; // 1000 is for ms;
export const SHOW_PLAN_UPGRADE_MSG_AFTER = 5 * RETRY_REQUEST_AFTER;
export const RETRY_TEAM_ACTIVITY_REQUEST_AFTER = 5 * 60 * 1000; // 1000 is for ms;
export const BRANCH_SYNC_TIMEOUT = 3 * 60 * 1000; // 1000 is for ms
export const S3_UPLOADER_TIMEOUT = 10 * 60 * 1000; // 1000 is for ms
export const S3_UPLOADR_RETRY_AFTER = 5 * 60 * 1000; // 1000 is for ms
export const RUN_POPULATE_BUFFER_AFTER = 5 * 60 * 1000; // 1000 is for ms;
export const RUN_POPULATE_BUFFER_CURRENT_REPO_AFTER = 10 * 60 * 1000; // 1000 is for ms;
export const RUN_DELETE_HANDLER_AFTER = 5 * 60 * 1000; // 1000 is for ms;
export const AUTHENTICATION_TIMEOUT = 5 * 60 * 1000; // 1000 is for ms
export const SOCKET_CONNECT_ERROR_CODES = [ECONNREFUSED, "ETIMEDOUT", "ECONNRESET"];
export const SOCKET_ERRORS = {
	ERROR_MSG_RECEIVE: 'Error receiving socket msg'
};
export const DAY = 24 * 60 * 60 * 1000;
export const RETRY_WEBSOCKET_CONNECTION_AFTER = 3 * 60 * 1000; // 1000 is for ms;
export const GLOB_TIME_TAKEN_THRESHOLD = 2;
export const UPDATE_SYNCIGNORE_AFTER = 7 * 24 * 60 * 60 * 1000;  // 1 week
export const IGNORE_ACQUIRED_LOCK_TIMEOUT = 5 * 1000;
export const FORCE_UPLOAD_FROM_DAEMON = DAY;  // 1 day
export const FORCE_CONNECT_WEBSOCKET_AFTER = 30 * 60 * 1000; // 1000 is for ms;

export const HttpStatusCodes = {
	OK: 200,
	INVALID_USAGE: 400,
	UNAUTHORIZED: 401,
	PAYMENT_REQUIRED: 402,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	SERVER_ERROR: 500,
	USER_ACCOUNT_DEACTIVATED: 403
};

export const WebPaths = {
	PRICING: "/pricing",
	AUTH: "/signup",
	REQUEST_DEMO: "/request-a-demo",
	LOGOUT: "/logout",
	USER_PROFILE_SETTINGS: "/settings"
};
