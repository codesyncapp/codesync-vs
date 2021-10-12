import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import vscode from "vscode";
import untildify from "untildify";
import getBranchName from "current-git-branch";

import {pathUtils} from "../../../src/utils/path_utils";
import {eventHandler} from "../../../src/events/event_handler";
import {DEFAULT_BRANCH} from "../../../src/constants";
import {
    assertRenameEvent,
    Config, FILE_ID,
    getConfigFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    TEST_EMAIL,
    waitFor
} from "../../helpers/helpers";

describe("handleRenameFile",  () => {
    /*
     {
        source: 'vs-code',
        created_at: '2021-08-26 18:59:51.954',
        diff: '{"old_rel_path":"old.js","new_rel_path":"new.js"}',
        repo_path: 'tests/tests_data/test_repo_sNIVUqukDv',
        branch: 'default',
        file_relative_path: 'new.js',
        is_rename: true
      }
    */
    const repoPath = randomRepoPath();
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);

    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
    const diffsRepo = pathUtilsObj.getDiffsRepo();

    const oldRelPath = "file_1.js";
    // For file rename
    const oldFilePath = path.join(repoPath, oldRelPath);
    const newFilePath = path.join(repoPath, "new.js");
    const oldShadowFilePath = path.join(shadowRepoBranchPath, oldRelPath);
    const renamedShadowFilePath = path.join(shadowRepoBranchPath, "new.js");

    // For directory rename
    const oldDirectoryPath = path.join(repoPath, "old");
    const oldShadowDirectoryPath = path.join(shadowRepoBranchPath, "old");
    const oldShadowDirectoryFilePath = path.join(oldShadowDirectoryPath, "file.js");

    const newDirectoryPath = path.join(repoPath, "new");
    const newDirectoryFilePath = path.join(newDirectoryPath, "file.js");
    const renamedShadowDirectoryPath = path.join(shadowRepoBranchPath, "new");
    const renamedShadowDirectoryFilePath = path.join(renamedShadowDirectoryPath, "file.js");

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

    test("Event: Repo is not synced",  () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.removeRepo();
        const handler = new eventHandler();
        const event = {
            files: [{
                oldUri: {
                    fsPath: newFilePath,
                    path: newFilePath,
                    scheme: "file"
                },
                newUri: {
                    fsPath: newFilePath,
                    path: newFilePath,
                    scheme: "file"
                }
            }]
        };
        handler.handleRenameEvent(event);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
        // Verify file has been renamed in the shadow repo
        expect(fs.existsSync(renamedShadowFilePath)).toBe(false);
    });

    test("Event: Synced repo, Ignorable file", () => {
        const event = {
            files: [{
                oldUri: {
                    fsPath: path.join(repoPath, ".git", "objects", "abcdef")
                },
                newUri: {
                    fsPath: path.join(repoPath, ".git", "objects", "12345")
                }
            }]
        };

        const handler = new eventHandler();
        handler.handleRenameEvent(event);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(0);
    });

    test("for File",  () => {
        fs.writeFileSync(newFilePath, "use babel;");

        const event = {
            files: [{
                oldUri: {
                    fsPath: oldFilePath,
                    path: oldFilePath,
                    scheme: "file"
                },
                newUri: {
                    fsPath: newFilePath,
                    path: newFilePath,
                    scheme: "file"
                }
            }]
        };
        const handler = new eventHandler();
        handler.handleRenameEvent(event);
        expect(assertRenameEvent(repoPath, configPath, oldRelPath, "new.js")).toBe(true);
    });

    test("for Directory",  async () => {
        const oldRelPath = path.join("old", "file.js");
        const newRelPath = path.join("new", "file.js");

        const config = {repos: {}};
        config.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        config.repos[repoPath].branches[DEFAULT_BRANCH] = {};
        config.repos[repoPath].branches[DEFAULT_BRANCH][oldRelPath] = FILE_ID;
        fs.writeFileSync(configPath, yaml.safeDump(config));

        const event = {
            files: [{
                oldUri: {
                    fsPath: oldDirectoryPath
                },
                newUri: {
                    fsPath: newDirectoryPath
                }
            }]
        };
        const handler = new eventHandler();
        handler.handleRenameEvent(event);
        await waitFor(1);
        expect(assertRenameEvent(repoPath, configPath, oldRelPath, newRelPath)).toBe(true);
    });
});
