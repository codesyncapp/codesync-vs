import fs from "fs";
import yaml from "js-yaml";
import { isRepoActive, readYML } from "../../../../src/utils/common";
import { getRandomString } from "../../../helpers/helpers";

const repoPath = `tests/test_repo_${getRandomString(10)}`;
const configPath = `${repoPath}/config.yml`;

const fileData = {"repos": {"path1": {}, "path2": {is_disconnected: true}}};

beforeAll(() => {
    fs.mkdirSync(repoPath, { recursive: true });
    fs.writeFileSync(configPath, yaml.safeDump(fileData));
});

afterAll(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
});

test('Active Repo', () => {
    const config = readYML(configPath);
    expect(isRepoActive(config, "path1")).toBe(true);
});

test('Disconnected Repo', () => {
    const config = readYML(configPath);
    expect(isRepoActive(config, "path2")).toBe(false);
});
