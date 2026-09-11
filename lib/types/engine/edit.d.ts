import type { Diagnostic, Module, ModuleState } from './types.js';
/**
 * 修改强化：patch / batch（原子）/ move（级联）/ refresh（激活）。
 * 所有写操作支持 dry_run；失败时整批回滚（快照 modules/ + renders/）。
 */
export interface EditOptions {
    dryRun?: boolean;
}
export interface EditResult {
    ok: boolean;
    dryRun: boolean;
    errors: Diagnostic[];
    warnings: Diagnostic[];
    changed: string[];
    detail: Record<string, unknown>;
}
/** 预览模块将写入的文件路径（不落盘）。 */
export declare function previewModuleFile(projectDir: string, module: Module, all: Module[]): string;
export interface PatchResult extends EditResult {
    module?: Module;
    file?: string;
}
export declare function patchModule(projectDir: string, id: string, patch: Record<string, unknown>, opts?: EditOptions & {
    body?: string;
}): Promise<PatchResult>;
export interface BatchItem {
    frontmatter?: Record<string, unknown>;
    patch?: {
        id: string;
        patch: Record<string, unknown>;
    };
}
export interface BatchResult extends EditResult {
    files: string[];
}
/** 批量 upsert/patch：全部 L1 + 结构预检通过才落盘（原子，失败回滚）。 */
export declare function batchWrite(projectDir: string, items: BatchItem[], mode: 'upsert' | 'patch', opts?: EditOptions): Promise<BatchResult>;
export interface MoveOptions extends EditOptions {
    newId?: string;
    newParent?: string;
}
/** 重命名/移动子树：保 uid、级联 parent、重写 deps.to、迁移模块与渲染数据文件。 */
export declare function moveModuleTree(projectDir: string, id: string, opts: MoveOptions): Promise<EditResult & {
    moves: {
        from: string;
        to: string;
    }[];
    rewired: {
        module: string;
        from: string;
        to: string;
    }[];
}>;
export interface RefreshOptions extends EditOptions {
    ids?: string[];
    all?: boolean;
    repoRoot: string;
    activate?: boolean;
}
/** 重算 fingerprint/revision/updated_at；planned 模块落地后可用 activate 一键转 active。 */
export declare function refreshModules(projectDir: string, opts: RefreshOptions): Promise<EditResult & {
    refreshed: {
        id: string;
        fingerprint: string;
        state: ModuleState;
        file: string;
    }[];
    missing: {
        id: string;
        paths: string[];
    }[];
}>;
export interface Proposal {
    deps?: {
        from: string;
        to: string;
        kind?: string;
        to_api?: string;
    }[];
    modules?: {
        id: string;
        parent?: string | null;
        state?: ModuleState;
    }[];
}
/** 编码/设计前预检：拟新增的模块与依赖是否违反核心约束与 policy。 */
export declare function checkProposal(projectDir: string, proposal: Proposal): Promise<{
    ok: boolean;
    errors: Diagnostic[];
    warnings: Diagnostic[];
}>;
