import fs from "fs";
import { CodeSyncLogger } from '../logger';

export const removeFile = (filePath: string, funcName: string) => {
	fs.unlink(filePath, err => {
		if (!err)  {
			console.log("Deleting", filePath);
			return false;}
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		CodeSyncLogger.error(`${funcName}: Error deleting file`, err);
	});	
};
