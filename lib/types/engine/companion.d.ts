import type { ChangeData, Diagnostic } from './types.js';
export interface CloseOptions {
    repoRoot?: string;
    activate?: boolean;
    render?: boolean;
    note?: string;
    requireBilingual: boolean;
}
export interface CloseResult {
    ok: boolean;
    phase: string;
    errors: Diagnostic[];
    warnings: Diagnostic[];
    change?: ChangeData;
    file?: string;
    refresh?: Record<string, unknown> | null;
    build?: Record<string, unknown> | null;
    render?: Record<string, unknown> | null;
    revision?: {
        before: string | null;
        after: string | null;
    };
    message?: string;
    hint?: string;
}
/**
 * 关闭开发变更（伴随开发收尾）：刷新指纹/激活 planned → validate（0 error 强制）→ build（可选 render）
 * → 标记 verified 并记录 revision.after。任何一步失败都不关闭，变更保持原状态。
 */
export declare function closeChange(projectDir: string, id: string, opts: CloseOptions): Promise<CloseResult>;
