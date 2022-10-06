import fs from 'fs';
import yaml from 'js-yaml';
import vscode from 'vscode';
import { API_ROUTES, NOTIFICATION, RETRY_TEAM_ACTIVITY_REQUEST_AFTER } from "../constants";
import { viewDashboardHandler } from '../handlers/commands_handler';
import { IRepoInfo, IUser } from "../interface";
import { CodeSyncLogger } from '../logger';
import { generateSettings } from "../settings";
import { getTeamActivity } from "../utils/api_utils";
import { getActiveUsers, readYML } from "../utils/common";
import { CodeSyncState, CODESYNC_STATES } from '../utils/state_utils';


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
	nowDate: string;
	before: Date;
	beforeDate: string;
	alertsData: any;
	activeUser: IUser;

	constructor() {
		const now = new Date();
		this.nowHour = now.getHours();
		this.nowMinutes = now.getMinutes();
		this.nowTimestamp = now.getTime();
		this.nowDate = now.toISOString().split('T')[0];
		this.settings = generateSettings();
		this.alertsData = readYML(this.settings.ALERTS);
		this.before = new Date();
		this.beforeDate = "";
		this.activeUser = getActiveUsers()[0];
	}

	checkActivityAlerts = async () => {
		if (!this.activeUser) return;
		const accessToken = this.activeUser.access_token;
		const userEmail = this.activeUser.email;
		await this.checkTeamAlert(accessToken, userEmail);
	};

	checkTeamAlert = async (accessToken: string, userEmail: string) => {
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
		// Update data in alerts.yml
		if (this.alertsData[this.CONFIG.TEAM_ACTIVITY.key] instanceof Date || this.alertsData[this.CONFIG.TEAM_ACTIVITY.key] === "") {
			// Reset value to empty object
			this.alertsData[this.CONFIG.TEAM_ACTIVITY.key] = {};
		}
		const alertH = this.CONFIG.TEAM_ACTIVITY.showAt.hour;
		const alertM = this.CONFIG.TEAM_ACTIVITY.showAt.minutes;
		if (this.before.getHours() < alertH || (this.before.getHours() == alertH && this.before.getMinutes() < alertM)) {
			// e.g. IDE is opened between 0am-16:29pm, it should check 16:30pm of yesterday till day before yesterday
			// so subtracting 1 day here. If checking at any hour between 16-23 no need to subtract 1 day.
			this.before.setDate(this.before.getDate()-1);
		}
		// Checking only before 4:30PM
		this.before.setHours(alertH);
		this.before.setMinutes(alertM);
		// Set beforeDate
		this.beforeDate = this.before.toISOString().split('T')[0];
		// Check when last alert was shown to the user
		const alertConfig = this.alertsData[this.CONFIG.TEAM_ACTIVITY.key][userEmail];
		// show alert if it is first time
		if (!alertConfig) return await this.showTeamActivityAlert(accessToken, userEmail);
		// Can show alert if 
		// 1- Haven't checked activity for "before"
		// 2- Last alert was shown before 24 hours
		const hasCheckedBefore = this.beforeDate === alertConfig.checked_date;
		if (hasCheckedBefore) return;
		const lastShownBefore24H = Boolean(!alertConfig.shown_at || this.nowTimestamp - alertConfig.shown_at.getTime() > this.CONFIG.TEAM_ACTIVITY.showAfter);
		const canShowAlert = (this.nowHour == alertH && this.nowMinutes >= alertM || this.nowHour > alertH) || lastShownBefore24H;
		if (!canShowAlert) return;
		// show alert
		await this.showTeamActivityAlert(accessToken, userEmail);
	};

	showTeamActivityAlert = async (accessToken: string, userEmail: string) => {
		/*
		Checks if there has been a team-activity past 24 hours
		In case of error from API, retries after 5 minutes
		*/
		const requestSentAt = CodeSyncState.get(CODESYNC_STATES.TEAM_ACTIVITY_REQUEST_SENT_AT);
		const canRetry = requestSentAt && (this.nowTimestamp - requestSentAt) > RETRY_TEAM_ACTIVITY_REQUEST_AFTER;
		if (requestSentAt && !canRetry) return;
		const alertH = this.CONFIG.TEAM_ACTIVITY.showAt.hour;
		const alertM = this.CONFIG.TEAM_ACTIVITY.showAt.minutes;
		// Set time when request is sent
		CodeSyncState.set(CODESYNC_STATES.TEAM_ACTIVITY_REQUEST_SENT_AT, new Date().getTime());
		// Check if there has been some acitivty in past 24 hours
		const json = await getTeamActivity(accessToken);
		if (json.error) {
			CodeSyncLogger.error("Error getting team activity", json.error);
			return;
		}
		// In case there is no activity
		if (!json.activities) return;
		// Check if there is some recent activity to show
		const hasRecentActivty = json.activities.some((repoInfo: IRepoInfo) => {
			const lastSyncedAt = new Date(repoInfo.last_synced_at);
			// Ignore activity after the "before"
			if (lastSyncedAt > this.before) return false;
			// Check if activity was within 24 hours
			return ((this.before.getTime() - new Date(repoInfo.last_synced_at).getTime())) <= this.CONFIG.TEAM_ACTIVITY.showAfter;
		});
		if (!hasRecentActivty) {
			this.alertsData[this.CONFIG.TEAM_ACTIVITY.key][userEmail] = {
				checked_date: this.nowDate,
			};
			fs.writeFileSync(this.settings.ALERTS, yaml.safeDump(this.alertsData));	
			return;
		}
		CodeSyncLogger.debug(`Team activity alert shown at ${new Date()}, user=${userEmail}`);
		// Show alert
		const button = NOTIFICATION.VIEW_DASHBOARD;
		vscode.window.showInformationMessage(NOTIFICATION.TEAM_ACTIVITY_ALERT, button).then(selection => {
			if (!selection) { return; }
			if (selection === NOTIFICATION.VIEW_DASHBOARD) {
				viewDashboardHandler();
			}
		});
		this.alertsData[this.CONFIG.TEAM_ACTIVITY.key][userEmail] = {
			checked_date: this.nowDate,
			date: this.beforeDate,
			shown_at: new Date()
		};
		fs.writeFileSync(this.settings.ALERTS, yaml.safeDump(this.alertsData));
	}

}
