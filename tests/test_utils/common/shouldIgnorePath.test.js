import fs from "fs";
import path from "path";
import untildify from "untildify";
import {shouldIgnorePath, getDefaultIgnorePatterns} from "../../../src/utils/common";
import { createSystemDirectories, createOrUpdateSyncignore } from "../../../src/utils/setup_utils";

import {
    getSyncIgnoreFilePath,
    randomBaseRepoPath,
    randomRepoPath, 
    DEFAULT_SYNCIGNORE_TEST_DATA
} from "../../helpers/helpers";

const baseRepoPath = randomBaseRepoPath();

const gitFilePath = path.join(".git", "objects", "12345");

const repoPath = randomRepoPath();
const syncIgnorePath = getSyncIgnoreFilePath(repoPath);
const syncIgnoreData = ".git\n\n\n.skip_repo_1\nignore.js";

const normalFilePath = path.join(repoPath, "12345.js");
const ignorableFilePath = path.join(repoPath, "ignore.js");


describe("shouldIgnorePath",  () => {
    let defaultSkipPaths;
    beforeEach(async () => {
        untildify.mockReturnValue(baseRepoPath);
        // Create directories
        fs.mkdirSync(repoPath, { recursive: true });
        fs.mkdirSync(baseRepoPath, { recursive: true });
        fetch.resetMocks();
        fetchMock.mockResponseOnce(DEFAULT_SYNCIGNORE_TEST_DATA);
        createSystemDirectories();
        await createOrUpdateSyncignore();
        defaultSkipPaths = getDefaultIgnorePatterns();
        fs.writeFileSync(normalFilePath, "use babel;");
        fs.writeFileSync(ignorableFilePath, "use babel;");
        fs.writeFileSync(ignorableFilePath, "use babel;");
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Standard ignorable directories",  () => {
        const patterns = DEFAULT_SYNCIGNORE_TEST_DATA.split("\n").filter(p => p && !p.startsWith("#") && !p.startsWith("!"));
        patterns.forEach((item) => {
            expect(shouldIgnorePath(item, defaultSkipPaths, [])).toBe(true);
        });
    });

    test("with normal file and no .syncignore",  () => {
        expect(shouldIgnorePath("12345.js", defaultSkipPaths, [])).toBe(false);
    });

    test("with file not in .syncignore",  () => {
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        const syncignorePatterns = syncIgnoreData.split("\n").filter(p => p && !p.startsWith("#"));
        expect(shouldIgnorePath("12345.js", defaultSkipPaths, syncignorePatterns)).toBe(false);
    });

    test("with file in .syncignore",  () => {
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        const syncignorePatterns = syncIgnoreData.split("\n").filter(p => p && !p.startsWith("#"));
        expect(shouldIgnorePath("ignore.js", defaultSkipPaths, syncignorePatterns)).toBe(true);
    });
});

