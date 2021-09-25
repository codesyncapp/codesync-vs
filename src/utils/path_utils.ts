import path from "path";
import vscode from "vscode";

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

    static getRootPath = () => {
        let rootPath = vscode.workspace.rootPath;
        // For window paths, capitalizing drive name
        // e.g. c:\Users\repo to C:\Users\repo
        if (rootPath && rootPath.indexOf(":") > -1 && !rootPath.startsWith("/")) {
            rootPath = rootPath.charAt(0).toUpperCase() + rootPath.slice(1);
        }
        return rootPath;
    };

    formatRepoPath = () => {
        return this.repoPath.replace(":", "");
    };

    getOriginalsRepoPath = () => {
        return path.join(this.settings.ORIGINALS_REPO, this.formattedRepoPath);
    };

    getOriginalsRepoBranchPath = () => {
        return path.join(this.getOriginalsRepoPath(), this.branch);
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
