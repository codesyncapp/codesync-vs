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
	checkFor: Date;
	checkForDate: string;
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
		this.checkFor = new Date();
		this.checkForDate = "";
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
		if (this.checkFor.getHours() < alertH || (this.checkFor.getHours() == alertH && this.checkFor.getMinutes() < alertM)) {
			// e.g. IDE is opened between 0am-16:29pm, it should check 16:30pm of yesterday till day before yesterday
			// so subtracting 1 day here. If checking at any hour between 16-23 no need to subtract 1 day.
			this.checkFor.setDate(this.checkFor.getDate()-1);
		}
		// Checking only before 4:30PM
		this.checkFor.setHours(alertH);
		this.checkFor.setMinutes(alertM);
		// Set checkForDate
		this.checkForDate = this.checkFor.toISOString().split('T')[0];
		// Check when last alert was shown to the user
		const alertConfig = this.alertsData[this.CONFIG.TEAM_ACTIVITY.key][userEmail];
		// show alert if it is first time
		if (!alertConfig) return await this.shouldCheckTeamActivityAlert(accessToken, userEmail);
		const hasChecked = this.checkForDate === alertConfig.checked_for;
		if (hasChecked) return;
		// If checking on same day, should check @4:30pm
		if (this.checkForDate === this.nowDate) {
			const canShowAlert = (this.nowHour == alertH && this.nowMinutes >= alertM || this.nowHour > alertH);
			if (!canShowAlert) return;
		}
		// show alert
		await this.shouldCheckTeamActivityAlert(accessToken, userEmail);
	};

	shouldCheckTeamActivityAlert = async (accessToken: string, userEmail: string) => {
		/*
		Checks if there has been a team-activity past 24 hours
		In case of error from API, retries after 5 minutes
		*/
		const requestSentAt = CodeSyncState.get(CODESYNC_STATES.TEAM_ACTIVITY_REQUEST_SENT_AT);
		const canRetry = requestSentAt && (this.nowTimestamp - requestSentAt) > RETRY_TEAM_ACTIVITY_REQUEST_AFTER;
		if (requestSentAt && !canRetry) return;
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
			if (lastSyncedAt > this.checkFor) return false;
			// Check if activity was within 24 hours
			return ((this.checkFor.getTime() - new Date(repoInfo.last_synced_at).getTime())) <= this.CONFIG.TEAM_ACTIVITY.showAfter;
		});
		if (!hasRecentActivty) {
			this.alertsData[this.CONFIG.TEAM_ACTIVITY.key][userEmail] = {
				checked_at: this.nowDate,
				checked_for: this.checkForDate
			};
			fs.writeFileSync(this.settings.ALERTS, yaml.safeDump(this.alertsData));	
			return;
		}
		CodeSyncLogger.debug(`Team activity alert shown at ${new Date()}, user=${userEmail}`);
		// Show alert
		let msg = NOTIFICATION.USER_ACTIVITY_ALERT;
		let button = NOTIFICATION.REVIEW_PLAYBACK;
		if (json.is_team_activity) {
			msg = NOTIFICATION.TEAM_ACTIVITY_ALERT;
			button = NOTIFICATION.REVIEW_TEAM_PLAYBACK;
		}
		vscode.window.showInformationMessage(msg, button).then(selection => {
			if (!selection) { return; }
			if (selection === NOTIFICATION.REVIEW_TEAM_PLAYBACK || selection === NOTIFICATION.REVIEW_PLAYBACK) {
				viewDashboardHandler();
			}
		});
		this.alertsData[this.CONFIG.TEAM_ACTIVITY.key][userEmail] = {
			checked_at: this.nowDate,
			checked_for: this.checkForDate,
			shown_at: new Date()
		};
		fs.writeFileSync(this.settings.ALERTS, yaml.safeDump(this.alertsData));
	}

}
