import fs from "fs";

import {isGitFile} from "../../../../src/events/utils";
import {randomRepoPath} from "../../../helpers/helpers";

const gitFilePath = ".git/objects/12345";
const normalFilePath = "abc/12345.js";

const repoPath = randomRepoPath();

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

test("isGitFile to be true",  () => {
    expect(isGitFile(gitFilePath)).toBe(true);
});

test("isGitFile to be false",  () => {
    expect(isGitFile(normalFilePath)).toBe(false);
});
