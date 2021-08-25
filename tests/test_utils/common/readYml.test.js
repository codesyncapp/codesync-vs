import * as fs from "fs";
import * as yaml from "js-yaml";
import { readYML } from "../../../src/utils/common";

const filePath = "tests/files/test.yml";
const fileData = {"key": {"key1": "value1", "key2": "value2"}};

beforeEach(() => {
    if (fs.existsSync(filePath)) {
        fs.rmSync(filePath);
    }
    // Create directories
    fs.mkdirSync("tests/files", { recursive: true });
    fs.writeFileSync(filePath, yaml.safeDump(fileData));
});

afterEach(() => {
    fs.rmSync(filePath);
});


test('reads yml file', () => {
    expect(readYML(filePath)).toStrictEqual(fileData);
});
