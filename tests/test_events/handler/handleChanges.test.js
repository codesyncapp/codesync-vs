import fs from "fs";
import path from "path";
import vscode from "vscode";
import untildify from "untildify";
import getBranchName from "current-git-branch";

import {DEFAULT_BRANCH} from "../../../src/constants";
import {
    addUser,
    assertChangeEvent,
    Config,
    DUMMY_FILE_CONTENT,
    getConfigFilePath,
    getSyncIgnoreFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    setWorkspaceFolders
} from "../../helpers/helpers";
import {pathUtils} from "../../../src/utils/path_utils";
import {eventHandler} from "../../../src/events/event_handler";
import {populateBuffer} from "../../../src/codesyncd/populate_buffer";
import { createSystemDirectories } from "../../../src/utils/setup_utils";


describe("handleChangeEvent",  () => {
    /*
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

    const fileRelPath = "file_1.js";
    const filePath = path.join(repoPath, fileRelPath);
    const syncIgnorePath = getSyncIgnoreFilePath(repoPath);
    const shadowFilePath = path.join(shadowRepoBranchPath, fileRelPath);
    const syncIgnoreData = ".git\n\n\n.skip_repo_1\nignore.js";
    const ignorableFilePath = path.join(repoPath, "ignore.js");
    const ignorableShadowFilePath = path.join(shadowRepoBranchPath, "ignore.js");

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        createSystemDirectories();        
        setWorkspaceFolders(repoPath);
        getBranchName.mockReturnValue(DEFAULT_BRANCH);
        // Create directories
        fs.mkdirSync(baseRepoPath, { recursive: true });
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        fs.mkdirSync(repoPath, { recursive: true });
        fs.mkdirSync(diffsRepo, { recursive: true });
        fs.mkdirSync(originalsRepoBranchPath, { recursive: true });
        fs.mkdirSync(shadowRepoBranchPath, { recursive: true });
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(ignorableFilePath, "use babel;");
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
        const shadowSyncIgnore = path.join(shadowRepoBranchPath, ".syncignore");
        fs.writeFileSync(shadowSyncIgnore, syncIgnoreData);
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Repo not synced", async () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.removeRepo();
        const handler = new eventHandler();
        const event = {};
        handler.handleChangeEvent(event);
        await populateBuffer();

        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
        expect(fs.existsSync(shadowFilePath)).toBe(false);
    });

    test("Synced repo, no content changes", async () => {
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        const document = {
            fileName: path.join(repoPath, "file.js"),
        };
        const handler = new eventHandler();
        const event = {
            document,
            contentChanges: []
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document
        });
        handler.handleChangeEvent(event);
        await populateBuffer();

        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Synced repo, shadow file does not exist", async () => {
        const document = {
            fileName: filePath,
            getText: function () {
                return DUMMY_FILE_CONTENT;
            }
        };
        const handler = new eventHandler();
        const event = {
            document,
            contentChanges: [" Change "]
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document
        });
        handler.handleChangeEvent(event);
        await populateBuffer();

        expect(assertChangeEvent(repoPath, diffsRepo, "", DUMMY_FILE_CONTENT,
            fileRelPath, shadowFilePath)).toBe(true);
    });

    test("Synced repo, file in .syncignore", async () => {
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);

        const document = {
            fileName: ignorableFilePath,
            getText: function () {
                return DUMMY_FILE_CONTENT;
            }
        };
        const event = {
            document,
            contentChanges: [" Change "]
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document
        });
        const handler = new eventHandler();
        handler.handleChangeEvent(event);
        await populateBuffer();

        expect(fs.existsSync(ignorableShadowFilePath)).toBe(false);
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Synced repo, Inactive Editor's document", async () => {
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);

        const handler = new eventHandler();
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document: {
                filePath: filePath
            }
        });
        const event = {
            document: {
                fileName: ignorableFilePath,
                getText: function () {
                    return DUMMY_FILE_CONTENT;
                }
            },
            contentChanges: [" Change "]
        };
        handler.handleChangeEvent(event);
        await populateBuffer();

        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Synced repo, Shadow has same content", async () => {
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        const document = {
            fileName: filePath,
                getText: function () {
                return DUMMY_FILE_CONTENT;
            }
        };
        const handler = new eventHandler();
        const event = {
            document,
            contentChanges: [" Change "]
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document
        });
        handler.handleChangeEvent(event);
        await populateBuffer();

        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Synced repo, Should add diff and update shadow file", () => {
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        const updatedText = `${DUMMY_FILE_CONTENT} Changed data`;
        const document = {
            fileName: filePath,
            getText: function () {
                return updatedText;
            }
        };
        const handler = new eventHandler();
        const event = {
            document,
            contentChanges: [" Change "]
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document
        });
        handler.handleChangeEvent(event);

        expect(assertChangeEvent(repoPath, diffsRepo, DUMMY_FILE_CONTENT, updatedText,
            fileRelPath, shadowFilePath)).toBe(true);
    });

    test("Sub directory, should add diff and update shadow file", () => {
        const subDirName = "directory";
        const subDir = path.join(repoPath, subDirName);
        fs.mkdirSync(subDir);
        const nestedFile = path.join(subDir, fileRelPath);
        const _shadowRepoPath = path.join(shadowRepoBranchPath, subDirName);
        const _shadowFile = path.join(_shadowRepoPath, fileRelPath);
        fs.mkdirSync(_shadowRepoPath);
        fs.writeFileSync(nestedFile, DUMMY_FILE_CONTENT);
        fs.writeFileSync(_shadowFile, DUMMY_FILE_CONTENT);
        const updatedText = `${DUMMY_FILE_CONTENT} Changed data`;
        const document = {
            fileName: nestedFile,
            getText: function () {
                return updatedText;
            }
        };
        const handler = new eventHandler();
        const event = {
            document,
            contentChanges: [" Change "]
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document
        });
        handler.handleChangeEvent(event);

        const relPath = path.join(subDirName, fileRelPath);
        expect(assertChangeEvent(repoPath, diffsRepo, DUMMY_FILE_CONTENT, updatedText,
            relPath, _shadowFile)).toBe(true);
    });

    test("Sync Ignored sub directory, should not add diff", () => {
        const subDirName = "directory";
        fs.writeFileSync(syncIgnorePath, subDirName);
        const subDir = path.join(repoPath, subDirName);
        fs.mkdirSync(subDir);
        const nestedFile = path.join(subDir, fileRelPath);
        const _shadowRepoPath = path.join(shadowRepoBranchPath, subDirName);
        const _shadowFile = path.join(_shadowRepoPath, fileRelPath);
        fs.mkdirSync(_shadowRepoPath);
        fs.writeFileSync(nestedFile, DUMMY_FILE_CONTENT);
        fs.writeFileSync(_shadowFile, DUMMY_FILE_CONTENT);
        const updatedText = `${DUMMY_FILE_CONTENT} Changed data`;
        const document = {
            fileName: nestedFile,
            getText: function () {
                return updatedText;
            }
        };
        const handler = new eventHandler();
        const event = {
            document,
            contentChanges: [" Change "]
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document
        });
        handler.handleChangeEvent(event);

        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });


    test("Synced repo, File from other project in workspace", async () => {
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        const updatedText = `${DUMMY_FILE_CONTENT} Changed data`;
        const document = {
            fileName: path.join(randomRepoPath(), "file.js"),
            getText: function () {
                return updatedText;
            }
        };
        const handler = new eventHandler();
        const event = {
            document,
            contentChanges: [" Change "]
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document
        });
        handler.handleChangeEvent(event);
        await populateBuffer();

        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Synced repo, InActive user, should not add diff", () => {
        addUser(baseRepoPath, false);
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        const updatedText = `Updated ${DUMMY_FILE_CONTENT}`;
        const document = {
            fileName: filePath,
            getText: function () {
                return updatedText;
            }
        };
        const handler = new eventHandler();
        const event = {
            document,
            contentChanges: [" Change "]
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document
        });
        handler.handleChangeEvent(event);
        const diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("With Daemon, Should add diff and update shadow file", async () => {
        addUser(baseRepoPath);
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        const updatedText = `${DUMMY_FILE_CONTENT} Changed data`;
        const document = {
            fileName: filePath,
            getText: () => {
                return updatedText;
            }
        };
        const handler = new eventHandler();
        const event = {
            document,
            contentChanges: [" Change "]
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
            document
        });
        handler.handleChangeEvent(event);
        await populateBuffer(true);

        expect(assertChangeEvent(repoPath, diffsRepo, DUMMY_FILE_CONTENT, updatedText,
            fileRelPath, shadowFilePath)).toBe(true);
    });
});
