import untildify =  require('untildify');

export const CODESYNC_ROOT = untildify('~/.codesync');
export const DIFFS_REPO = `${CODESYNC_ROOT}/.diffs/.vscode`;
export const ORIGINALS_REPO = `${CODESYNC_ROOT}/.originals`;
export const SHADOW_REPO = `${CODESYNC_ROOT}/.shadow`;
export const DELETED_REPO = `${CODESYNC_ROOT}/.deleted`;
export const CONFIG_PATH = `${CODESYNC_ROOT}/config.yml`;
export const DIFF_SOURCE = 'vs-code';
export const DEFAULT_BRANCH = 'default';
export const GIT_REPO = '.git/';
export const DATETIME_FORMAT = 'UTC:yyyy-mm-dd HH:MM:ss.l';
export const RESTART_DAEMON_AFTER = 5000;

export const CODESYNC_DOMAIN = '127.0.0.1:8000';
export const CODESYNC_HOST = 'http://127.0.0.1:8000';
// export const CODESYNC_DOMAIN = "codesync-server.herokuapp.com";
// export const CODESYNC_HOST = 'https://codesync-server.herokuapp.com';
export const API_HEALTHCHECK = `${CODESYNC_HOST}/healthcheck`;
export const WEBSOCKET_ENDPOINT = `ws://${CODESYNC_DOMAIN}/v1/websocket`;

export const DIFF_FILES_PER_ITERATION = 50;
export const REQUIRED_DIFF_KEYS = ['repo_path', 'branch', 'file_relative_path', 'created_at'];
export const REQUIRED_FILE_RENAME_DIFF_KEYS = ['old_abs_path', 'new_abs_path', 'old_rel_path', 'new_rel_path'];
export const REQUIRED_DIR_RENAME_DIFF_KEYS = ['old_path', 'new_path'];

export const DIFF_SIZE_LIMIT = 16 * 1000 * 1000;
