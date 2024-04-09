import fs from 'fs';
import { generateSettings } from "../settings";
import { isUserActive, readYML } from './common';
import { IUser, IUserState } from '../interface';
import { CODESYNC_STATES, CodeSyncState } from './state_utils';


export class UserState {

	set = (isUserActive: boolean, isDeactivated: boolean, waitingForLogin: boolean): void => {
		CodeSyncState.set(CODESYNC_STATES.USER.IS_USER_ACTIVE, isUserActive);
		CodeSyncState.set(CODESYNC_STATES.USER.ACCOUNT_DEACTIVATED, isDeactivated);
		CodeSyncState.set(CODESYNC_STATES.USER.WAITING_FOR_LOGIN_CONFIRMATION, waitingForLogin);
	}

	get = (): IUserState => {
		const isActive = CodeSyncState.get(CODESYNC_STATES.USER.IS_USER_ACTIVE);
		const isDeactivated = CodeSyncState.get(CODESYNC_STATES.USER.ACCOUNT_DEACTIVATED);
		const isWaitingForLogin = CodeSyncState.get(CODESYNC_STATES.USER.WAITING_FOR_LOGIN_CONFIRMATION);
		return {
			isActive,
			isDeactivated,
			isWaitingForLogin
		};
	}

	setDeactivated = (isDeactivated=false): void => {
		const isActive = true;
		const isWaitingForLogin = false;
		this.set(isActive, isDeactivated, isWaitingForLogin);
	}

	setInvalidAccount = (): void => {
		const isActive = false;
		const isDeactivated = false;
		const isWaitingForLogin = false;
		this.set(isActive, isDeactivated, isWaitingForLogin);
	}

	setValidAccount = (): void => {
		const isActive = true;
		const isDeactivated = false;
		const isWaitingForLogin = false;
		this.set(isActive, isDeactivated, isWaitingForLogin);
	}

	setWaitingForLogin = (): void => {
		const isActive = false;
		const isDeactivated = false;
		const isWaitingForLogin = true;
		CodeSyncState.set(CODESYNC_STATES.USER.AUTHENTICATION_INITIATED_AT, new Date().getTime());
		this.set(isActive, isDeactivated, isWaitingForLogin);
	}

	isValidAccount = (): boolean => {
		const state = this.get();
		return state.isActive && !state.isDeactivated && !state.isWaitingForLogin;
	}

	isDeactivated = (): boolean => {
		const state = this.get();
		return !state.isWaitingForLogin && state.isActive && state.isDeactivated;
	}

	getUser = (checkState=true): IUser|null => {
		if (checkState) {
			const state = this.get();
			if (!state.isActive) return null;	
		}
		const userUtils = new UserUtils();
		return userUtils.getActiveUser();
	}
}

export class UserUtils {
	users = <any>{};

	constructor() {
		const settings = generateSettings();
		if (!fs.existsSync(settings.USER_PATH)) return;
		this.users = readYML(settings.USER_PATH) || {};
	}

	isUserActive = (email: string) : boolean => {
		if (!this.users) return false;
		const user = this.users[email];
		return isUserActive(user);
	};

	getActiveUser = () : IUser|null => {
		if (!this.users) return null;
		const activeEmail = Object.keys(this.users).find(email => {
			const user = this.users[email];
			return isUserActive(user);
		});
		if (!activeEmail) return null;
		const user = this.users[activeEmail];
		return { 
			email: activeEmail, 
			access_token: user.access_token
		};
	};
}
