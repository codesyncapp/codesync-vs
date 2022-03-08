import fs from "fs";
import path from "path";
import untildify from "untildify";
import getBranchName from "current-git-branch";

import {DEFAULT_BRANCH} from "../../../src/constants";
import {
    addUser,
    assertNewFileEvent,
    Config,
    getConfigFilePath,
    getSyncIgnoreFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    setWorkspaceFolders,
    DUMMY_FILE_CONTENT
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
        setWorkspaceFolders(repoPath);
        getBranchName.mockReturnValue(DEFAULT_BRANCH);
        // Create directories
        fs.mkdirSync(baseRepoPath, { recursive: true });
        fs.mkdirSync(repoPath, { recursive: true });
        fs.mkdirSync(diffsRepo, { recursive: true });
        fs.mkdirSync(originalsRepoBranchPath, { recursive: true });
        fs.mkdirSync(shadowRepoBranchPath, { recursive: true });
        fs.writeFileSync(newFilePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(ignorableFilePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        // Create .syncignore shadow
        const shadowSyncIgnore = path.join(shadowRepoBranchPath, ".syncignore");
        fs.writeFileSync(shadowSyncIgnore, syncIgnoreData);
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        // Add user
        addUser(baseRepoPath);
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

    test("Event: Synced repo, File of other project in workspace", () => {
        const otherRepo = randomRepoPath();
        const filePath = path.join(otherRepo, "file.js");
        fs.mkdirSync(otherRepo, { recursive: true });
        fs.writeFileSync(filePath, "use babel;");
        const handler = new eventHandler();
        const event = {
            files: [{
                fsPath: filePath,
                path: filePath,
                scheme: "file"
            }]
        };
        handler.handleCreateEvent(event);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
        fs.rmSync(otherRepo, { recursive: true, force: true });
    });

    test("New File",  async () => {
        const handler = new eventHandler();
        handler.handleNewFile(newFilePath);
        expect(assertNewFileEvent(repoPath, newRelPath)).toBe(true);
    });

    test("Sub directory; New File",  async () => {
        const subDirName = "directory";
        const subDir = path.join(repoPath, subDirName);
        fs.mkdirSync(subDir);
        const nestedFile = path.join(subDir, newRelPath);
        fs.writeFileSync(nestedFile, DUMMY_FILE_CONTENT);
        const handler = new eventHandler();
        handler.handleNewFile(nestedFile);
        const relPath = path.join(subDirName, newRelPath);
        expect(assertNewFileEvent(repoPath, relPath)).toBe(true);
    });

    test("Sync Ignored Sub directory; New File",  async () => {
        const subDirName = "directory";
        fs.writeFileSync(syncIgnorePath, subDirName);
        const subDir = path.join(repoPath, subDirName);
        fs.mkdirSync(subDir);
        const nestedFile = path.join(subDir, newRelPath);
        fs.writeFileSync(nestedFile, DUMMY_FILE_CONTENT);
        const handler = new eventHandler();
        handler.handleNewFile(nestedFile);
        // Verify no diff file has been generated
        const diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Valid File, InActive user",  async () => {
        addUser(baseRepoPath, false);
        const handler = new eventHandler();
        handler.handleNewFile(newFilePath);
        // Verify file has been created in the .shadow repo and .originals repos
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        expect(fs.existsSync(originalsFilePath)).toBe(false);
        // Verify no diff file has been generated
        const diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
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
