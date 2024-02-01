import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import untildify from "untildify";
import { RepoUtils, RepoState } from "../../src/utils/repo_utils";
import {addUser, Config, getConfigFilePath, randomBaseRepoPath, randomRepoPath} from "../helpers/helpers";
import {DEFAULT_BRANCH, SYNCIGNORE} from "../../src/constants";

describe("RepoUtils:isRepoConnected", () => {
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
        const repoUtils = new RepoUtils(repoPath);
        expect(repoUtils.isRepoConnected()).toBe(false);
    });

    test("with invalid config.yml", () => {
        fs.writeFileSync(configPath, "");
        const repoUtils = new RepoUtils(repoPath);
        expect(repoUtils.isRepoConnected()).toBe(false);
        expect(repoUtils.getState()).toStrictEqual(RepoState.NOT_CONNECTED);
    });

    test("With no repo opened", () => {
        const repoUtils = new RepoUtils("");
        expect(repoUtils.isRepoConnected()).toBe(false);
        expect(repoUtils.getState()).toStrictEqual(RepoState.NOT_CONNECTED);
    });

    test("with repo not in config.yml", () => {
        fs.writeFileSync(configPath, yaml.dump({'repos': {}}));
        const repoUtils = new RepoUtils(repoPath);
        expect(repoUtils.isRepoConnected()).toBe(false);
        expect(repoUtils.getState()).toStrictEqual(RepoState.NOT_CONNECTED);
    });

    test("Non Synced Branch",  () => {
        configData.repos[repoPath] = {branches: {}};
        fs.writeFileSync(configPath, yaml.dump(configData));
        const repoUtils = new RepoUtils(repoPath);
        expect(repoUtils.isRepoConnected()).toBe(false);
        expect(repoUtils.getState()).toStrictEqual(RepoState.NOT_CONNECTED);
    });

    test("Connected repo", () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        const repoUtils = new RepoUtils(repoPath);
        expect(repoUtils.isRepoConnected()).toBe(true);
        expect(repoUtils.getState()).toStrictEqual(RepoState.CONNECTED);
    });

    test("Invalid file IDs",  () => {
        configData.repos[repoPath] = {branches: {}};
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = {
            file_1: null,
            file_2: null,
        };
        fs.writeFileSync(configPath, yaml.dump(configData));
        addUser(baseRepoPath);
        const repoUtils = new RepoUtils(repoPath);
        expect(repoUtils.isRepoConnected()).toBe(false);
        expect(repoUtils.getState()).toStrictEqual(RepoState.NOT_CONNECTED);
    });

    test("Disconnected repo",  () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo(true);
        addUser(baseRepoPath);
        const repoUtils = new RepoUtils(repoPath);
        expect(repoUtils.isRepoConnected()).toBe(false);
        expect(repoUtils.getState()).toStrictEqual(RepoState.DISCONNECTED);
    });

    test('Sub directory of connected repo', () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        const subDir = path.join(repoPath, "directory");
        const repoUtils = new RepoUtils(subDir);
        expect(repoUtils.isRepoConnected()).toBe(true);
        expect(repoUtils.getState()).toStrictEqual(RepoState.CONNECTED);
    });
    
    test('Sub directory is syncignored', () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        // Add subDir to .syncignore
        const syncignorePath = path.join(repoPath, SYNCIGNORE);
        fs.writeFileSync(syncignorePath, "directory");        
        const subDir = path.join(repoPath, "directory");
        const repoUtils = new RepoUtils(subDir);
        expect(repoUtils.isRepoConnected()).toBe(false);
        expect(repoUtils.getState()).toStrictEqual(RepoState.NOT_CONNECTED);
    });
});
