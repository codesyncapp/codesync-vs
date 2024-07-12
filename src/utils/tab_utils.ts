import fs from "fs";
import { CodeSyncLogger } from '../logger';
import { tabEventHandler } from "../events/tab_event_handler";
import { formatDatetime } from "./common";

export const removeTabFile = (filePath: string, funcName: string) => {
	if (!fs.existsSync(filePath)) return;
		fs.unlink(filePath, err => {
		if (!err) return false;
		// @ts-ignore
		CodeSyncLogger.error(`${funcName}: Error deleting file`, err);
	});
};

export const captureTabs = (repoPath: string, isTabEvent: boolean = true) => {
	const handler = new tabEventHandler(repoPath);
	// Record timestamp
	const createdAt = formatDatetime(new Date().getTime());
	// Adding setTimeout here since 'isActive' key in tabs was not being properly assigned
	setTimeout(() => handler.handleTabChangeEvent(createdAt, isTabEvent), 1);
}

