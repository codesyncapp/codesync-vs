import path from "path";

import { glob } from "glob";

import { ITabYML } from "../../interface";
import { generateSettings } from "../../settings";
import { readYML } from "../../utils/common";
import { getRandomIndex, getTabsBeingProcessed } from "../utils";
import { removeFile } from "../../utils/file_utils";
import { TAB_FILES_PER_ITERATION, TAB_SIZE_LIMIT } from "../../constants";
import { CodeSyncLogger } from "../../logger";
import { TabValidator } from "../validators/tab_validator";
import { TabHandler } from "./tab_handler";

export class TabsHandler {
    // @ts-ignore
    tabYmlFiles : ITabYML[];
    // @ts-ignore
    accessToken: string;

    settings: any;
    configJSON: any;
    configRepo: any;

    constructor(repoTab: ITabYML[] | null = null, accessToken: string | null = null) {
        // @ts-ignore
        this.accessToken = accessToken;
        // @ts-ignore
        this.tabYmlFiles = repoTab;
        this.settings = generateSettings();
        this.configJSON = readYML(this.settings.CONFIG_PATH);
    }

    async run() {
        const validTabs: ITabYML[] = [];
        let tabsSize = 0;
        if ( !this.tabYmlFiles ) return;
        for (const tab of this.tabYmlFiles ) {
            const tab_handler = new TabHandler();
            const tabToSend = await tab_handler.createTabToSend(tab);
            if (!tabToSend) {
                CodeSyncLogger.error(`createTabToSend() returned empty response`);
                return;
            }
            tabsSize += JSON.stringify(tabToSend).length;
            if (tabsSize < TAB_SIZE_LIMIT) {
                validTabs.push(tabToSend);
            } else {
                CodeSyncLogger.error(`Tabs size limit reached, size = ${tabsSize} bytes`);
            }
        }

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
			nodir: false,
			dot: false,
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
            const tabValidator = new TabValidator();
            // Validating structure
            if (!tabData || !tabValidator.validateYMLFile(tabData)) {
            CodeSyncLogger.info(`Removing file: Skipping invalid tab: ${tabFile}`, tabData);
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
    
        for (const tabFile of tabFiles) {
            const filePath = path.join(this.settings.TABS_PATH, tabFile);
            const tabData = readYML(filePath) as ITabYML;
            // Find the index of the repo with the current repo_id
            const index = repoTabs.findIndex(repoTab => repoTab.repository_id === tabData.repository_id);
            
            if (index > -1) {
                // Repo exists, so append the tabs data
                repoTabs[index].tabs.push(...tabData.tabs);
            } else {
                // Repo does not exist, so create a new entry
                repoTabs.push({
                    repository_id: tabData.repository_id,
                    created_at: tabData.created_at,
                    source: tabData.source,
                    file_name: tabData.file_name,
                    tabs: tabData.tabs
                });
            }
        }
        
        return repoTabs;
    
    }
    
	sendTabsToServer(webSocketConnection: any, tabEventsToSend: ITabYML[]) {
		// Send tab to server
		webSocketConnection.send(JSON.stringify({'tabs': tabEventsToSend}));
	}
}
