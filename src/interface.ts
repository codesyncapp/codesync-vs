export interface IDiff {
	repo_path: string;
	branch: string;
	file_relative_path: string;
	created_at: string;
	source: string;
	diff?: string;
	is_binary?: boolean;
	is_rename?: boolean;
	is_dir_rename?: boolean;
	is_new_file?: boolean;
	is_deleted?: boolean;
}
