import * as fs from 'fs';
import ignore from 'ignore';
import * as path from 'path';
import * as walk from 'walk';

import { IGNOREABLE_REPOS, SYNCIGNORE } from '../constants';
import { readFile } from './common';

export class initUtils {

	static isValidRepoSize (syncSize: number, userPlan: any)  {
		const isValid = userPlan.SIZE >= syncSize;
		if (!isValid) {
			console.log(`Repo size exceeds limit. Allowed repo size is ${userPlan.SIZE}`);
		}
		return isValid;	
	}
	
	static isValidFilesCount (filesCount: number, userPlan: any) {
		const isValid = userPlan.FILE_COUNT >= filesCount;
		if (!isValid) {
			console.log(`You can add only ${userPlan.FILE_COUNT} files (Trying to add ${filesCount} files)`);
		}
		return isValid;
	}
	
	static copyFilesTo (repoPath: string, itemPaths: string[], destination: string) {
		itemPaths.forEach((itemPath) => {
			const relPath = itemPath.split(`${repoPath}/`)[1];
			const destinationPath = path.join(destination, relPath);
			const directories = path.dirname(destinationPath);
			if (!fs.existsSync(directories)) {
				fs.mkdirSync(directories, { recursive: true });
			}
			// File destination will be created or overwritten by default.
			fs.copyFileSync(itemPath, destinationPath);
		});
	}
	
	static getSyncablePaths (repoPath: string, userPlan: any) {
		const syncignorePath = path.join(repoPath, SYNCIGNORE);
		const syncignoreExists = fs.existsSync(syncignorePath);
		const itemPaths: string[] = [];
	
		if (!syncignoreExists) {
			return itemPaths;	
		}
	
		let syncSize = 0;
		let syncignoreData = "";
	
		syncignoreData = readFile(syncignorePath);
		const syncignoreItems = syncignoreData.split("\n");
	
		IGNOREABLE_REPOS.forEach((repo) => {
			syncignoreItems.push(repo);
		});
	
		const ig = ignore().add(syncignoreItems);
	
		const options = {
			listeners: {
			file: function (root: string, fileStats: any, next: any) {
				const filePath = `${root}/${fileStats.name}`;
					const relPath = filePath.split(`${repoPath}/`)[1];
					const shouldIgnore = ig.ignores(relPath);
					if (!shouldIgnore) {
						itemPaths.push(filePath);

						syncSize += fileStats.size;
					}
					if (!(initUtils.isValidRepoSize(syncSize, userPlan) && initUtils.isValidFilesCount(itemPaths.length, userPlan))) {
						return [];
					}
					next();
				}
			}
		};
		walk.walkSync(repoPath, options);
		return itemPaths;
	}
}
