import { TIMEZONE, VERSION, VSCODE, Auth0URLs, API_BASE_URL, WebPaths } from "../constants";
import { WEB_APP_URL } from "../settings";

export const createRedirectUri = (path=Auth0URLs.LOGIN_CALLBACK_PATH) => {
    const port = (global as any).port;
    return `http://localhost:${port}${path}`;
};

export const generateAuthUrl = () => {
	// https://codesync.com/signup?utm_medium=plugin&utm_source=vscode&login-callback=http://localhost:49870/login-callback
	const redirectURI = createRedirectUri(Auth0URLs.LOGIN_CALLBACK_PATH);
	const additionalParams = {
		"login-callback": redirectURI
	};
	const authUrl = generateWebUrl(WebPaths.AUTH, additionalParams);
	return authUrl;
};

export const generateLogoutUrl = () => {
	// https://api.codesync.com/auth-logout?source=vscode&v=3.44.1&redirect_uri=http://localhost:53381/logout-callback
    const _url = new URL(Auth0URLs.LOGOUT);
	_url.searchParams.append("source", VSCODE);
	_url.searchParams.append("v", VERSION);
	const redirectURI = createRedirectUri(Auth0URLs.LOGOUT_CALLBACK_PATH);
    _url.searchParams.append("redirect_uri", redirectURI);
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

export const generateWebUrl = (urlPath="", additionalParams: any=null,) => {
	const url = `${WEB_APP_URL}${urlPath}`;
	const _url = appendGAparams(url);
	if (additionalParams) {
		Object.keys(additionalParams).forEach(key => {
			_url.searchParams.append(key, additionalParams[key]);
		});
	}
	return _url.href;
};

export const appendGAparams = (url: string) => {
	const _url = new URL(url);
	// Adding G4A params
	_url.searchParams.append("utm_medium", "plugin");
	_url.searchParams.append("utm_source", VSCODE);
	return _url;
};
