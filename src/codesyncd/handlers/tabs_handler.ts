import path from "path";

import { glob } from "glob";

import { ITabYML, ITabFile } from "../../interface";
import { generateSettings } from "../../settings";
import { readYML } from "../../utils/common";
import { getRandomIndex, getTabsBeingProcessed } from "../utils";
import { removeFile } from "../../utils/file_utils";
import { TAB_FILES_PER_ITERATION, TAB_SIZE_LIMIT } from "../../constants";
import { CodeSyncLogger } from "../../logger";
import { TabValidator } from "../validators/tab_validator";
import { TabHandler } from "./tab_handler";

export class TabsHandler {

    tabs: ITabYML[];
    accessToken: string;

    settings: any;
    configJSON: any;
    configRepo: any;

    constructor(repoTab: ITabYML[] | null = null, accessToken: string | null = null) {
        // console.log(`settins: ${this.settings}`);
        if (!accessToken) return;
        this.accessToken = accessToken;
        if (!repoTab) return;
        this.tabs = repoTab;
        
        this.settings = generateSettings();
        // console.log(`settins: ${JSON.stringify(this.settings)}`);
        this.configJSON = readYML(this.settings.CONFIG_PATH);
    }

    async run() {
        const validTabs: ITabYML[] = [];
        let tabsSize = 0;
        for (const tab of this.tabs) {
            const tab_handler = new TabHandler(tab, null, this.accessToken);
            const tabToSend = await tab_handler.createTabToSend();
            if (!tabToSend) {
                CodeSyncLogger.error(`createTabToSend() returned empty response`);
                return;
            }
            console.log(`tabToSend: ${JSON.stringify(tabToSend)}`);
           
            console.log(`tabsSize: ${tabsSize}`)
            tabsSize += JSON.stringify(tabToSend).length;
            console.log(`tabsSize: ${tabsSize}`)
            console.log(`validTabs: ${validTabs}`);
            if (tabsSize < TAB_SIZE_LIMIT) {
                validTabs.push(tabToSend);
            } else {
                CodeSyncLogger.error(`Tabs size limit reached, size = ${tabsSize} bytes`);
            }
            console.log(`validTabs: ${JSON.stringify(validTabs)}`);    
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
            const tab_validator = new TabValidator();
            for (const tab of tabData){
            if (!tabData || !tab_validator.validateYMLFile(tabData) || !tab_validator.validateRepoId(tabData, tab.repo_id) ) {
                CodeSyncLogger.info(`Removing file: Skipping invalid tab: ${tabFile}`, "", tabData);
				removeFile(filePath, "getTabFiles");
				return false;
            }
            validateRepo(tabFile, tabData, filePath, tab.repo_id);
    }
            

            return true;
        });
        return {
            files: randomTabFiles,
            count: tabs.length,
        }

    }

    groupTabData = (tabFiles: string[]) => {
        const repoTabs: ITabYML[] = []
        const grouped_repos: number[] = []
        for (const tabFile of tabFiles) {
            const filePath = path.join(this.settings.TABS_PATH, tabFile);
            const tabData = readYML(filePath);
            // Group tabs by repo_id
            if(!(tabData.repo_id in grouped_repos)) {
                grouped_repos.push(tabData.repo_id);
            }
        }
        return grouped_repos;
    }
    
	sendTabsToServer(webSocketConnection: any, tabToSend: ITabYML[]) {
		// Send tab to server
		webSocketConnection.send(JSON.stringify({'tabs': [tabToSend]}));
	}
}

function validateRepo(tabFile: string, tabData: any, filePath: string, repo_id: any) {
    throw new Error("Function not implemented.");
}
