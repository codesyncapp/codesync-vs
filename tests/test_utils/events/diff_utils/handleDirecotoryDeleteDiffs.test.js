import fs from "fs";
import path from "path";
import untildify from "untildify";
import {readYML} from "../../../../src/utils/common";
import {DEFAULT_BRANCH, DIFF_SOURCE} from "../../../../src/constants";
import {randomBaseRepoPath, randomRepoPath, waitFor} from "../../../helpers/helpers";
import {handleDirectoryDeleteDiffs} from "../../../../src/events/diff_utils";
import {pathUtils} from "../../../../src/utils/path_utils";


describe("handleDirectoryDeleteDiffs", () => {

    const repoPath = randomRepoPath();

    const baseRepoPath = randomBaseRepoPath();
    const cacheRepoPath = path.join(baseRepoPath, ".deleted");
    const diffsRepo = path.join(baseRepoPath, ".diffs", ".vscode");

    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
    const cacheRepoBranchPath = pathUtilsObj.getDeletedRepoBranchPath();

    const shadowDirectoryPath = path.join(shadowRepoBranchPath, "directory");
    const shadowFilePath = path.join(shadowDirectoryPath, "file.js");
    const relFilePath = path.join("directory", "file.js");
    const cacheFilePath = path.join(cacheRepoBranchPath, relFilePath);

    beforeEach(() => {
        jest.clearAllMocks();
        fs.mkdirSync(repoPath, { recursive: true });
        fs.mkdirSync(diffsRepo, { recursive: true });
        fs.mkdirSync(cacheRepoPath, { recursive: true });
        fs.mkdirSync(shadowDirectoryPath, { recursive: true });
        fs.writeFileSync(shadowFilePath, "use babel;");
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("NOT in .deleted",  async () => {
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
        untildify.mockReturnValue(baseRepoPath);
        await handleDirectoryDeleteDiffs(repoPath, DEFAULT_BRANCH, "directory");
        await waitFor(1);
        // Verify file has been renamed in the shadow repo
        expect(fs.existsSync(cacheFilePath)).toBe(true);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(1);
        const diffFilePath = path.join(diffsRepo, diffFiles[0]);
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

    test("with file already in .deleted",  async () => {
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(path.join(cacheRepoBranchPath, "directory"), { recursive: true });
        fs.writeFileSync(cacheFilePath, "use babel;");
        await handleDirectoryDeleteDiffs(repoPath, DEFAULT_BRANCH, "directory");
        await waitFor(1);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

});

