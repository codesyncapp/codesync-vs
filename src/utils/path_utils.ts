import path from "path";
import { generateSettings } from "../settings";


export class pathUtils {
    repoPath: string;
    formattedRepoPath: string;
    branch: string;
    settings: any;

    constructor(repoPath: string, branch: string) {
        this.repoPath = repoPath;
        this.formattedRepoPath = this.formatRepoPath();
        this.branch = branch;
        this.settings = generateSettings();
    }

    formatRepoPath = () => {
        return this.repoPath.replace(":", "");
    };

    getOriginalsRepoBranchPath = () => {
        return path.join(this.settings.ORIGINALS_REPO, this.formattedRepoPath, this.branch);
    };

    getShadowRepoPath = () => {
        return path.join(this.settings.SHADOW_REPO, this.formattedRepoPath);
    };

    getShadowRepoBranchPath = () => {
        return path.join(this.getShadowRepoPath(), this.branch);
    };

    getDeletedRepoPath = () => {
        return path.join(this.settings.DELETED_REPO, this.formattedRepoPath);
    };

    getDeletedRepoBranchPath = () => {
        return path.join(this.getDeletedRepoPath(), this.branch);
    };

    getDiffsRepo = () => {
        return path.join(this.settings.DIFFS_REPO);
    }

}
