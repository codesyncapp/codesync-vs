import * as fs from "fs";
import * as yaml from "js-yaml";
import { readYML } from "../../../../src/utils/common";
import {randomRepoPath} from "../../../helpers/helpers";

const repoPath = randomRepoPath();
const filePath = `${repoPath}/test.yml`;

const fileData = {"key": {"key1": "value1", "key2": "value2"}};

beforeEach(() => {
    if (fs.existsSync(filePath)) {
        fs.rmSync(filePath);
    }
    // Create directories
    fs.mkdirSync(repoPath, { recursive: true });
    fs.writeFileSync(filePath, yaml.safeDump(fileData));
});

afterEach(() => {
    fs.rmSync(filePath);
    fs.rmdirSync(repoPath, {recursive: true});
});

test('reads yml file', () => {
    expect(readYML(filePath)).toStrictEqual(fileData);
});

test('reads yml file with non-existing file path', () => {
    expect(readYML("dummyPath")).toEqual(undefined);
});

