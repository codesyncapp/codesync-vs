export interface IDiff {
	repo_path: string;
	branch: string;
	commit_hash: string | null;
	file_relative_path: string;
	created_at: string;
	added_at: string;
	source: string;
	diff: string;
	is_binary?: boolean;
	is_rename?: boolean;
	is_dir_rename?: boolean;
	is_new_file?: boolean;
	is_deleted?: boolean;
}

export interface IRepoDiffs {
	repoPath: string;
	file_to_diff: IFileToDiff[];
}

export interface IFileToDiff {
	file_path: string;
	diff: IDiff;
}

export interface IFileToUpload {
	file_path: string,
	rel_path: string,
	is_binary: boolean,
	size: number | undefined,
	created_at: number | undefined,
	modified_at: number | undefined
}

export interface IUser {
	email: string;
	access_token: string;
}

export interface IUserProfile {
	access_token: string;
	access_key: string;
	secret_key: string;
	is_active: string;
}

export interface IWebSocketMessage {
	type: string;
	utf8Data: string;
}

export interface IDiffToSend {
	'file_id': number;
	'path': string;
	'diff': string;
	'is_deleted': boolean | undefined;
	'is_rename': boolean | undefined;
	'is_binary': boolean | undefined;
	'created_at': string;
	'diff_file_path': string;
	'source': string;
	'platform': string
}

export interface IRepoInfo {
	last_synced_at: string;
}

export interface IS3UploaderFile {
	repo_path: string;
	branch: string;
	file_path_and_urls: any;
	locked_by?: string;
	locked_at?: number;
	run_count: number;
}

export interface IS3UploaderPreProcess {
	deleteFile: boolean;
	skip: boolean;
	content: IS3UploaderFile;
}

export interface IRepoState {
	IS_OPENED: boolean;
	IS_CONNECTED: boolean;
	IS_DISCONNECTED: boolean;
	IS_SUB_DIR: boolean;
	IS_SYNC_IGNORED: boolean;
	PARENT_REPO_PATH: string;
}

export interface IRepoPlanLimitState {
	canRetry: boolean;
	planLimitReached: boolean;
	canAvailTrial: boolean;
	canShowNotification: boolean;
}

export interface IRepoPlanInfo {
	isOrgRepo: boolean;
	pricingUrl: string;
	canAvailTrial: boolean;
}

export interface IUserState {
	isActive: boolean;
	isDeactivated: boolean;
	isWaitingForLogin: boolean;
}

export interface ITabYML {
	repository_id: number;
	created_at: string;
	source: string;
	file_name: string;
	tabs: ITabFile[];
}

export interface ITabFile {
	file_id: number | null;
	path: string;
	is_active_tab: boolean;
}

export interface ITabInput {
	uri: { path: string };  // Assuming 'uri' has a 'path' property
}

export interface ITab {
	input?: ITabInput;  // Assuming 'input' is optional
	uri?: { path: string };  // Assuming 'uri' is optional
}

export interface ISystemConfig {
	ROOT_REPO: string;
	API_HOST: string;
	API_BASE_URL: string;
	SOCKET_HOST: string;
	WEBAPP_HOST: string;
	CW_LOGS_GROUP: string;
	AWS_REGION: string;
}

export interface IApiRoutes {
	HEALTHCHECK: string;
	FILES: string;
	REPO_INIT: string;
	REPOS: string;
	USERS: string;
	USER_ORGANIZATIONS: string;
	REACTIVATE_ACCOUNT: string;
	USER_SUBSCRIPTION: string;
	DIFFS_WEBSOCKET: string;
	TEAM_ACTIVITY: string;
	USER_PRICING: string;
}
