import fs from "fs";
import path from "path";
import vscode from "vscode";
import untildify from "untildify";
import getBranchName from "current-git-branch";

import {DEFAULT_BRANCH, DIFF_SOURCE} from "../../../src/constants";
import {
    assertChangeEvent,
    Config,
    DUMMY_FILE_CONTENT,
    getConfigFilePath,
    getSyncIgnoreFilePath,
    randomBaseRepoPath,
    randomRepoPath
} from "../../helpers/helpers";
import {pathUtils} from "../../../src/utils/path_utils";
import {eventHandler} from "../../../src/events/event_handler";
import {readYML} from "../../../src/utils/common";
import {diff_match_patch} from "diff-match-patch";


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

    const fileRelPath = "file.js";
    const filePath = path.join(repoPath, fileRelPath);
    const syncIgnorePath = getSyncIgnoreFilePath(repoPath);
    const shadowFilePath = path.join(shadowRepoBranchPath, fileRelPath);
    const syncIgnoreData = ".git\n\n\n.skip_repo_1\nignore.js";
    const ignorableFilePath = path.join(repoPath, "ignore.js");

    beforeEach(() => {
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
        jest.spyOn(vscode.workspace, 'rootPath', 'get').mockReturnValue(repoPath);
        getBranchName.mockReturnValue(DEFAULT_BRANCH);
        // Create directories
        fs.mkdirSync(baseRepoPath, { recursive: true });
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        fs.mkdirSync(repoPath, { recursive: true });
        fs.mkdirSync(diffsRepo, { recursive: true });
        fs.mkdirSync(originalsRepoBranchPath, { recursive: true });
        fs.mkdirSync(shadowRepoBranchPath, { recursive: true });
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(ignorableFilePath, "use babel;");
        fs.writeFileSync(syncIgnorePath, syncIgnoreData);
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("Repo not synced", () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.removeRepo();
        const handler = new eventHandler();
        const event = {};
        handler.handleChangeEvent(event);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
        expect(fs.existsSync(shadowFilePath)).toBe(false);
    });

    test("Synced repo, Ignorable file", () => {
        const document = {
            fileName: path.join(repoPath, ".idea"),
            getText: function () {
                return "";
            }
        };
        const handler = new eventHandler();
        const event = {
            document,
            contentChanges: [" Change "]
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValueOnce({
            document
        });
        handler.handleChangeEvent(event);
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
        expect(fs.existsSync(shadowFilePath)).toBe(false);
    });

    test("Synced repo, no content changes", () => {
        const document = {
            fileName: path.join(repoPath, "file.js"),
        };
        const handler = new eventHandler();
        const event = {
            document,
            contentChanges: []
        };
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValueOnce({
            document
        });
        handler.handleChangeEvent(event);
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
        expect(fs.existsSync(shadowFilePath)).toBe(false);
    });

    test("Synced repo, shadow file does not exist", () => {
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
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValueOnce({
            document
        });
        handler.handleChangeEvent(event);
        expect(assertChangeEvent(repoPath, diffsRepo, "", DUMMY_FILE_CONTENT,
            fileRelPath, shadowFilePath)).toBe(true);
    });

    test("Synced repo, file in .syncignore", () => {
        const handler = new eventHandler();
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
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Synced repo, Inactive Editor's document", () => {
        const handler = new eventHandler();
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValueOnce({
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
        expect(fs.existsSync(shadowFilePath)).toBe(false);
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("Synced repo, Shadow has same content", () => {
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
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValueOnce({
            document
        });
        handler.handleChangeEvent(event);
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
        jest.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValueOnce({
            document
        });
        handler.handleChangeEvent(event);

        expect(assertChangeEvent(repoPath, diffsRepo, DUMMY_FILE_CONTENT, updatedText,
            fileRelPath, shadowFilePath)).toBe(true);
    });
});
