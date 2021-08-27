import path from "path";
import fs from "fs";
import {randomBaseRepoPath, randomRepoPath, waitFor} from "../../../helpers/helpers";
import {readYML} from "../../../../src/utils/common";
import {DEFAULT_BRANCH, DIFF_SOURCE} from "../../../../out/constants";
import {handleDirectoryDeleteDiffs} from "../../../../src/events/diff_utils";

const repoPath = randomRepoPath();

const baseRepo = randomBaseRepoPath();
const shadowRepoPath = path.join(baseRepo, ".shadow");
const cacheRepoPath = path.join(baseRepo, ".deleted");
const diffsRepo = path.join(baseRepo, ".diffs");
const shadowRepoBranchPath = path.join(shadowRepoPath, `${repoPath}/${DEFAULT_BRANCH}`);
const cacheRepoBranchPath = path.join(cacheRepoPath, `${repoPath}/${DEFAULT_BRANCH}`);

const shadowDirectoryPath = `${shadowRepoBranchPath}/directory`;
const shadowFilePath = `${shadowDirectoryPath}/file.js`;
const relFilePath = "directory/file.js";
const cacheFilePath = `${cacheRepoBranchPath}/${relFilePath}`;


beforeEach(() => {
    // Create directories
    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(diffsRepo, { recursive: true });
    fs.mkdirSync(cacheRepoPath, { recursive: true });
    fs.mkdirSync(shadowDirectoryPath, { recursive: true });
    fs.writeFileSync(shadowFilePath, "use babel;");
});

afterEach(() => {
    fs.rmdirSync(baseRepo, { recursive: true });
    fs.rmdirSync(repoPath, { recursive: true });
});

test("handleDirectoryDeleteDiffs",  async () => {
    /*
     *
     {
        source: 'vs-code',
        created_at: '2021-08-26 18:59:51.954',
        diff: '{"old_abs_path":"tests/tests_data/test_repo_sNIVUqukDv/old.js","new_abs_path":"tests/tests_data/test_repo_sNIVUqukDv/new.js","old_rel_path":"old.js","new_rel_path":"new.js"}',
        repo_path: 'tests/tests_data/test_repo_sNIVUqukDv',
        branch: 'default',
        file_relative_path: 'new.js',
        is_deleted: true
      }
    *
    * */
    handleDirectoryDeleteDiffs(repoPath, DEFAULT_BRANCH, "directory", shadowRepoPath, cacheRepoPath, diffsRepo);
    await waitFor(1);
    // Verify file has been renamed in the shadow repo
    expect(fs.existsSync(cacheFilePath)).toBe(true);
    // Verify correct diff file has been generated
    let diffFiles = fs.readdirSync(diffsRepo);
    expect(diffFiles).toHaveLength(1);
    const diffFilePath = `${diffsRepo}/${diffFiles[0]}`;
    const diffData = readYML(diffFilePath);
    expect(diffData.source).toEqual(DIFF_SOURCE);
    expect(diffData.is_deleted).toBe(true);
    expect(diffData.is_rename).toBeFalsy();
    expect(diffData.is_new_file).toBeFalsy();
    expect(diffData.created_at).toBeTruthy();
    expect(diffData.repo_path).toEqual(repoPath);
    expect(diffData.branch).toEqual(DEFAULT_BRANCH);
    expect(diffData.file_relative_path).toEqual(relFilePath);
    expect(diffData.diff).toEqual("");
});

test("handleDirectoryDeleteDiffs with file already in .deleted",  async () => {
    fs.mkdirSync(`${cacheRepoBranchPath}/directory`, { recursive: true });
    fs.writeFileSync(cacheFilePath, "use babel;");
    handleDirectoryDeleteDiffs(repoPath, DEFAULT_BRANCH, "directory", shadowRepoPath, cacheRepoPath, diffsRepo);
    await waitFor(1);
    // Verify correct diff file has been generated
    let diffFiles = fs.readdirSync(diffsRepo);
    expect(diffFiles).toHaveLength(0);
});
