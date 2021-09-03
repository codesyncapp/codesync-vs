import fs from "fs";
import path from "path";

import {readYML} from "../../../../src/utils/common";
import {handleNewFile} from "../../../../src/events/utils";
import {DEFAULT_BRANCH, DIFF_SOURCE} from "../../../../src/constants";
import {randomBaseRepoPath, randomRepoPath} from "../../../helpers/helpers";
import untildify from "untildify";

describe("handleNewFile",  () => {
    const repoPath = randomRepoPath();

    const baseRepo = randomBaseRepoPath();
    const shadowRepoPath = path.join(baseRepo, ".shadow");
    const originalsRepoPath = path.join(baseRepo, ".originals");
    const diffsRepo = path.join(baseRepo, ".diffs/.vscode");
    const shadowRepoBranchPath = path.join(shadowRepoPath, `${repoPath}/${DEFAULT_BRANCH}`);
    const originalsRepoBranchPath = path.join(originalsRepoPath, `${repoPath}/${DEFAULT_BRANCH}`);

    const newFilePath = `${repoPath}/new.js`;
    const newDirectoryPath = `${repoPath}/new`;
    const syncIgnorePath = `${repoPath}/.syncignore`;
    const shadowFilePath = `${shadowRepoBranchPath}/new.js`;
    const originalsFilePath = `${originalsRepoBranchPath}/new.js`;
    const syncIgnoreData = ".git\n\n\n.skip_repo_1\nignore.js";

    const ignorableFilePath = `${repoPath}/ignore.js`;

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepo);
        // Create directories
        fs.mkdirSync(repoPath, { recursive: true });
        fs.mkdirSync(diffsRepo, { recursive: true });
        fs.mkdirSync(originalsRepoBranchPath, { recursive: true });
        fs.mkdirSync(shadowRepoBranchPath, { recursive: true });
        fs.writeFileSync(newFilePath, "use babel;");
        fs.writeFileSync(ignorableFilePath, "use babel;");
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
    });

    afterEach(() => {
        fs.rmdirSync(baseRepo, { recursive: true });
        fs.rmdirSync(repoPath, { recursive: true });
    });

    test("Valid File",  async () => {
        /*
         *
         {
            source: 'vs-code',
            created_at: '2021-08-26 18:59:51.954',
            diff: "",
            repo_path: 'tests/tests_data/test_repo_sNIVUqukDv',
            branch: 'default',
            file_relative_path: 'new.js',
            is_new_file: true
          }
        *
        * */
        handleNewFile(repoPath, DEFAULT_BRANCH, newFilePath);
        // Verify file has been created in the .shadow repo and .originals repos
        expect(fs.existsSync(shadowFilePath)).toBe(true);
        expect(fs.existsSync(originalsFilePath)).toBe(true);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(1);
        const diffFilePath = `${diffsRepo}/${diffFiles[0]}`;
        const diffData = readYML(diffFilePath);
        expect(diffData.source).toEqual(DIFF_SOURCE);
        expect(diffData.is_new_file).toBe(true);
        expect(diffData.is_rename).toBeFalsy();
        expect(diffData.is_deleted).toBeFalsy();
        expect(diffData.repo_path).toEqual(repoPath);
        expect(diffData.branch).toEqual(DEFAULT_BRANCH);
        expect(diffData.file_relative_path).toEqual("new.js");
        expect(diffData.diff).toEqual("");
    });

    test("with syncignored file",  async () => {
        handleNewFile(repoPath, DEFAULT_BRANCH, ignorableFilePath);
        // Verify file has been created in the .shadow repo and .originals repos
        expect(fs.existsSync(`${shadowRepoBranchPath}/ignore.js`)).toBe(false);
        expect(fs.existsSync(`${originalsRepoBranchPath}/ignore.js`)).toBe(false);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("with shadow file there",  async () => {
        fs.writeFileSync(shadowFilePath, "use babel;");
        handleNewFile(repoPath, DEFAULT_BRANCH, newFilePath);
        // Verify file has been NOT created in the .originals repos
        expect(fs.existsSync(originalsFilePath)).toBe(false);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("with originals file there",  async () => {
        fs.writeFileSync(originalsFilePath, "use babel;");
        handleNewFile(repoPath, DEFAULT_BRANCH, newFilePath);
        // Verify file has NOT been created in the .shadow repo
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });


    test("with new directory",  async () => {
        fs.mkdirSync(newDirectoryPath, { recursive: true });
        handleNewFile(repoPath, DEFAULT_BRANCH, newDirectoryPath);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

});
