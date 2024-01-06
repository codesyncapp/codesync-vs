import { TIMEZONE, VERSION, VSCODE, Auth0URLs, API_BASE_URL } from "../constants";
import { WEB_APP_URL } from "../settings";

export const createRedirectUri = (path=Auth0URLs.LOGIN_CALLBACK_PATH) => {
    const port = (global as any).port;
    return `http://localhost:${port}${path}`;
};

export const generateAuthUrl = (url: string) => {
    const _url = new URL(url);
    const redirectUri = createRedirectUri();
	_url.searchParams.append("source", VSCODE);
	_url.searchParams.append("v", VERSION);
    _url.searchParams.append("redirect_uri", redirectUri);
	return _url.href;
};

export const generateServerUrl = (urlPath: string, baseUrl=API_BASE_URL, addTimezone=false) => {
	const _url = new URL(`${baseUrl}${urlPath}`);
	_url.searchParams.append("source", VSCODE);
	_url.searchParams.append("v", VERSION);
	if (addTimezone) {
		_url.searchParams.append("tz", TIMEZONE);
	}
	return _url.href;
};

export const generateWebUrl = (urlPath="", baseUrl=WEB_APP_URL) => {
	const _url = new URL(`${baseUrl}${urlPath}`);
	// Adding G4A params
	_url.searchParams.append("utm_medium", "plugin");
	_url.searchParams.append("utm_source", VSCODE);
	return _url.href;
};
