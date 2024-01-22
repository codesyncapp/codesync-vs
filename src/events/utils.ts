import fs from 'fs';
import { 
	checkSubDir, 
	getBranch, 
	isRepoActive, 
	isUserActive, 
	readYML
} from '../utils/common';
import { generateSettings } from "../settings";
import { CodeSyncLogger } from '../logger';


export const isRepoConnected = (repoPath: string, checkFileIds=true) => {
	if (!repoPath) return false;
	const settings = generateSettings();
	const configPath = settings.CONFIG_PATH;
	// If config.yml does not exist, return
	if (!fs.existsSync(configPath)) return false;
	try {
		const config = readYML(configPath);
		const result = checkSubDir(repoPath);
		if (result.isSubDir) {
			if (result.isSyncIgnored) return false;
			repoPath = result.parentRepo;
		}
		if (!isRepoActive(config, repoPath)) return false;
		if (!isAccountActive(config.repos[repoPath].email)) return false;
		if (checkFileIds) {
			const branch = getBranch(repoPath);
			const configRepo = config.repos[repoPath];
			// If branch is not uploaded, daemon will take care of that
			if (!(branch in configRepo.branches)) return true;
			const configFiles = configRepo.branches[branch];
			const invalidFiles = Object.keys(configFiles).filter(relPath => configFiles[relPath] === null);
			const hasNullIds = invalidFiles.length && invalidFiles.length === Object.keys(configFiles).length;
			if (hasNullIds) return false;
		}
		return true;
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		CodeSyncLogger.critical("Failed to check isRepoConnected", e.stack);
		return false;
	}
};

export const isAccountActive = (email: string) => {
	const settings = generateSettings();
	if (!fs.existsSync(settings.USER_PATH)) return false;
	// Return if user hasn't synced the repo
	const users = readYML(settings.USER_PATH) || {};
	const user = users[email];
	return isUserActive(user);
};
