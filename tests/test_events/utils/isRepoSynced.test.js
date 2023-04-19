import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import untildify from "untildify";
import {isRepoSynced} from "../../../src/events/utils";
import {addUser, Config, getConfigFilePath, randomBaseRepoPath, randomRepoPath} from "../../helpers/helpers";
import {DEFAULT_BRANCH, SYNCIGNORE} from "../../../src/constants";

describe("isRepoSynced", () => {
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);
    const configData = {repos: {}};

    const repoPath = randomRepoPath();

    beforeEach(() => {
        // Create directories
        fs.mkdirSync(repoPath, {recursive: true});
        // Create directories
        fs.mkdirSync(baseRepoPath, {recursive: true});
        jest.clearAllMocks();
        untildify.mockReturnValue(baseRepoPath);
    });

    afterEach(() => {
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.rmSync(baseRepoPath, { recursive: true, force: true });
    });

    test("with no config.yml", () => {
        expect(isRepoSynced(repoPath)).toBe(false);
    });

    test("with invalid config.yml", () => {
        fs.writeFileSync(configPath, "");
        expect(isRepoSynced(repoPath)).toBe(false);
    });

    test("With no repo opened", () => {
        expect(isRepoSynced("")).toBe(false);
    });

    test("with repo not in config.yml", () => {
        fs.writeFileSync(configPath, yaml.dump({'repos': {}}));
        expect(isRepoSynced(repoPath)).toBe(false);
    });

    test("Non Synced Branch",  () => {
        configData.repos[repoPath] = {branches: {}};
        fs.writeFileSync(configPath, yaml.dump(configData));
        expect(isRepoSynced(repoPath)).toBe(false);
    });

    test("Synced repo", () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        expect(isRepoSynced(repoPath)).toBe(true);
    });

    test("Invalid file IDs",  () => {
        configData.repos[repoPath] = {branches: {}};
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = {
            file_1: null,
            file_2: null,
        };
        fs.writeFileSync(configPath, yaml.dump(configData));
        addUser(baseRepoPath);
        expect(isRepoSynced(repoPath)).toBe(false);
    });

    test("Disconnected repo",  () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo(true);
        addUser(baseRepoPath);
        expect(isRepoSynced(repoPath)).toBe(false);
    });

    test('Sub directory of synced repo', () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        const subDir = path.join(repoPath, "directory");
        expect(isRepoSynced(subDir)).toBe(true);
    });
    
    test('Sub directory is syncignored', () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        // Add subDir to .syncignore
        const syncignorePath = path.join(repoPath, SYNCIGNORE);
        fs.writeFileSync(syncignorePath, "directory");        
        const subDir = path.join(repoPath, "directory");
        expect(isRepoSynced(subDir)).toBe(false);
    });
});
