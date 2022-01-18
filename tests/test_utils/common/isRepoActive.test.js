import fs from "fs";
import yaml from "js-yaml";
import { isRepoActive, readYML } from "../../../src/utils/common";
import {Config, getConfigFilePath, randomBaseRepoPath, randomRepoPath} from "../../helpers/helpers";

const baseRepoPath = randomBaseRepoPath();
const configPath = getConfigFilePath(baseRepoPath);

const fileData = {"repos": {"path1": {}, "path2": {is_disconnected: true}}};

beforeAll(() => {
    fs.mkdirSync(baseRepoPath, { recursive: true });
    fs.writeFileSync(configPath, yaml.safeDump(fileData));
});

afterAll(() => {
    fs.rmSync(baseRepoPath, { recursive: true, force: true });
});

test('Active Repo', () => {
    const repoPath = randomRepoPath();
    const configUtil = new Config(repoPath, configPath);
    configUtil.addRepo();
    const config = readYML(configPath);
    expect(isRepoActive(config, repoPath)).toBe(true);
});

test('Disconnected Repo', () => {
    const config = readYML(configPath);
    expect(isRepoActive(config, "path2")).toBe(false);
});
