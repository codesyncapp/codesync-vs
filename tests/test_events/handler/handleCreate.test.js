import fs from "fs";
import path from "path";
import vscode from "vscode";
import untildify from "untildify";
import getBranchName from "current-git-branch";

import {DEFAULT_BRANCH} from "../../../src/constants";
import {
    assertNewFileEvent,
    Config,
    getConfigFilePath,
    getSyncIgnoreFilePath,
    randomBaseRepoPath,
    randomRepoPath
} from "../../helpers/helpers";
import {pathUtils} from "../../../src/utils/path_utils";
import {eventHandler} from "../../../src/events/event_handler";
import {populateBuffer} from "../../../src/codesyncd/populate_buffer";


describe("handleNewFile",  () => {
    /*
    Diff for new file looks like
     {
        source: 'vs-code',
        created_at: '2021-08-26 18:59:51.954',
        diff: "",
        repo_path: 'tests/tests_data/test_repo_sNIVUqukDv',
        branch: 'default',
        file_relative_path: 'new.js',
        is_new_file: true
      }
    */
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const diffsRepo = pathUtilsObj.getDiffsRepo();
    const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
    const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();

    const newRelPath = "new.js";
    const newFilePath = path.join(repoPath, newRelPath);
    const newDirectoryPath = path.join(repoPath, "new");
    const syncIgnorePath = getSyncIgnoreFilePath(repoPath);
    const shadowFilePath = path.join(shadowRepoBranchPath, newRelPath);
    const originalsFilePath = path.join(originalsRepoBranchPath, newRelPath);
    const syncIgnoreData = ".git\n\n\n.skip_repo_1\nignore.js";

    const ignorableFilePath = path.join(repoPath, "ignore.js");


    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        getBranchName.mockReturnValue(DEFAULT_BRANCH);
        // Create directories
        fs.mkdirSync(baseRepoPath, { recursive: true });
        fs.mkdirSync(repoPath, { recursive: true });
        fs.mkdirSync(diffsRepo, { recursive: true });
        fs.mkdirSync(originalsRepoBranchPath, { recursive: true });
        fs.mkdirSync(shadowRepoBranchPath, { recursive: true });
        fs.writeFileSync(newFilePath, "use babel;");
        fs.writeFileSync(ignorableFilePath, "use babel;");
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();

    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Event: Repo not synced", () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.removeRepo();
        const handler = new eventHandler();
        const event = {
            files: [{
                fsPath: newFilePath,
                path: newFilePath,
                scheme: "file"
            }]
        };
        handler.handleCreateEvent(event);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
        // Verify file has been created in the .shadow repo and .originals repos
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        expect(fs.existsSync(originalsFilePath)).toBe(false);
    });

    test("Event: Synced repo, Ignorable file", () => {
        const event = {
            files: [{
                fsPath: path.join(repoPath, "node_modules", "express", "index.js")
            }]
        };
        const handler = new eventHandler();
        handler.handleCreateEvent(event);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Event: Synced repo, Valid File", () => {
        const handler = new eventHandler();
        const event = {
            files: [{
                fsPath: newFilePath,
                path: newFilePath,
                scheme: "file"
            }]
        };
        handler.handleCreateEvent(event);
        // Verify file has been created in the .shadow repo and .originals repos
        expect(assertNewFileEvent(repoPath, newRelPath)).toBe(true);
    });

    test("Event: handlePastedFile, Repo not synced", () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.removeRepo();
        const handler = new eventHandler();
        handler.handlePastedFile(newFilePath);
        // Verify file has been created in the .shadow repo and .originals repos
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        expect(fs.existsSync(originalsFilePath)).toBe(false);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Event: handlePastedFile, Synced Repo", () => {
        const handler = new eventHandler();
        handler.handlePastedFile(newFilePath);
        expect(assertNewFileEvent(repoPath, newRelPath)).toBe(true);
    });

    test("Valid File",  async () => {
        const handler = new eventHandler();
        handler.handleNewFile(newFilePath);
        expect(assertNewFileEvent(repoPath, newRelPath)).toBe(true);
    });

    test("With Daemon: Valid File",  async () => {
        const handler = new eventHandler();
        handler.handleNewFile(newFilePath);
        await populateBuffer();
        expect(assertNewFileEvent(repoPath, newRelPath)).toBe(true);
    });

    test("with syncignored file",  async () => {
        const handler = new eventHandler();
        handler.handleNewFile(ignorableFilePath);
        // Verify file has been created in the .shadow repo and .originals repos
        expect(fs.existsSync(path.join(shadowRepoBranchPath, "ignore.js"))).toBe(false);
        expect(fs.existsSync(path.join(originalsRepoBranchPath, "ignore.js"))).toBe(false);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("with shadow file there",  async () => {
        fs.writeFileSync(shadowFilePath, "use babel;");
        const handler = new eventHandler();
        handler.handleNewFile(newFilePath);
        // Verify file has been NOT created in the .originals repos
        expect(fs.existsSync(originalsFilePath)).toBe(false);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("with originals file there",  async () => {
        fs.writeFileSync(originalsFilePath, "use babel;");
        const handler = new eventHandler();
        handler.handleNewFile(newFilePath);
        // Verify file has NOT been created in the .shadow repo
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });


    test("with new directory",  async () => {
        fs.mkdirSync(newDirectoryPath, { recursive: true });
        const handler = new eventHandler();
        handler.handleNewFile(newDirectoryPath);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });
});
