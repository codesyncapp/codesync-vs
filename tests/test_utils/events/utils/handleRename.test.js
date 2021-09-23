import fs from "fs";
import path from "path";
import untildify from "untildify";
import {handleRename} from "../../../../src/events/utils";
import {randomBaseRepoPath, randomRepoPath, waitFor} from "../../../helpers/helpers";
import {readYML} from "../../../../src/utils/common";
import {DEFAULT_BRANCH, DIFF_SOURCE} from "../../../../src/constants";
import {pathUtils} from "../../../../src/utils/path_utils";


describe("handleRenameFile",  () => {
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();

    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
    const diffsRepo = pathUtilsObj.getDiffsRepo();

    // For file rename
    const oldFilePath = path.join(repoPath, "old.js");
    const newFilePath = path.join(repoPath, "new.js");
    const oldShadowFilePath = path.join(shadowRepoBranchPath, "old.js");
    const renamedShadowFilePath = path.join(shadowRepoBranchPath, "new.js");

    // For directory rename
    const oldDirectoryPath = path.join(repoPath, "old");
    const newDirectoryPath = path.join(repoPath, "new");
    const oldDirectoryFilePath = path.join(oldDirectoryPath, "file.js");
    const newDirectoryFilePath = path.join(newDirectoryPath, "file.js");
    const oldShadowDirectoryPath = path.join(shadowRepoBranchPath, "old");
    const renamedShadowDirectoryPath = path.join(shadowRepoBranchPath, "new");
    const oldShadowDirectoryFilePath = path.join(oldShadowDirectoryPath, "file.js");
    const renamedShadowDirectoryFilePath = path.join(renamedShadowDirectoryPath, "file.js");

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        // Create directories
        fs.mkdirSync(repoPath, { recursive: true });
        fs.mkdirSync(diffsRepo, { recursive: true });

        fs.mkdirSync(shadowRepoBranchPath, { recursive: true });
        fs.writeFileSync(oldShadowFilePath, "use babel;");

        // For directory rename, repo will have new directory but shadow will have old repo
        fs.mkdirSync(newDirectoryPath, { recursive: true });
        fs.writeFileSync(newDirectoryFilePath, "use babel;");

        fs.mkdirSync(oldShadowDirectoryPath, { recursive: true });
        fs.writeFileSync(oldShadowDirectoryFilePath, "use babel;");
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("for File",  () => {
        /*
         *
         {
            source: 'vs-code',
            created_at: '2021-08-26 18:59:51.954',
            diff: '{"old_abs_path":"tests/tests_data/test_repo_sNIVUqukDv/old.js","new_abs_path":"tests/tests_data/test_repo_sNIVUqukDv/new.js","old_rel_path":"old.js","new_rel_path":"new.js"}',
            repo_path: 'tests/tests_data/test_repo_sNIVUqukDv',
            branch: 'default',
            file_relative_path: 'new.js',
            is_rename: true
          }
        *
        * */
        handleRename(repoPath, DEFAULT_BRANCH, oldFilePath, newFilePath, true);
        // Verify file has been renamed in the shadow repo
        expect(fs.existsSync(renamedShadowFilePath)).toBe(true);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(1);
        const diffFilePath = path.join(diffsRepo, diffFiles[0]);
        const diffData = readYML(diffFilePath);
        expect(diffData.source).toEqual(DIFF_SOURCE);
        expect(diffData.is_rename).toBe(true);
        expect(diffData.is_new_file).toBeFalsy();
        expect(diffData.is_deleted).toBeFalsy();
        expect(diffData.repo_path).toEqual(repoPath);
        expect(diffData.branch).toEqual(DEFAULT_BRANCH);
        expect(diffData.file_relative_path).toEqual("new.js");
        expect(JSON.parse(diffData.diff).old_abs_path).toEqual(oldFilePath);
        expect(JSON.parse(diffData.diff).new_abs_path).toEqual(newFilePath);
        expect(JSON.parse(diffData.diff).old_rel_path).toEqual("old.js");
        expect(JSON.parse(diffData.diff).new_rel_path).toEqual("new.js");
        fs.rmSync(diffFilePath);
    });

    test("for Directory",  async() => {
        handleRename(repoPath, DEFAULT_BRANCH, oldDirectoryPath, newDirectoryPath, false);
        expect(fs.existsSync(renamedShadowDirectoryPath)).toBe(true);
        expect(fs.existsSync(renamedShadowDirectoryFilePath)).toBe(true);
        await waitFor(1);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(1);
        const diffFilePath = path.join(diffsRepo, diffFiles[0]);
        const diffData = readYML(diffFilePath);
        expect(diffData.source).toEqual(DIFF_SOURCE);
        expect(diffData.is_rename).toBe(true);
        expect(diffData.is_new_file).toBeFalsy();
        expect(diffData.is_deleted).toBeFalsy();
        expect(diffData.repo_path).toEqual(repoPath);
        expect(diffData.branch).toEqual(DEFAULT_BRANCH);
        expect(diffData.file_relative_path).toEqual(path.join("new", "file.js"));
        expect(JSON.parse(diffData.diff).old_abs_path).toEqual(oldDirectoryFilePath);
        expect(JSON.parse(diffData.diff).new_abs_path).toEqual(newDirectoryFilePath);
        expect(JSON.parse(diffData.diff).old_rel_path).toEqual(path.join("old", "file.js"));
        expect(JSON.parse(diffData.diff).new_rel_path).toEqual(path.join("new", "file.js"));
        fs.rmSync(diffFilePath);
    });
});
