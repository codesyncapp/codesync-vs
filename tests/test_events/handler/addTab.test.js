import fs from "fs";
import path from "path";
import untildify from "untildify";
import {DATETIME_FORMAT, DEFAULT_BRANCH} from "../../../src/constants";
import {randomBaseRepoPath, randomRepoPath} from "../../helpers/helpers";
import dateFormat from "dateformat";
import {readYML} from "../../../src/utils/common";
import {VSCODE} from "../../../src/constants";
import {pathUtils} from "../../../src/utils/path_utils";
import {tabEventHandler} from "../../../src/events/tab_event_handler";
import { createSystemDirectories } from "../../../src/utils/setup_utils";

describe("addTab", () => {

	const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
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
    
    // Skips cases where repo is not connected OR file is changed
    test("should be skipped",() => {
        // Case: repo is not connected
        // const repo_path = null;
        const handler = new tabEventHandler(repoPath);
        handler.handleTabChangeEvent();
        // Verify no diff file should be generated
        try {
            console.log(`Tabs Repo`)
            let tabFiles = fs.readdirSync(tabsRepo);
            console.log("Tab files:", tabFiles);
            expect(tabFiles).toHaveLength(0);
        } catch (err) {
            console.error("Error reading tabsRepo directory:", err);
            throw err; // Re-throw the error to let the test fail
        }
        });

})