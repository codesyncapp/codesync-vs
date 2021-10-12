import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import untildify from "untildify";
import getBranchName from "current-git-branch";
import {isBinaryFileSync} from "isbinaryfile";

import {pathUtils} from "../../src/utils/path_utils";
import {readYML} from "../../src/utils/common";
import {populateBuffer} from "../../src/codesyncd/populate_buffer";
import {createSystemDirectories} from "../../src/utils/setup_utils";
import {DEFAULT_BRANCH, DIFF_SOURCE} from "../../src/constants";
import {
    assertChangeEvent,
    assertRenameEvent,
    DUMMY_FILE_CONTENT,
    getConfigFilePath,
    getSeqTokenFilePath,
    getUserFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    TEST_EMAIL,
    TEST_REPO_RESPONSE,
    TEST_USER
} from "../helpers/helpers";


describe("populateBuffer", () => {
    const baseRepoPath = randomBaseRepoPath();
    const repoPath = randomRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const userFilePath = getUserFilePath(baseRepoPath);
    const userData = {};
    userData[TEST_EMAIL] = {access_token: "ABC"};
    const sequenceTokenFilePath = getSeqTokenFilePath(baseRepoPath);

    untildify.mockReturnValue(baseRepoPath);

    const pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
    const shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
    const originalsRepoBranchPath = pathUtilsObj.getOriginalsRepoBranchPath();
    const cacheRepoBranchPath = pathUtilsObj.getDeletedRepoBranchPath();
    const diffsRepo = pathUtilsObj.getDiffsRepo();

    const fileRelPath = "file_1.js";
    const filePath = path.join(repoPath, fileRelPath);
    const shadowFilePath = path.join(shadowRepoBranchPath, fileRelPath);
    const newFilePath = path.join(repoPath, "new.js");

    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        jest.spyOn(global.console, 'log');
        untildify.mockReturnValue(baseRepoPath);
        fs.mkdirSync(baseRepoPath, {recursive: true});
        createSystemDirectories();
        fs.mkdirSync(repoPath, {recursive: true});
    });

    const addRepo = (deleteFile1=false) => {
        fs.mkdirSync(shadowRepoBranchPath, {recursive: true});
        getBranchName.mockReturnValueOnce(DEFAULT_BRANCH);
        const configData = {repos: {}};
        configData.repos[repoPath] = {
            branches: {},
            email: TEST_EMAIL
        };
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = TEST_REPO_RESPONSE.file_path_and_id;
        configData.repos[repoPath].branches[DEFAULT_BRANCH]["ignore.js"] = 12345;
        if (deleteFile1) {
            delete configData.repos[repoPath].branches[DEFAULT_BRANCH][fileRelPath];
        }
        fs.writeFileSync(configPath, yaml.safeDump(configData));
        // Update sequence_token.yml
        const users = {};
        users[TEST_EMAIL] = "";
        fs.writeFileSync(sequenceTokenFilePath, yaml.safeDump(users));
        const userData = {};
        userData[TEST_EMAIL] = {
            access_token: "ABC",
            access_key: TEST_USER.iam_access_key,
            secret_key: TEST_USER.iam_secret_key
        };
        fs.writeFileSync(userFilePath, yaml.safeDump(userData));
    };

    const assertNewFileEvent = (newRelPath, diffsCount = 1) => {
        const originalsFilePath = path.join(originalsRepoBranchPath, newRelPath);
        const shadowFilePath = path.join(shadowRepoBranchPath, newRelPath);
        // Verify file has been created in the .shadow repo and .originals repos
        expect(fs.existsSync(shadowFilePath)).toBe(true);
        expect(fs.existsSync(originalsFilePath)).toBe(true);
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        expect(diffFiles).toHaveLength(diffsCount);
        const diffFilePath = path.join(diffsRepo, diffFiles[diffsCount-1]);
        const diffData = readYML(diffFilePath);
        expect(diffData.source).toEqual(DIFF_SOURCE);
        expect(diffData.is_new_file).toBe(true);
        expect(diffData.is_rename).toBeFalsy();
        expect(diffData.is_deleted).toBeFalsy();
        expect(diffData.repo_path).toEqual(repoPath);
        expect(diffData.branch).toEqual(DEFAULT_BRANCH);
        expect(diffData.file_relative_path).toEqual(newRelPath);
        expect(diffData.diff).toEqual("");
        return true;
    };

    afterEach(() => {
        fs.rmSync(repoPath, {recursive: true, force: true});
        fs.rmSync(baseRepoPath, {recursive: true, force: true});
    });

    test("No repo synced", async () => {
        await populateBuffer();
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        // Verify correct diff file has been generated
        expect(diffFiles).toHaveLength(0);
    });

    test("Repo synced, no change in data", async () => {
        addRepo();
        await populateBuffer();
        // Verify correct diff file has been generated
        let diffFiles = fs.readdirSync(diffsRepo);
        // Verify correct diff file has been generated
        expect(diffFiles).toHaveLength(0);
    });

    test("Changes occurred, shadow file does not exist", async () => {
        addRepo();
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        await populateBuffer();
        // Verify correct diff file has been generated
        expect(assertChangeEvent(repoPath, diffsRepo, "", DUMMY_FILE_CONTENT, fileRelPath, shadowFilePath)).toBe(true);    });

    test("Changes occurred, shadow file exists", async () => {
        addRepo();
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        const updatedText = `${DUMMY_FILE_CONTENT} Changed data`;
        fs.writeFileSync(filePath, updatedText);
        await populateBuffer();
        expect(assertChangeEvent(repoPath, diffsRepo, DUMMY_FILE_CONTENT, updatedText, fileRelPath, shadowFilePath)).toBe(true);
    });

    test("New File", async () => {
        addRepo();
        fs.writeFileSync(newFilePath, DUMMY_FILE_CONTENT);
        await populateBuffer();
        expect(assertNewFileEvent("new.js")).toBe(true);
    });

    test("New Binary File", async () => {
        isBinaryFileSync.mockReturnValueOnce(true);
        addRepo();
        const newRelPath = 'image.png';
        const newFilePath = path.join(repoPath, newRelPath);
        const img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0"
            + "NAAAAKElEQVQ4jWNgYGD4Twzu6FhFFGYYNXDUwGFpIAk2E4dHDRw1cDgaCAASFOffhEIO"
            + "3gAAAABJRU5ErkJggg==";
        // strip off the data: url prefix to get just the base64-encoded bytes
        var data = img.replace(/^data:image\/\w+;base64,/, "");
        var buf = Buffer.from(data, 'base64');
        fs.writeFileSync(newFilePath, buf);
        await populateBuffer();
        expect(assertNewFileEvent(newRelPath)).toBe(true);
    });

    test("Rename event", async () => {
        addRepo();
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        const newRelPath = "renamed-file.js";
        const renamedPath = path.join(repoPath, newRelPath);
        fs.renameSync(filePath, renamedPath);
        await populateBuffer();
        expect(assertRenameEvent(repoPath, configPath, fileRelPath, newRelPath)).toBe(true);
    });

    test("Rename event for empty file, should treat as new file", async () => {
        addRepo();
        fs.writeFileSync(filePath, "");
        const newRelPath = "renamed-file.js";
        const renamedPath = path.join(repoPath, newRelPath);
        fs.renameSync(filePath, renamedPath);
        await populateBuffer();
        expect(assertNewFileEvent(newRelPath)).toBe(true);
    });

    test("Delete event", async () => {
        addRepo();
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        await populateBuffer();
        const cacheFilePath = path.join(cacheRepoBranchPath, fileRelPath);
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
        expect(diffData.file_relative_path).toEqual(fileRelPath);
        expect(diffData.diff).toStrictEqual("");
    });

    test("New File -> Edit -> Rename -> Edit", async () => {
        addRepo(true);
        // New File
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        await populateBuffer();
        expect(assertNewFileEvent(fileRelPath)).toBe(true);
        // Edit
        let updatedText = `${DUMMY_FILE_CONTENT} Changed data`;
        fs.writeFileSync(filePath, updatedText);
        await populateBuffer();
        expect(assertChangeEvent(repoPath, diffsRepo, DUMMY_FILE_CONTENT, updatedText,
            fileRelPath, shadowFilePath, 2)).toBe(true);
        // Rename
        const newRelPath = "renamed-file.js";
        const renamedPath = path.join(repoPath, newRelPath);
        const renamedShadowPath = path.join(shadowRepoBranchPath, newRelPath);
        fs.renameSync(filePath, renamedPath);
        await populateBuffer();
        expect(assertRenameEvent(repoPath, configPath, fileRelPath, newRelPath, 3, false)).toBe(true);
        const configJSON = readYML(configPath);
        expect(configJSON.repos[repoPath].branches[DEFAULT_BRANCH][newRelPath]).toStrictEqual(null);
        // Edit
        const anotherUpdatedText = `${updatedText}\nAnother update to text`;
        fs.writeFileSync(renamedPath, anotherUpdatedText);
        await populateBuffer();
        expect(assertChangeEvent(repoPath, diffsRepo, updatedText, anotherUpdatedText,
            newRelPath, renamedShadowPath, 4)).toBe(true);
    });
});
