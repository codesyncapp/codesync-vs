import fs from "fs";
import path from "path";
import { getSkipPaths, getSyncIgnoreItems } from "../../../src/utils/common";
import { getSyncIgnoreFilePath, randomRepoPath } from "../../helpers/helpers";
import { IGNORABLE_DIRECTORIES } from "../../../src/constants";


describe("getSkipPaths",  () => {
    const repoPath = randomRepoPath();
    const syncIgnorePath = getSyncIgnoreFilePath(repoPath);
    const syncIgnoreData = ".skip_repo_1\n\n\n.skip_repo_2\n!.skip_repo_3";
    const defaultSkipPaths = [...IGNORABLE_DIRECTORIES.map(ignoreDir => `${repoPath}/**/${ignoreDir}/**`)];

    beforeEach(() => {
        // Create directories
        fs.mkdirSync(repoPath, { recursive: true });
        fs.mkdirSync(path.join(repoPath, ".skip_repo_1"), { recursive: true });
        fs.mkdirSync(path.join(repoPath, ".skip_repo_2"), { recursive: true });
        fs.writeFileSync(path.join(repoPath, "file.js"), "");
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
    });

    test('skipRepos with .syncignore items', () => {
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        let syncIgnoreItems = getSyncIgnoreItems(repoPath);
        const skippedRepos = getSkipPaths(repoPath, syncIgnoreItems);
        const syncIgnoreItemsForGlob = syncIgnoreItems.map(item => `${repoPath}/${item}/**`);
        expect(skippedRepos).toEqual([...defaultSkipPaths, ...syncIgnoreItemsForGlob]);
    });

    test('skipRepos with NO .syncignore, default values', () => {
        const skippedRepos = getSkipPaths(repoPath, []);
        expect(skippedRepos).toStrictEqual(defaultSkipPaths);
    });

    test('with non-existing .syncignore item', () => {
        const skippedRepos = getSkipPaths(repoPath, ["directory"]);
        expect(skippedRepos).toStrictEqual(defaultSkipPaths);
    });

    test('with file in syncignore', () => {
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        const skippedRepos = getSkipPaths(repoPath, ["file.js"]);
        expect(skippedRepos).toStrictEqual(defaultSkipPaths);
    });
});
