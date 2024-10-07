import { TIMEZONE, VERSION, VSCODE, Auth0URLs, WebPaths } from "../constants";
import { WEBAPP_HOST } from "../settings";
import { getSystemConfig } from "./setup_utils";


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

export const generateRequestDemoUrl = () => {
	// https://codesync.com/request-a-demo?utm_medium=plugin&utm_source=vscode
	return generateWebUrl(WebPaths.REQUEST_DEMO);
};

export const generateLogoutUrl = (access_token: string) => {
	// https://codesync.com/logout?utm_medium=plugin&utm_source=vscode&access_token=ACCESS_TOKEN&logout-callback=http://localhost:53381/logout-callback
	const redirectURI = createRedirectUri(Auth0URLs.LOGOUT_CALLBACK_PATH);
	const additionalParams = {
		"logout-callback": redirectURI,
		"access_token": access_token
	};
	const authUrl = generateWebUrl(WebPaths.LOGOUT, additionalParams);
	return authUrl;
};

const generateBackendUrl = (urlPath: string, baseUrl: string, addTimezone=false) => {
	const _url = new URL(`${baseUrl}${urlPath}`);
	_url.searchParams.append("source", VSCODE);
	_url.searchParams.append("v", VERSION);
	if (addTimezone) {
		_url.searchParams.append("tz", TIMEZONE);
	}
	return _url.href;
};

export const generateApiUrl = (urlPath: string, addTimezone=false) => {
	const apiBaseUrl = getSystemConfig().API_BASE_URL;
	return generateBackendUrl(urlPath, apiBaseUrl, addTimezone);
};

export const generateApiHostUrl = (urlPath: string) => {
	const baseUrl = getSystemConfig().API_HOST;
	return generateBackendUrl(urlPath, baseUrl);
};

export const generateSocketUrl = (urlPath: string) => {
	const socketUrl = getSystemConfig().SOCKET_HOST;
	return generateBackendUrl(urlPath, socketUrl);
};

export const generateWebUrl = (urlPath="", additionalParams: any=null,) => {
	const url = `${WEBAPP_HOST}${urlPath}`;
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
