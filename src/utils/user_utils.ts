import fs from 'fs';
import { generateSettings } from "../settings";
import { isUserActive, readYML } from './common';
import { IUser } from '../interface';

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