import fs from "fs";
import yaml from "js-yaml";
import untildify from "untildify";
import {repoIsNotSynced} from "../../../../src/events/utils";
import {getConfigFilePath, randomBaseRepoPath, randomRepoPath} from "../../../helpers/helpers";


describe("repoIsNotSynced", () => {
    const baseRepoPath = randomBaseRepoPath();
    const configPath = getConfigFilePath(baseRepoPath);

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
        expect(repoIsNotSynced(repoPath)).toBe(true);
    });

    test("with default config.yml", () => {
        expect(repoIsNotSynced(repoPath)).toBe(true);
    });

    test("with repo not in config.yml", () => {
        fs.writeFileSync(configPath, yaml.safeDump({'repos': {}}));
        expect(repoIsNotSynced(repoPath)).toBe(true);
    });

    test("with repo in config.yml", () => {
        const config = {'repos': {}};
        config.repos[repoPath] = {'branches': {}};
        fs.writeFileSync(configPath, yaml.safeDump(config));
        expect(repoIsNotSynced(repoPath)).toBe(false);
    });

    test("repoIsNotSynced with invalid config.yml", () => {
        fs.writeFileSync(configPath, "");
        expect(repoIsNotSynced(repoPath)).toBe(true);
    });

    test("With no repo opened", () => {
        expect(repoIsNotSynced("")).toBe(true);
    });
});
