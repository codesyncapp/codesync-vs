import fs from "fs";
import { readFile } from "../../../src/utils/common";

const filePath = "tests/files/empty.txt";
const fileData = "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. ";

beforeEach(() => {
    if (fs.existsSync(filePath)) {
        fs.rmSync(filePath);
    }
    // Create directories
    fs.mkdirSync("tests/files", { recursive: true });
    fs.writeFileSync(filePath, fileData);

});

afterEach(() => {
    fs.rmSync(filePath);
});


test('reads file', () => {
    expect(readFile(filePath)).toBe(fileData);
});
