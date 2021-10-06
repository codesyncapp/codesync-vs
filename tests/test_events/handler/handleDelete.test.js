import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from "untildify";
import getBranchName from "current-git-branch";

import {readYML} from "../../../src/utils/common";
import {pathUtils} from "../../../src/utils/path_utils";
import {eventHandler} from "../../../src/events/event_handler";
import {DEFAULT_BRANCH, DIFF_SOURCE} from "../../../src/constants";
import {getConfigFilePath, randomBaseRepoPath, randomRepoPath, waitFor} from "../../helpers/helpers";

describe("handleFilesDeleted",  () => {
    /*
     {
        source: 'vs-code',
        created_at: '2021-08-26 18:59:51.954',
        diff: "",
        repo_path: 'tests/tests_data/test_repo_sNIVUqukDv',
        branch: 'default',
        file_relative_path: 'new.js',
        is_deleted: true
     }
    */
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);

    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
    const diffsRepo = pathUtilsObj.getDiffsRepo();

    // For file
    const filePath = path.join(repoPath, "file.js");
    const cacheRepoBranchPath = pathUtilsObj.getDeletedRepoBranchPath();
    const cacheFilePath = path.join(cacheRepoBranchPath, "file.js");
    const shadowFilePath = path.join(shadowRepoBranchPath, "file.js");

    // For directory
    const directoryPath = path.join(repoPath, "directory");
    const directoryFilePath = path.join(directoryPath, "file.js");
    const relFilePath = path.join("directory", "file.js");
    const shadowDirectoryPath = path.join(shadowRepoBranchPath, "directory");
    const shadowDirectoryFilePath = path.join(shadowDirectoryPath, "file.js");
    const cacheDirectoryPath = path.join(cacheRepoBranchPath, "directory");

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        getBranchName.mockReturnValue(DEFAULT_BRANCH);
        // Create directories
        fs.mkdirSync(repoPath, { recursive: true });
        fs.mkdirSync(diffsRepo, { recursive: true });

        fs.mkdirSync(shadowRepoBranchPath, { recursive: true });
        fs.writeFileSync(shadowFilePath, "use babel;");

        // For directory rename, repo will have new directory but shadow will have old repo
        fs.mkdirSync(directoryPath, { recursive: true });
        fs.writeFileSync(directoryFilePath, "use babel;");

        fs.mkdirSync(shadowDirectoryPath, { recursive: true });
        fs.writeFileSync(shadowDirectoryFilePath, "use babel;");
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Repo is not synced",  () => {
        const event = {
            files: [{
                fsPath: filePath,
                path: filePath,
                scheme: "file"
            }]
        };
        const handler = new eventHandler();
        handler.handleFilesDeleted(event);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
        // Verify file was not copied to .deleted
        expect(fs.existsSync(cacheFilePath)).toBe(false);
    });

    test("Event: Synced repo, Ignorable file", () => {
        const config = {'repos': {}};
        config.repos[repoPath] = {'branches': {}};
        fs.writeFileSync(configPath, yaml.safeDump(config));
        const event = {
            files: [{
                fsPath: path.join(repoPath, "node_modules", "express", "index.js")
            }]
        };
        const handler = new eventHandler();
        handler.handleFilesDeleted(event);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Repo synced, shadow exists",  () => {
        const config = {'repos': {}};
        config.repos[repoPath] = {'branches': {}};
        fs.writeFileSync(configPath, yaml.safeDump(config));

        const event = {
            files: [{
                fsPath: filePath,
                path: filePath,
                scheme: "file"
            }]
        };
        const handler = new eventHandler();
        handler.handleFilesDeleted(event);
        // Verify that file is copied to .delete directory
        expect(fs.existsSync(cacheFilePath)).toBe(true);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(1);
        const diffFilePath = path.join(diffsRepo, diffFiles[0]);
        const diffData = readYML(diffFilePath);
        expect(diffData.source).toEqual(DIFF_SOURCE);
        expect(diffData.is_rename).toBeFalsy();
        expect(diffData.is_new_file).toBeFalsy();
        expect(diffData.is_deleted).toBe(true);
        expect(diffData.repo_path).toEqual(repoPath);
        expect(diffData.branch).toEqual(DEFAULT_BRANCH);
        expect(diffData.file_relative_path).toEqual("file.js");
        expect(diffData.diff).toStrictEqual("");
    });

    test("Repo synced, shadow does NOT exists",  () => {
        fs.rmSync(shadowFilePath);
        const config = {'repos': {}};
        config.repos[repoPath] = {'branches': {}};
        fs.writeFileSync(configPath, yaml.safeDump(config));

        const event = {
            files: [{
                fsPath: filePath,
                path: filePath,
                scheme: "file"
            }]
        };
        const handler = new eventHandler();
        handler.handleFilesDeleted(event);
        // Verify that file is not copied to .delete directory
        expect(fs.existsSync(cacheFilePath)).toBe(false);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Repo synced, .delete file exists",  () => {
        fs.mkdirSync(cacheRepoBranchPath, { recursive: true });
        fs.writeFileSync(cacheFilePath, "use babel;");
        const config = {'repos': {}};
        config.repos[repoPath] = {'branches': {}};
        fs.writeFileSync(configPath, yaml.safeDump(config));

        const event = {
            files: [{
                fsPath: filePath,
                path: filePath,
                scheme: "file"
            }]
        };
        const handler = new eventHandler();
        handler.handleFilesDeleted(event);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Repo synced, Directory delete event",  async () => {
        const config = {'repos': {}};
        config.repos[repoPath] = {'branches': {}};
        fs.writeFileSync(configPath, yaml.safeDump(config));

        const event = {
            files: [{
                fsPath: directoryPath,
                path: directoryPath,
                scheme: "file"
            }]
        };
        const handler = new eventHandler();
        handler.handleFilesDeleted(event);
        await waitFor(1);
        // Verify that file is copied to .delete directory
        expect(fs.existsSync(cacheDirectoryPath)).toBe(true);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(1);
        // Verify correct diff file has been generated
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
});
