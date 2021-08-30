import * as fs from "fs";
import { getSyncIgnoreItems } from "../../../../src/utils/common";
import { randomRepoPath } from "../../../helpers/helpers";

const repoPath = randomRepoPath();
const syncIgnorePath = `${repoPath}/.syncignore`;
const syncIgnoreData = ".DS_Store\n.git\n\n\n.node_modules\n";

beforeAll(() => {
    if (fs.existsSync(repoPath)) {
        fs.rmdirSync(repoPath);
    }
    // Create directories
    fs.mkdirSync(repoPath, { recursive: true });
});

afterAll(() => {
    fs.rmdirSync(repoPath, { recursive: true });
});

test('syncIgnore items with .syncignore', () => {
    fs.writeFileSync(syncIgnorePath, syncIgnoreData);
    expect(getSyncIgnoreItems(repoPath)).toStrictEqual([".DS_Store", ".git", ".node_modules"]);
    fs.rmSync(syncIgnorePath);
});

test('syncIgnore items with NO .syncignore', () => {
    expect(getSyncIgnoreItems(repoPath)).toStrictEqual([]);
});
