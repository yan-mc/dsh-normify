import type { ChangeData, Diagnostic, ModuleFile } from './types.js';
/**
 * 开发变更日志（changes/<id>.json）：放在结构数据目录内，随工程一起回档。
 * 生命周期：open（proposed/in_progress）→ close（verified，强制 0 error）或 abandoned。
 */
export declare const CHANGE_SCHEMA_VERSION = 1;
export declare const CHANGES_DIR = "changes";
export declare function isValidChangeId(id: string): boolean;
export declare function changeFilePath(projectDir: string, id: string): string;
/** L1：单个变更文件的形状校验。 */
export declare function l1ValidateChange(data: unknown, id: string, where: string): {
    change: ChangeData | null;
    errors: Diagnostic[];
    warnings: Diagnostic[];
};
export declare function listChangeIds(projectDir: string): Promise<string[]>;
export declare function loadChangeFile(projectDir: string, id: string): Promise<{
    change: ChangeData | null;
    error: Diagnostic | null;
}>;
export declare function writeChangeFile(projectDir: string, change: ChangeData): Promise<string>;
/** L2：全部变更文件与当前模块集的一致性校验。 */
export declare function validateChanges(projectDir: string, byId: Map<string, ModuleFile>): Promise<{
    changes: ChangeData[];
    errors: Diagnostic[];
    warnings: Diagnostic[];
}>;
