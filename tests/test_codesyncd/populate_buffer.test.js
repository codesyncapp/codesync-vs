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
import {DEFAULT_BRANCH} from "../../src/constants";
import {
    assertChangeEvent,
    assertNewFileEvent,
    assertFileDeleteEvent,
    assertRenameEvent,
    DUMMY_FILE_CONTENT,
    getConfigFilePath,
    getSeqTokenFilePath,
    randomBaseRepoPath,
    randomRepoPath,
    TEST_EMAIL,
    TEST_REPO_RESPONSE,
    waitFor,
    addUser
} from "../helpers/helpers";


describe("populateBuffer", () => {
    let baseRepoPath;
    let repoPath;
    let configPath;
    let sequenceTokenFilePath;
    let pathUtilsObj;
    let shadowRepoBranchPath;
    let diffsRepo;
    let filePath;
    let shadowFilePath;
    let newFilePath;

    const fileRelPath = "file_1.js";


    beforeEach(() => {
        fetch.resetMocks();
        jest.clearAllMocks();
        jest.spyOn(global.console, 'log');
        global.IS_CODESYNC_TEST_MODE = true;
        
        baseRepoPath = randomBaseRepoPath("populateBuffer");
        repoPath = randomRepoPath();

        untildify.mockReturnValue(baseRepoPath);

        configPath = getConfigFilePath(baseRepoPath);
        sequenceTokenFilePath = getSeqTokenFilePath(baseRepoPath);
    
        pathUtilsObj = new pathUtils(repoPath, DEFAULT_BRANCH);
        shadowRepoBranchPath = pathUtilsObj.getShadowRepoBranchPath();
        diffsRepo = pathUtilsObj.getDiffsRepo();
        filePath = path.join(repoPath, fileRelPath);
        shadowFilePath = path.join(shadowRepoBranchPath, fileRelPath);
        newFilePath = path.join(repoPath, "new.js");
    
        fs.mkdirSync(baseRepoPath, {recursive: true});
        createSystemDirectories();
        fs.mkdirSync(repoPath, {recursive: true});
    });

    afterEach(() => {
        fs.rmSync(repoPath, {recursive: true, force: true});
        fs.rmSync(baseRepoPath, {recursive: true, force: true});
    });

    const addRepo = (deleteFile1=false, isActive=true) => {
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
        addUser(baseRepoPath, isActive);
    };

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

    test("Repo synced, change occurred but user is inActive", async () => {
        addRepo(false, false);
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
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
        expect(assertChangeEvent(repoPath, diffsRepo, "", DUMMY_FILE_CONTENT, fileRelPath, shadowFilePath)).toBe(true);
    });

    test("Changes occurred, shadow file exists", async () => {
        addRepo();
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        const updatedText = `${DUMMY_FILE_CONTENT} Changed data`;
        await waitFor(0.01);
        fs.writeFileSync(filePath, updatedText);
        await populateBuffer();
        expect(assertChangeEvent(repoPath, diffsRepo, DUMMY_FILE_CONTENT, updatedText, fileRelPath, shadowFilePath)).toBe(true);
    });

    test("New File", async () => {
        addRepo();
        fs.writeFileSync(newFilePath, DUMMY_FILE_CONTENT);
        await populateBuffer();
        expect(assertNewFileEvent(repoPath, "new.js")).toBe(true);
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
        expect(assertNewFileEvent(repoPath, newRelPath)).toBe(true);
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
        expect(assertNewFileEvent(repoPath, newRelPath)).toBe(true);
    });

    test("Delete event", async () => {
        addRepo();
        fs.writeFileSync(shadowFilePath, DUMMY_FILE_CONTENT);
        await populateBuffer();
        expect(assertFileDeleteEvent(repoPath, fileRelPath)).toBe(true);
    });

    test("1 New File, 1 Edit of other file in same iteration", async () => {
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        addRepo();
        // Another new file 
        const newFfileRelPath = 'abc.js';
        const newFilePath = path.join(repoPath, newFfileRelPath);
        fs.writeFileSync(newFilePath, DUMMY_FILE_CONTENT);
        // Edit of other file
        let updatedText = `${DUMMY_FILE_CONTENT} Changed data`;
        fs.writeFileSync(filePath, updatedText);
        await populateBuffer();
        await waitFor(0.1);
        let diffFiles = fs.readdirSync(diffsRepo);
        const newFileDiffs =  diffFiles.filter(diffFile => {
            const diffFilePath = path.join(diffsRepo, diffFile);
            const diffData = readYML(diffFilePath);
            return diffData.is_new_file;
        });
        expect(newFileDiffs).toHaveLength(1);
    });

    test("New File -> Edit -> Rename -> Edit", async () => {
        addRepo(true);
        // New File
        fs.writeFileSync(filePath, DUMMY_FILE_CONTENT);
        await populateBuffer();
        await waitFor(0.1);
        expect(assertNewFileEvent(repoPath, fileRelPath)).toBe(true);
        // Edit
        let updatedText = `${DUMMY_FILE_CONTENT} Changed data`;
        fs.writeFileSync(filePath, updatedText);
        await populateBuffer();
        await waitFor(0.1);
        expect(assertChangeEvent(repoPath, diffsRepo, DUMMY_FILE_CONTENT, updatedText,
            fileRelPath, shadowFilePath, 2)).toBe(true);
        // Rename
        const newRelPath = "renamed-file.js";
        const renamedPath = path.join(repoPath, newRelPath);
        const renamedShadowPath = path.join(shadowRepoBranchPath, newRelPath);
        fs.renameSync(filePath, renamedPath);
        await populateBuffer();
        await waitFor(0.1);
        expect(assertRenameEvent(repoPath, configPath, fileRelPath, newRelPath, 3, false)).toBe(true);
        const configJSON = readYML(configPath);
        expect(configJSON.repos[repoPath].branches[DEFAULT_BRANCH][newRelPath]).toStrictEqual(null);
        // Edit
        const anotherUpdatedText = `${updatedText}\nAnother update to text`;
        fs.writeFileSync(renamedPath, anotherUpdatedText);
        await populateBuffer();
        await waitFor(0.1);
        expect(assertChangeEvent(repoPath, diffsRepo, updatedText, anotherUpdatedText,
            newRelPath, renamedShadowPath, 4)).toBe(true);
    });
});
