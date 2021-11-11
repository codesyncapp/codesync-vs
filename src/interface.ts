export interface IDiff {
	repo_path: string;
	branch: string;
	file_relative_path: string;
	created_at: string;
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
	size: number,
	created_at: number,
	modified_at: number
}

export interface IUser {
	email: string,
	plan: IUserPlan,
	repo_count: number
}

export interface IUserPlan {
	SIZE: number;
	FILE_COUNT: number;
	REPO_COUNT: number;
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
	'is_deleted': boolean|undefined;
	'is_rename': boolean|undefined;
	'is_binary': boolean|undefined;
	'created_at': string;
	'diff_file_path': string;
	'source': string;
	'platform': string
}
