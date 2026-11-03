import type { Diagnostic, Module, ModuleFile, SourceRef } from './types.js';
export declare const PROJECT_PREFIX = "normify-";
export declare class NormifyError extends Error {
    code: string;
    constructor(code: string, message: string);
}
export interface ProjectRef {
    dir: string;
    slug: string;
}
/** 解析结构数据目录：dir 显式给出，或 normify-<project> 落在 rootDir 下。create=true 时自动创建空项目目录（仅写工具使用）。 */
export declare function resolveProject(rootDir: string, args: {
    project?: string;
    dir?: string;
}, opts?: {
    create?: boolean;
}): Promise<ProjectRef>;
export declare function listProjects(rootDir: string): ProjectRef[];
export declare function listModuleFiles(projectDir: string): Promise<string[]>;
/** 找模块现有文件（容器 index.md 优先，其次叶子 x.md）。 */
export declare function findModuleFile(projectDir: string, id: string): string | null;
export declare function loadAllModules(projectDir: string): Promise<{
    files: ModuleFile[];
    errors: Diagnostic[];
    warnings: Diagnostic[];
}>;
/** 判断某模块当前是否为容器（有子模块或是根）。 */
export declare function isContainer(module: Module, all: Module[]): boolean;
export declare function writeModuleFile(projectDir: string, module: Module, body: string): Promise<{
    file: string;
    promoted: string[];
    warnings: Diagnostic[];
}>;
/** 删除模块及其子树（含空目录清理与父模块降级）。 */
export declare function deleteModuleTree(projectDir: string, id: string): Promise<{
    deleted: string[];
    demoted: string | null;
    warnings: Diagnostic[];
}>;
/** 叶子晋升容器：x.md → x/index.md。 */
export declare function promoteModule(projectDir: string, id: string): Promise<{
    file: string;
    warnings: Diagnostic[];
}>;
/** 仓库当前 HEAD（40 位 SHA）。 */
export declare function gitHead(repoRoot: string): {
    sha: string | null;
    error: string | null;
};
export declare function isValidDiffSpec(spec: string): boolean;
/** git 变更文件清单（增量再生成的输入）。 */
export declare function gitChangedFiles(repoRoot: string, diffSpec: string): {
    files: string[] | null;
    error: string | null;
};
/** 仓库内相对路径是否安全（无绝对/反斜杠/空段/..），用于 fingerprint 的 source 白名单。 */
export declare function isSafeRepoRelative(p: string): boolean;
/** source 文件集合的 SHA-256 指纹（全量哈希，v1 不做采样）。越界/不安全路径按缺失处理并在 missing 中列出。 */
export declare function fingerprintOf(repoRoot: string, sources: SourceRef[]): Promise<{
    hash: string | null;
    missing: string[];
}>;
export declare function sha256Text(text: string): string;
