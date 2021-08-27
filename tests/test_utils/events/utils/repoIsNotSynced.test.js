import fs from "fs";
import yaml from "js-yaml";
import {repoIsNotSynced} from "../../../../src/events/utils";
import {randomBaseRepoPath, randomRepoPath} from "../../../helpers/helpers";

const baseRepo = randomBaseRepoPath();
const configPath = `${baseRepo}/config.yml`;

const repoPath = randomRepoPath();

beforeAll(() => {
    // Create directories
    fs.mkdirSync(repoPath, { recursive: true });
    // Create directories
    fs.mkdirSync(baseRepo, { recursive: true });
});

afterAll(() => {
    fs.rmdirSync(baseRepo, { recursive: true });
    fs.rmdirSync(repoPath, { recursive: true });
});

test("repoIsNotSynced with no config.yml",  () => {
    expect(repoIsNotSynced(repoPath, configPath)).toBe(true);
});

test("repoIsNotSynced with default config.yml",  () => {
    expect(repoIsNotSynced(repoPath)).toBe(true);
});

test("repoIsNotSynced with repo not in config.yml",  () => {
    fs.writeFileSync(configPath, yaml.safeDump({'repos': {}}));
    expect(repoIsNotSynced(repoPath, configPath)).toBe(true);
    fs.rmSync(configPath);
});

test("repoIsNotSynced with repo in config.yml",  () => {
    const config = {'repos': {}};
    config.repos[repoPath] = {'branches': {}};
    fs.writeFileSync(configPath, yaml.safeDump(config));
    expect(repoIsNotSynced(repoPath, configPath)).toBe(false);
    fs.rmSync(configPath);
});

test("repoIsNotSynced with invalid config.yml",  () => {
    fs.writeFileSync(configPath, "");
    expect(repoIsNotSynced(repoPath, configPath)).toBe(true);
    fs.rmSync(configPath);
});
