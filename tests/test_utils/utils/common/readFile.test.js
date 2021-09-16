import fs from "fs";
import { readFile } from "../../../../src/utils/common";
import {randomRepoPath} from "../../../helpers/helpers";

const repoPath = randomRepoPath();
const filePath = `${repoPath}/empty.txt`;
const fileData = "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. ";

beforeEach(() => {
    fs.mkdirSync(repoPath, { recursive: true });
    fs.writeFileSync(filePath, fileData);
});

afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
});

test('reads file', () => {
    expect(readFile(filePath)).toBe(fileData);
});
