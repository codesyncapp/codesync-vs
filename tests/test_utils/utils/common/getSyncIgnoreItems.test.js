import fs from "fs";
import { getSyncIgnoreItems } from "../../../../src/utils/common";
import { randomRepoPath, SYNC_IGNORE_DATA } from "../../../helpers/helpers";

const repoPath = randomRepoPath();
const syncIgnorePath = `${repoPath}/.syncignore`;

beforeAll(() => {
    // Create directories
    fs.mkdirSync(repoPath, { recursive: true });
});

afterAll(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
});

test('syncIgnore items with .syncignore', () => {
    fs.writeFileSync(syncIgnorePath, SYNC_IGNORE_DATA);
    expect(getSyncIgnoreItems(repoPath)).toStrictEqual([".DS_Store", ".git", ".node_modules"]);
    fs.rmSync(syncIgnorePath);
});

test('syncIgnore items with NO .syncignore', () => {
    expect(getSyncIgnoreItems(repoPath)).toStrictEqual([]);
});
