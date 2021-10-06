import fs from "fs";
import path from "path";
import {shouldIgnoreFile} from "../../../src/events/utils";
import {getSyncIgnoreFilePath, randomBaseRepoPath, randomRepoPath} from "../../helpers/helpers";
import {IGNORABLE_DIRECTORIES} from "../../../src/constants";

const baseRepoPath = randomBaseRepoPath();

const gitFilePath = path.join(".git", "objects", "12345");

const repoPath = randomRepoPath();
const syncIgnorePath = getSyncIgnoreFilePath(repoPath);
const syncIgnoreData = ".git\n\n\n.skip_repo_1\nignore.js";

const normalFilePath = path.join(repoPath, "12345.js");
const ignorableFilePath = path.join(repoPath, "ignore.js");


describe("shouldIgnoreFile",  () => {
    beforeEach(() => {
        // Create directories
        fs.mkdirSync(repoPath, { recursive: true });
        // Create directories
        fs.mkdirSync(baseRepoPath, { recursive: true });
        fs.writeFileSync(normalFilePath, "use babel;");
        fs.writeFileSync(ignorableFilePath, "use babel;");
        fs.writeFileSync(ignorableFilePath, "use babel;");
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Standard ignorable directories",  () => {
        IGNORABLE_DIRECTORIES.forEach((item) => {
            expect(shouldIgnoreFile(repoPath, item)).toBe(true);
        });
    });

    test("with normal file and no .syncignore",  () => {
        expect(shouldIgnoreFile(repoPath, "12345.js")).toBe(false);
    });

    test("with normal file and with .syncignore",  () => {
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        expect(shouldIgnoreFile(repoPath, "12345.js")).toBe(false);
    });

    test("with file name in .syncignore",  () => {
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        expect(shouldIgnoreFile(repoPath, "ignore.js")).toBe(true);
    });
});

