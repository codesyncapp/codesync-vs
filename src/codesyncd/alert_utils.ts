import fs from 'fs';
import yaml from 'js-yaml';
import vscode from 'vscode';
import { API_ROUTES, NOTIFICATION } from "../constants";
import { viewDashboardHandler } from '../handlers/commands_handler';
import { IRepoInfo } from "../interface";
import { CodeSyncLogger } from '../logger';
import { generateSettings } from "../settings";
import { getTeamActivity } from "../utils/api_utils";
import { getActiveUsers, readYML } from "../utils/common";


export class Alerts {
	// In case we make it congifurable from user input in future, structure will help then.
	CONFIG = {
		TEAM_ACTIVITY : {
			key: "team_activity",
			showAt: {
				hour: 16,
				minutes: 30
			},
			showAfter: 24 * 60 * 60 * 1000, // 24 hours
			api: API_ROUTES.TEAM_ACTIVITY
		}
	} 

	settings: any;
	nowHour: number;
    nowMinutes: number;
	nowTimestamp: number;
	alertsData: any;
	accessToken: string;

	constructor() {
		const now = new Date();
		this.nowHour = now.getHours();
		this.nowMinutes = now.getMinutes();
		this.nowTimestamp = new Date().getTime();
		this.settings = generateSettings();
		this.alertsData = readYML(this.settings.ALERTS);

		const activeUser = getActiveUsers()[0];
		this.accessToken = activeUser.access_token;
	}

	checkTeamAlert = async () => {
		/* 
		Notify the user about recent activity within teams, daily at 4:30pm.
		We need to check activity within past 24 hours i.e from 4:30PM yesterday to 4:30PM today.
		Edge case:
		- If user is not online at 4:30pm and becomes available at any time later (before 4:30PM next day);
			- If there was an activity before 4:30PM, it will show an alert once and will not show alert
			  again before 4:30PM of next day.
			- If there was an activity after 4:30PM, it will not show the alert, rather will show the alert next day.

		TODO: Show alert in all open instances of the IDE by keeping track in state variable. 
		*/
		const alertH = this.CONFIG.TEAM_ACTIVITY.showAt.hour;
		const alertM = this.CONFIG.TEAM_ACTIVITY.showAt.minutes;
		if (!(this.nowHour == alertH && this.nowMinutes >= alertM || this.nowHour > alertH)) return;
		// Check when last alert was shown to the user
		const lastShownAT = this.alertsData[this.CONFIG.TEAM_ACTIVITY.key];
		if (lastShownAT && Math.abs(this.nowTimestamp - lastShownAT.getTime()) < this.CONFIG.TEAM_ACTIVITY.showAfter) return;
		// Check if there has been some acitivty in past 24 hours
		const response = await getTeamActivity(this.accessToken);
		if (response.error) { 
			CodeSyncLogger.error("Error getting team activity", response.error);
			return;
		}
		// In case there is no activity
		if (!response.repos || !response.repos.length) return;
		const hasRecentActivty = response.repos.some((repoInfo: IRepoInfo) => {
			const before = new Date();
			// Checking only before 4:30PM
			before.setHours(alertH);
			before.setMinutes(alertM);
			const lastSyncedAt = new Date(repoInfo.last_synced_at);
			// Ignore if there
			if (lastSyncedAt > before) return false;
			// Check if lastSyncedAt was within 24 hours
			return ((before.getTime() - new Date(repoInfo.last_synced_at).getTime())) <= this.CONFIG.TEAM_ACTIVITY.showAfter;
		});
		if (!hasRecentActivty) return;
		// Show alert
		const button = NOTIFICATION.VIEW_DASHBOARD;
		vscode.window.showInformationMessage(NOTIFICATION.TEAM_ACTIVITY_ALERT, button).then(selection => {
			if (!selection) { return; }
			if (selection === NOTIFICATION.VIEW_DASHBOARD) {
				viewDashboardHandler();
			}
		});
		// Update time in alerts.yml
		this.alertsData[this.CONFIG.TEAM_ACTIVITY.key] = new Date();
		fs.writeFileSync(this.settings.ALERTS, yaml.safeDump(this.alertsData));
	};

	checkActivityAlerts = async () => {
		await this.checkTeamAlert();
	};
}
