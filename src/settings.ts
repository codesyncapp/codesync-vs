import untildify from "untildify";

const ROOT_REPO_NAME = '~/.codesync';
export const CODESYNC_DOMAIN = "codesync-server.herokuapp.com";
export const CODESYNC_HOST = 'https://codesync-server.herokuapp.com';
export const WEB_APP_URL = "https://www.codesync.com";

// const ROOT_REPO_NAME = '~/.codesync-local';
// export const CODESYNC_DOMAIN = '127.0.0.1:8000';
// export const CODESYNC_HOST = 'http://127.0.0.1:8000';
// export const WEB_APP_URL = "http://localhost:3000";


export const generateSettings = () => {
    const rootRepo = untildify(ROOT_REPO_NAME);
    return {
        CODESYNC_ROOT: rootRepo,
        DIFFS_REPO: `${rootRepo}/.diffs/.vscode`,
        ORIGINALS_REPO: `${rootRepo}/.originals`,
        SHADOW_REPO: `${rootRepo}/.shadow`,
        DELETED_REPO: `${rootRepo}/.deleted`,
        CONFIG_PATH: `${rootRepo}/config.yml`,
        USER_PATH: `${rootRepo}/user.yml`,
        SEQUENCE_TOKEN_PATH: `${rootRepo}/sequence_token.yml`
    };
};
