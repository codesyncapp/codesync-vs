import fs from "fs";
import os from "os";
import path from "path";
import untildify from "untildify";
import { getGlobIgnorePatterns, getSyncIgnoreItems, getDefaultIgnorePatterns } from "../../../src/utils/common";
import { createSystemDirectories, createOrUpdateSyncignore } from "../../../src/utils/setup_utils";
import { getSyncIgnoreFilePath, randomBaseRepoPath, randomRepoPath, DEFAULT_SYNCIGNORE_TEST_DATA } from "../../helpers/helpers";


describe("getGlobIgnorePatterns",  () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const syncIgnorePath = getSyncIgnoreFilePath(repoPath);
    const syncIgnoreData = `.skip_repo_1/
ignore.js
skip_repo_2/**
!.skip_repo_3/*
.skip_repo_4\file.js
`;
    const patternRepoPath = os.platform() === 'win32' ? repoPath.replace(/\\/g, "/") : repoPath;
    let defaultSkipPaths;

    beforeEach(async () => {
        // Create directories
        fs.mkdirSync(repoPath, { recursive: true });
        untildify.mockReturnValue(baseRepoPath);
        fetch.resetMocks();
        fetchMock.mockResponseOnce(DEFAULT_SYNCIGNORE_TEST_DATA);
        createSystemDirectories();
        await createOrUpdateSyncignore();
        defaultSkipPaths = getDefaultIgnorePatterns();
        fs.mkdirSync(path.join(repoPath, ".skip_repo_1"), { recursive: true });
        fs.mkdirSync(path.join(repoPath, "skip_repo_2"), { recursive: true });
        fs.writeFileSync(path.join(repoPath, "file.js"), "");
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
    });

    test('With no .syncignore, default values', () => {
        const skippedPaths = getGlobIgnorePatterns(repoPath, []);
        for (let pattern of defaultSkipPaths) {
            if (pattern.endsWith("/")) {
                pattern = `**/${pattern}**`;
            } else {
                pattern = `**/${pattern}`;
            }
            expect(skippedPaths.includes(pattern)).toStrictEqual(true);
        }
    });

    test('with .syncignore items', () => {
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        let syncIgnoreItems = getSyncIgnoreItems(repoPath);
        const skippedRepos = getGlobIgnorePatterns(repoPath, syncIgnoreItems);
        const syncIgnorePatterns = skippedRepos.slice(defaultSkipPaths.length);
        expect(syncIgnorePatterns).toEqual(["**/.skip_repo_1/**", "**/skip_repo_2/**"]);
        // skip_repo_3 is negated, so should not be included
        expect(syncIgnorePatterns.includes("**/!.skip_repo_3/**")).toEqual(false);
        // skip_repo_4 is non existant
        expect(syncIgnorePatterns.includes(".skip_repo_4")).toEqual(false);
        // file path shouldn't be included
        expect(syncIgnorePatterns.includes("ignore.js")).toEqual(false);
    });
});
