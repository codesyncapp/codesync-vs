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

    static run(tabYmlFiles: ITabYML[]) {
        const validTabs: ITabYML[] = [];
        let tabsSize = 0;
        if (!tabYmlFiles) return;
        for (const tabYMLFile of tabYmlFiles) {
            const tabToSend = TabHandler.createTabToSend(tabYMLFile);
            tabsSize += JSON.stringify(tabToSend).length;
            if (tabsSize < TAB_SIZE_LIMIT) {
                validTabs.push(tabToSend);
            } else {
                CodeSyncLogger.error(`Tabs size limit reached, size = ${tabsSize} bytes`);
            }
        }

        return validTabs;
    }

    static getYMLFiles = async () => {
        const settings = generateSettings();

        // Discard all files that aren't of type .YML 
        const invalidTabFiles = await glob("**", {
            ignore: "*.yml",
            nodir: true,
            dot: true,
            cwd: settings.TABS_PATH
        });

        invalidTabFiles.forEach(invalidTabFile => {
            const filePath = path.join(settings.TABS_PATH, invalidTabFile);
            removeFile(filePath, "cleaningInvalidTabFiles");
        })

        // Get valid files
        const tabs = await glob("*.yml", {
            cwd: settings.TABS_PATH,
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
                randomIndex = getRandomIndex(tabs.length);
            }
            while (usedIndices.includes(randomIndex));
            usedIndices.push(randomIndex);
            randomTabFiles.push(tabs[randomIndex]);
        }

        randomTabFiles = randomTabFiles.filter((tabFile) => {
            const filePath = path.join(settings.TABS_PATH, tabFile);
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

    static getTabsData = (tabFiles: string[]) => {
        const settings = generateSettings();

        const tabsData: ITabYML[] = tabFiles.map(tabFileName => {
            const filePath = path.join(settings.TABS_PATH, tabFileName);
            const tabData: ITabYML = readYML(filePath);
            return {
                repository_id: tabData.repository_id,
                created_at: tabData.created_at,
                source: tabData.source,
                file_name: tabData.file_name,
                tabs: tabData.tabs
            };
        });
        return tabsData;
    }

    static sendTabsToServer(webSocketConnection: any, tabEventsToSend: ITabYML[]) {
        webSocketConnection.send(JSON.stringify({ 'tabs': tabEventsToSend }));
    }
}
