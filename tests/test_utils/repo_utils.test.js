import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import untildify from "untildify";
import { RepoState } from "../../src/utils/repo_state_utils";
import {addUser, Config, getConfigFilePath, randomBaseRepoPath, randomRepoPath} from "../helpers/helpers";
import {DEFAULT_BRANCH, SYNCIGNORE} from "../../src/constants";

describe("RepoState:get", () => {
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
        const repoState = new RepoState(repoPath).get();
        expect(repoState.IS_OPENED).toBe(true);
        expect(repoState.IS_CONNECTED).toBe(false);
        expect(repoState.IS_DISCONNECTED).toBe(false);
        expect(repoState.IS_SUB_DIR).toBe(false);
        expect(repoState.IS_SYNC_IGNORED).toBe(false);
    });

    test("with invalid config.yml", () => {
        fs.writeFileSync(configPath, "");
        const repoState = new RepoState(repoPath).get();
        expect(repoState.IS_CONNECTED).toBe(false);
        expect(repoState.IS_DISCONNECTED).toBe(false);
    });

    test("With no repo opened", () => {
        const repoUtils = new RepoState("");
        const repoState = repoUtils.get();
        expect(repoState.IS_OPENED).toBe(false);
        expect(repoState.IS_CONNECTED).toBe(false);
        expect(repoState.IS_DISCONNECTED).toBe(false);
    });

    test("with repo not in config.yml", () => {
        fs.writeFileSync(configPath, yaml.dump({'repos': {}}));
        const repoState = new RepoState(repoPath).get();
        expect(repoState.IS_CONNECTED).toBe(false);
        expect(repoState.IS_DISCONNECTED).toBe(false);
    });

    test("Non Synced Branch",  () => {
        configData.repos[repoPath] = {branches: {}};
        fs.writeFileSync(configPath, yaml.dump(configData));
        const repoState = new RepoState(repoPath).get();
        expect(repoState.IS_CONNECTED).toBe(false);
        expect(repoState.IS_DISCONNECTED).toBe(false);
    });

    test("Connected repo", () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        const repoState = new RepoState(repoPath).get();
        expect(repoState.IS_CONNECTED).toBe(true);
        expect(repoState.IS_DISCONNECTED).toBe(false);
    });

    test("Invalid file IDs",  () => {
        configData.repos[repoPath] = {branches: {}};
        configData.repos[repoPath].branches[DEFAULT_BRANCH] = {
            file_1: null,
            file_2: null,
        };
        fs.writeFileSync(configPath, yaml.dump(configData));
        addUser(baseRepoPath);
        const repoState = new RepoState(repoPath).get();
        expect(repoState.IS_CONNECTED).toBe(false);
        expect(repoState.IS_DISCONNECTED).toBe(false);
    });

    test("Disconnected repo",  () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo(true);
        addUser(baseRepoPath);
        const repoState = new RepoState(repoPath).get();
        expect(repoState.IS_CONNECTED).toBe(false);
        expect(repoState.IS_DISCONNECTED).toBe(true);
    });

    test('Sub directory of connected repo', () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        const subDir = path.join(repoPath, "directory");
        const repoUtils = new RepoState(subDir);
        const repoState = repoUtils.get();
        expect(repoState.IS_CONNECTED).toBe(true);
        expect(repoState.IS_DISCONNECTED).toBe(false);
        expect(repoState.IS_SUB_DIR).toBe(true);
        expect(repoState.IS_SYNC_IGNORED).toBe(false);
    });
    
    test('Sub directory is syncignored', () => {
        const configUtil = new Config(repoPath, configPath);
        configUtil.addRepo();
        addUser(baseRepoPath);
        // Add subDir to .syncignore
        const syncignorePath = path.join(repoPath, SYNCIGNORE);
        fs.writeFileSync(syncignorePath, "directory");        
        const subDir = path.join(repoPath, "directory");
        const repoUtils = new RepoState(subDir);
        const repoState = repoUtils.get();
        expect(repoState.IS_DISCONNECTED).toBe(false);
        expect(repoState.IS_CONNECTED).toBe(true);
        expect(repoState.IS_SUB_DIR).toBe(true);
        expect(repoState.IS_SYNC_IGNORED).toBe(true);
    });
});
