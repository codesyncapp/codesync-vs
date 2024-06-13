/*
Validate size of data:
// Diff data to be sent to server
                const diffToSend = diffHandler.createDiffToSend(fileId);
                diffsSize += JSON.stringify(diffToSend).length;
                // Websocket can only accept data upto 16MB, for above than that, we are reducing number of diffs per iteration to remain under limit.
                if (diffsSize > DIFF_SIZE_LIMIT) continue;
                validDiffs.push(diffToSend);
*/

import { glob } from "glob";
import { ITabYML, ITabFile } from "../../interface";
import { generateSettings } from "../../settings";
import { readYML } from "../../utils/common";
import { ConfigUtils } from "../../utils/config_utils";
import { getRandomIndex, getTabsBeingProcessed, isValidDiff } from "../utils";
import path from "path";
import { removeFile } from "../../utils/file_utils";
import { TAB_FILES_PER_ITERATION } from "../../constants";
import { CodeSyncLogger } from "../../logger";
import { TabValidator } from "../validators/tab_validator";

export class TabsHandler {

    tabsList: ITabYML;
    accessToken: string;
    settings: any;
    configJSON: any;
    configRepo: any;

    constructor(repoTabs: ITabYML | null = null, accessToken: string | null = null) {
        if (!accessToken) return;
        this.accessToken = accessToken;
        if (!repoTabs) return;
        this.tabsList = repoTabs;
        this.settings = generateSettings();
        this.configJSON = readYML(this.settings.CONFIG_PATH);
    }

    async run() {
        const validTabs: ITabYML[] = [];
        let tabsSize = 0;
        
        
        return validTabs;
    }

    getYMLFiles = async () => {
        const tabsBeingProcessed = getTabsBeingProcessed();
        // Discard all files that aren't of .YML 
        const invalidTabFiles = await glob("**", { 
			ignore: "*.yml",
			nodir: true,
			dot: true,
            cwd: this.settings.TABS_PATH
        });

        invalidTabFiles.forEach(invalidTabFile => {
            const filePath = path.join(this.settings.TABS_PATH, invalidTabFile);
            removeFile(filePath, "cleaningInvalidTabFiles");
        })

        // Get valid files
        const tabs = await glob("*.yml", { 
            cwd: this.settings.TABS_PATH,
			maxDepth: 1,
			nodir: true,
			dot: true,
		});

        // Randomly pick X tab files 
        let randomTabFiles = [];
        const usedIndices = <any>[];
		let randomIndex = undefined;

        for (let index = 0; index < Math.min(TAB_FILES_PER_ITERATION, tabs.length); index++) {
            do {
                randomIndex = getRandomIndex( tabs.length );
            }
            while (usedIndices.includes( randomIndex ));
            usedIndices.push(randomIndex);
            randomTabFiles.push(tabs[randomIndex]);
        }

        randomTabFiles = randomTabFiles.filter((tabFile) => {
            const filePath = path.join(this.settings.TABS_PATH, tabFile);
            const tabData = readYML(filePath);
            const tab_validator = new TabValidator();
            if (!tabData || !tab_validator.validateYMLFile(tabData) ) {
                CodeSyncLogger.info(`Removing file: Skipping invalid tab: ${tabFile}`, "", tabData);
				removeFile(filePath, "getTabFiles");
				return false;
            }

            const config_utils = new ConfigUtils();
            const repo_path = config_utils.getRepoPathByRepoId(tabData.repo_id);
            const configRepo = this.configJSON.repos[repo_path];
            if (!configRepo) {
                CodeSyncLogger.info(`Removing tab: Skipping invalid tab: ${tabFile}`, "", tabData);
                removeFile(filePath, "getTabFiles");
                return false;
            }
            // Remove tab if repo is disconnected
            if (configRepo.is_disconnected) {
                CodeSyncLogger.error(`Removing tab: Repo ${repo_path} is disconnected`);
				removeFile(filePath, "getTabFiles");
				return false;
            }

            return true;
        });
        
        return {
            files: randomTabFiles,
            count: tabs.length,
        }

    }

    groupTabData = (tabFiles: string[]) => {
        const repoTabs: ITabYML[] = [];
        const grouped_repos: number[] = []
        for (const tabFile of tabFiles) {
            // Group tabs by repo_id
            if(!(tabFile.repo_id in grouped_repos)) {
                grouped_repos.push(tabFile.repo_id);
            }
        }
        return grouped_repos;
    }
}