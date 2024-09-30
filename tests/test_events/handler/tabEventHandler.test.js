import fs from "fs";
import path from "path";
import vscode from 'vscode'
import untildify from "untildify";
import { DEFAULT_BRANCH } from "../../../src/constants";
import {
    randomBaseRepoPath,
    randomRepoPath,
    addUser,
    Config,
    getConfigFilePath,
} from "../../helpers/helpers";

import { bufferHandler } from "../../../src/codesyncd/handlers/buffer_handler";
import { readYML } from "../../../src/utils/common";
import { formatDatetime } from '../../../src/utils/common';
import { VSCODE } from "../../../src/constants";
import { pathUtils } from "../../../src/utils/path_utils";
import { tabEventHandler } from "../../../src/events/tab_event_handler";
import { createSystemDirectories, generateRandomNumber } from "../../../src/utils/setup_utils";

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

describe("addTab", () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const configUtil = new Config(repoPath, configPath);
    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const tabsRepo = pathUtilsObj.getTabsRepo();
    const newFilePath1 = path.join(repoPath, "file_1.js");
    const newFilePath2 = path.join(repoPath, "directory", "documents", "new2.js");

    beforeEach(() => {
        jest.clearAllMocks();
        // Create directories
        fs.mkdirSync(repoPath, { recursive: true });
        createSystemDirectories();
        untildify.mockReturnValue(baseRepoPath);
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    const assertTabFilesCount = (tabsCount = 0) => {
        let tabFiles = fs.readdirSync(tabsRepo);
        expect(tabFiles).toHaveLength(tabsCount);
        return true;
    }

    // Skips case when repo exists
    test("Should be skipped if repo does not exist", () => {
        const handler = new tabEventHandler();
        handler.handleTabChangeEvent();
        // Verify no tab file should be generated
        assertTabFilesCount()
    });

    //  Skips cases where repo exists, but is not connected
    test("Should skip if repo exists, but is not connected", () => {
        const handler = new tabEventHandler(repoPath);
        handler.handleTabChangeEvent();
        // Verify no tab file should be generated
        assertTabFilesCount()
    })

    // Skip case where repo is connected, but user account is not valid
    test("Should skip if repo is connected, but user account is not valid", () => {
        configUtil.addRepo();
        addUser(baseRepoPath, false);
        const handler = new tabEventHandler(repoPath);
        handler.handleTabChangeEvent(false);
        // Verify no tab file should be generated
        assertTabFilesCount()
    })

    // Skip case where user account is not valid, but repo is not connected 
    test("Should skip if user account is valid, but repo is not connected", () => {
        addUser(baseRepoPath, true);
        const handler = new tabEventHandler(repoPath);
        handler.handleTabChangeEvent();
        // Verify no tab file should be generated
        assertTabFilesCount()
    })

    // Should skip if not opened/closed event
    test("Should skip if not opened/closed event", () => {
        // Repo is connected & user account is also valid
        configUtil.addRepo();
        addUser(baseRepoPath, true);
        const handler = new tabEventHandler(repoPath);
        // Record timestamp
        const createdAt = formatDatetime(new Date().getTime());
        // Pass isTabEvent=false, which means changeEvent.changed.length > 0
        handler.handleTabChangeEvent(createdAt, false);
        // Verify no tab file should be generated
        assertTabFilesCount()
    })

    // Skip if invalid repo id
    test("Should skip if repoId doesn't exist", () => {
        const invalid_repo_path = (repoPath).slice(0, 5);
        const configUtil_2 = new Config(invalid_repo_path, configPath);
        addUser(baseRepoPath, true);
        const handler = new tabEventHandler(invalid_repo_path);
        handler.handleTabChangeEvent(true);
        // Verify no tab file should be generated
        assertTabFilesCount()
    })

    // Should create file in positive case
    test("Tabs data in positive case", () => {
        const tabCreationTime = new Date();
        configUtil.addRepo();
        addUser(baseRepoPath, true);
        const config_data = readYML(configPath);
        const tab1_fileId = config_data.repos[repoPath].branches[DEFAULT_BRANCH]["file_1.js"]
        const repo_id = config_data.repos[repoPath].id;
        const mockTabs = [
            {
                tabs: [
                    {
                        input: {
                            uri: {
                                path: newFilePath1,
                            }
                        },
                        isActive: true,
                    },
                    {
                        input: {
                            uri: {
                                path: newFilePath2,
                            }
                        },
                        isActive: false,
                    },
                ]
            }
        ]
        Object.defineProperty(vscode.window.tabGroups, 'all', {
            get: jest.fn(() => mockTabs),
        });
        const handler = new tabEventHandler(repoPath);
        // Record timestamp
        const createdAt = formatDatetime(new Date().getTime());
        handler.handleTabChangeEvent(createdAt)
        let tabFiles = fs.readdirSync(tabsRepo)
        // Assert file should be created
        expect(tabFiles).toHaveLength(1);
        const tabFilePath = path.join(tabsRepo, tabFiles[0]);
        const tabData = readYML(tabFilePath);
        const filePath1 = newFilePath1.split(path.join(repoPath, path.sep));
        const filePath2 = newFilePath2.split(path.join(repoPath, path.sep));
        // Assert source == 'vscode'
        expect(tabData.source).toEqual(VSCODE);
        // Assert created_at value of tab file and testing value to be in range of 1 second
        expect((new Date(tabData.created_at)).getTime() - (tabCreationTime).getTime()).toBeLessThanOrEqual(1000);
        // Assert repo_id
        expect(tabData.repository_id).toEqual(repo_id);
        // Assert tabs
        expect(tabData.tabs[0].file_id).toBe(tab1_fileId);
        expect(tabData.tabs[0].path).toBe(filePath1[1]);
        expect(tabData.tabs[1].file_id).toBeNull();
        expect(tabData.tabs[1].path).toBe(filePath2[1]);
    });

     // Should discard invalid tab and send nothing
     test.only("Discard unrecognized tab and send nothing", () => {
        /*
        - Should discard invalid tab
        - Should not create .yml file
        - Should not send any data
        */
        configUtil.addRepo();
        addUser(baseRepoPath, true);
        const mockTabs = [
            {
                tabs: [
                    {
                        input: undefined,
                        isActive: false,
                    },
                ]
            }
        ]
        Object.defineProperty(vscode.window.tabGroups, 'all', {
            get: jest.fn(() => mockTabs),
        });
        const handler = new tabEventHandler(repoPath);
        // Record timestamp
        const createdAt = formatDatetime(new Date().getTime());
        handler.handleTabChangeEvent(createdAt)
        let tabFiles = fs.readdirSync(tabsRepo)
        // Assert file should not be created
        expect(tabFiles).toHaveLength(0);
    });

     // Should discard invalid tab and send valid tabs
     test("Discard unrecognized tab and send valid tabs", () => {
        /*
        - Should discard invalid tab
        - Should create .yml file
        - Should send any data for valid tabs
        */
        const tabCreationTime = new Date();
        configUtil.addRepo();
        addUser(baseRepoPath, true);
        const config_data = readYML(configPath);
        const tab1_fileId = config_data.repos[repoPath].branches[DEFAULT_BRANCH]["file_1.js"]
        const repo_id = config_data.repos[repoPath].id;
        const mockTabs = [
            {
                tabs: [
                    {
                        input: {
                            uri: {
                                path: newFilePath1,
                            }
                        },
                        isActive: true,
                    },
                    {
                        input: {
                            uri: {
                                path: newFilePath2,
                            }
                        },
                        isActive: false,
                    },
                    {
                        input: undefined,
                        isActive: false,
                    },
                ]
            }
        ]
        Object.defineProperty(vscode.window.tabGroups, 'all', {
            get: jest.fn(() => mockTabs),
        });
        const handler = new tabEventHandler(repoPath);
        // Record timestamp
        const createdAt = formatDatetime(new Date().getTime());
        handler.handleTabChangeEvent(createdAt)
        let tabFiles = fs.readdirSync(tabsRepo)
        // Assert file should be created
        expect(tabFiles).toHaveLength(1);
        const tabFilePath = path.join(tabsRepo, tabFiles[0]);
        const tabData = readYML(tabFilePath);
        const filePath1 = newFilePath1.split(path.join(repoPath, path.sep));
        const filePath2 = newFilePath2.split(path.join(repoPath, path.sep));
        // Assert source == 'vscode'
        expect(tabData.source).toEqual(VSCODE);
        // Assert created_at value of tab file and testing value to be in range of 1 second
        expect((new Date(tabData.created_at)).getTime() - (tabCreationTime).getTime()).toBeLessThanOrEqual(1000);
        // Assert repo_id
        expect(tabData.repository_id).toEqual(repo_id);
        // Assert tabs
        expect(tabData.tabs[0].file_id).toBe(tab1_fileId);
        expect(tabData.tabs[0].path).toBe(filePath1[1]);
        expect(tabData.tabs[1].file_id).toBeNull();
        expect(tabData.tabs[1].path).toBe(filePath2[1]);
    });

})
