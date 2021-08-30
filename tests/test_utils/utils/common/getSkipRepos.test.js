import fs from "fs";
import { getSkipRepos, getSyncIgnoreItems } from "../../../../src/utils/common";
import { randomRepoPath } from "../../../helpers/helpers";
import { IGNORABLE_DIRECTORIES } from "../../../../src/constants";

const repoPath = randomRepoPath();
const syncIgnorePath = `${repoPath}/.syncignore`;
const syncIgnoreData = ".skip_repo_1\n\n\n.skip_repo_2\n";

beforeAll(() => {
    if (fs.existsSync(repoPath)) {
        fs.rmdirSync(repoPath);
    }
    // Create directories
    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(`${repoPath}/.skip_repo_1`, { recursive: true });
    fs.mkdirSync(`${repoPath}/.skip_repo_2`, { recursive: true });
    fs.writeFileSync(`${repoPath}/file.js`, "");
});

afterAll(() => {
    fs.rmdirSync(repoPath, { recursive: true });
});

test('skipRepos with .syncignore items', () => {
    fs.writeFileSync(syncIgnorePath, syncIgnoreData);
    const syncIgnoreItems = getSyncIgnoreItems(repoPath);
    expect(getSkipRepos(repoPath, syncIgnoreItems)).toEqual([...IGNORABLE_DIRECTORIES, ...syncIgnoreItems]);
    fs.rmSync(syncIgnorePath);
});

test('skipRepos with NO .syncignore, default values', () => {
    expect(getSkipRepos(repoPath, [])).toStrictEqual(IGNORABLE_DIRECTORIES);
});

test('skipRepos with non-existing .syncignore item', () => {
    expect(getSkipRepos(repoPath, ["directory"])).toStrictEqual(IGNORABLE_DIRECTORIES);
});

test('skipRepos with file in syncignore', () => {
    expect(getSkipRepos(repoPath, ["file.js"])).toStrictEqual(IGNORABLE_DIRECTORIES);
});
