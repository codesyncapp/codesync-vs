import fs from "fs";
import path from "path";
import untildify from "untildify";
import {DATETIME_FORMAT, DEFAULT_BRANCH} from "../../../src/constants";
import {
    randomBaseRepoPath,
    randomRepoPath,
    addUser,
    Config,
    getConfigFilePath,
    DUMMY_FILE_CONTENT
} from "../../helpers/helpers";
import dateFormat from "dateformat";
import {readYML} from "../../../src/utils/common";
import {VSCODE} from "../../../src/constants";
import {pathUtils} from "../../../src/utils/path_utils";
import {tabEventHandler} from "../../../src/events/tab_event_handler";
import { createSystemDirectories } from "../../../src/utils/setup_utils";

// Helper method that asserts that no tabs were recorded
const assertNoTabsRecorded = (tabsRepo) => {
    // Verify no tab file should be generated
    let tabFiles = fs.readdirSync(tabsRepo);
    console.log("Tab files:", tabFiles);
    expect(tabFiles).toHaveLength(0);    
}

describe("addTab", () => {
	const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const configUtil = new Config(repoPath, configPath);
    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const tabsRepo = pathUtilsObj.getTabsRepo();
    const newFilePath = path.join(repoPath, "new.js");

    beforeEach(() => {
        // Create directories
        fs.mkdirSync(repoPath, { recursive: true });
        fs.mkdirSync(tabsRepo, { recursive: true });
        createSystemDirectories();   
        console.log(`Creating directories: repoPath=${repoPath}, tabsRepo=${tabsRepo}`);     
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        const returnedPath = untildify();
        console.log(`untildify returned: ${returnedPath}`);
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test('untildify should return the correct mocked path', () => {
        untildify.mockReturnValue(baseRepoPath);
        expect(untildify()).toBe(baseRepoPath);
    });
    
    // Skips case when repo exists
    test("Should be skipped if repo does not exist",() => {
        const handler = new tabEventHandler();
        handler.handleTabChangeEvent();
        // Verify no tab file should be generated
        assertNoTabsRecorded(tabsRepo)   
        });

    //  Skips cases where repo exists, but is not connected
    test("Should skip if repo exists, but is not connected", () => {
        const handler = new tabEventHandler(repoPath);
        handler.handleTabChangeEvent();
        // Verify no tab file should be generated
        assertNoTabsRecorded(tabsRepo)    
    })

    // Skip case where repo is connected, but user account is not valid
    test("Should skip if repo is connected, but user account is not valid", () => {
        configUtil.addRepo();
        addUser(baseRepoPath, false);
        const handler = new tabEventHandler(repoPath);
        handler.handleTabChangeEvent();
        // Verify no tab file should be generated
        assertNoTabsRecorded(tabsRepo)       
    })

    // Skip case where user account is not valid, but repo is not connected 
    test("Should skip if user account is valid, but repo is not connected", () => {
        addUser(baseRepoPath, true);
        const handler = new tabEventHandler(repoPath);
        handler.handleTabChangeEvent();
        // Verify no tab file should be generated
        assertNoTabsRecorded(tabsRepo)      
    })

    // Skip case where file is changed
    test("Should skip if file is changed", () => {
        // Repo is connected & user account is also valid
        configUtil.addRepo();
        addUser(baseRepoPath, true);
        const handler = new tabEventHandler(repoPath);
        // Pass isTabEvent=false, which means changeEvent.changed.length > 0
        handler.handleTabChangeEvent(false);
        // Verify no tab file should be generated
        assertNoTabsRecorded(tabsRepo)    
    })

    // Skip if invalid repo id
    test("Should skip is repoId doesn't exist", () => {
        const invalid_repo_path = "/home/documents"
        const configUtil_2 = new Config(invalid_repo_path, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath, true);
        const handler = new tabEventHandler(invalid_repo_path);
        handler.handleTabChangeEvent(true);
        // Verify no tab file should be generated
        assertNoTabsRecorded(tabsRepo)    
    })
})