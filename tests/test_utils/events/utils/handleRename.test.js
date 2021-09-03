import path from "path";
import fs from "fs";
import {handleRename} from "../../../../src/events/utils";
import {randomBaseRepoPath, randomRepoPath, waitFor} from "../../../helpers/helpers";
import {readYML} from "../../../../src/utils/common";
import {DEFAULT_BRANCH, DIFF_SOURCE} from "../../../../src/constants";
import untildify from "untildify";


describe("handleNewFile",  () => {
    const repoPath = randomRepoPath();

    const baseRepo = randomBaseRepoPath();
    const shadowRepoPath = path.join(baseRepo, ".shadow");
    const diffsRepo = path.join(baseRepo, ".diffs/.vscode");
    const shadowRepoBranchPath = path.join(shadowRepoPath, `${repoPath}/${DEFAULT_BRANCH}`);

    // For file rename
    const oldFilePath = `${repoPath}/old.js`;
    const newFilePath = `${repoPath}/new.js`;
    const oldShadowFilePath = `${shadowRepoBranchPath}/old.js`;
    const renamedShadowFilePath = `${shadowRepoBranchPath}/new.js`;

    // For directory rename
    const oldDirectoryPath = `${repoPath}/old`;
    const newDirectoryPath = `${repoPath}/new`;
    const oldDirectoryFilePath = `${oldDirectoryPath}/file.js`;
    const newDirectoryFilePath = `${newDirectoryPath}/file.js`;
    const oldShadowDirectoryPath = `${shadowRepoBranchPath}/old`;
    const renamedShadowDirectoryPath = `${shadowRepoBranchPath}/new`;
    const oldShadowDirectoryFilePath = `${oldShadowDirectoryPath}/file.js`;
    const renamedShadowDirectoryFilePath = `${renamedShadowDirectoryPath}/file.js`;

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepo);

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
        fs.rmdirSync(baseRepo, { recursive: true });
        fs.rmdirSync(repoPath, { recursive: true });
    });

    test("handleRename for File",  () => {
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
        const diffFilePath = `${diffsRepo}/${diffFiles[0]}`;
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

    test("handleRename for Directory",  async() => {
        handleRename(repoPath, DEFAULT_BRANCH, oldDirectoryPath, newDirectoryPath, false);
        expect(fs.existsSync(renamedShadowDirectoryPath)).toBe(true);
        expect(fs.existsSync(renamedShadowDirectoryFilePath)).toBe(true);
        await waitFor(1);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(1);
        const diffFilePath = `${diffsRepo}/${diffFiles[0]}`;
        const diffData = readYML(diffFilePath);
        expect(diffData.source).toEqual(DIFF_SOURCE);
        expect(diffData.is_rename).toBe(true);
        expect(diffData.is_new_file).toBeFalsy();
        expect(diffData.is_deleted).toBeFalsy();
        expect(diffData.repo_path).toEqual(repoPath);
        expect(diffData.branch).toEqual(DEFAULT_BRANCH);
        expect(diffData.file_relative_path).toEqual("new/file.js");
        expect(JSON.parse(diffData.diff).old_abs_path).toEqual(oldDirectoryFilePath);
        expect(JSON.parse(diffData.diff).new_abs_path).toEqual(newDirectoryFilePath);
        expect(JSON.parse(diffData.diff).old_rel_path).toEqual("old/file.js");
        expect(JSON.parse(diffData.diff).new_rel_path).toEqual("new/file.js");
        fs.rmSync(diffFilePath);
    });

});
