import fs from 'fs';
import { generateSettings } from "../settings";
import { isUserActive, readYML } from './common';
import { IUser, IUserState } from '../interface';
import { CODESYNC_STATES, CodeSyncState } from './state_utils';


export class UserState {

	set = (isUserActive: boolean, isDeactivated: boolean): void => {
		CodeSyncState.set(CODESYNC_STATES.IS_USER_ACTIVE, isUserActive);
		CodeSyncState.set(CODESYNC_STATES.ACCOUNT_DEACTIVATED, isDeactivated);
	}

	get = (): IUserState => {
		const isActive = CodeSyncState.get(CODESYNC_STATES.IS_USER_ACTIVE);
		const isDeactivated = CodeSyncState.get(CODESYNC_STATES.ACCOUNT_DEACTIVATED);
		return {
			isActive,
			isDeactivated
		};
	}

	setDeactivated = (): void => {
		const isActive = true;
		const isDeactivated = true;
		this.set(isActive, isDeactivated);
	}

	setValidAccount = (): void => {
		const isActive = true;
		const isDeactivated = false;
		this.set(isActive, isDeactivated);
	}

	isValidAccount = (): boolean => {
		const state = this.get();
		return state.isActive && !state.isDeactivated;
	}

	isDeactivated = (): boolean => {
		const state = this.get();
		return state.isActive && state.isDeactivated;
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
