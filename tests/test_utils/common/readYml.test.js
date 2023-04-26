import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import untildify from "untildify";
import { readYML } from "../../../src/utils/common";
import { randomRepoPath, randomBaseRepoPath } from "../../helpers/helpers";

const baseRepoPath = randomBaseRepoPath();
const repoPath = randomRepoPath();
const filePath = path.join(repoPath, "test.yml");

const fileData = {"key": {"key1": "value1", "key2": "value2"}};

beforeEach(() => {
    untildify.mockReturnValue(baseRepoPath);
    if (fs.existsSync(filePath)) {
        fs.rmSync(filePath);
    }
    // Create directories
    fs.mkdirSync(baseRepoPath, { recursive: true });
    fs.mkdirSync(repoPath, { recursive: true });
    fs.writeFileSync(filePath, yaml.dump(fileData));
});

afterEach(() => {
    fs.rmSync(filePath);
    fs.rmSync(repoPath, { recursive: true, force: true });
});

test('reads yml file', () => {
    expect(readYML(filePath)).toStrictEqual(fileData);
});

test('reads yml file with non-existing file path', () => {
    expect(readYML("dummyPath")).toStrictEqual(null);
});

