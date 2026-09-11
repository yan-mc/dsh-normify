import type { Diagnostic, LayoutData, ModuleFile } from './types.js';
export declare const LAYOUT_SCHEMA_VERSION = 1;
/** sibling 边集合的 key：避免 NUL 字面量在源码/JSON 转义中踩坑。 */
export declare function edgeKey(from: string, to: string): string;
/** 模块 id → 渲染数据文件的项目相对路径（正斜杠）。 */
export declare function layoutRelPath(id: string): string;
export declare function layoutFilePath(projectDir: string, id: string): string;
/** 渲染数据相对路径 → 模块 id（demo/order.json 或 renders/demo/order.json → demo.order）。 */
export declare function idFromLayoutPath(relPath: string): string | null;
/** 列出全部渲染数据文件（renders/ 下相对路径，正斜杠）。 */
export declare function listLayoutFiles(projectDir: string): Promise<string[]>;
/** 读取单个渲染数据文件；不存在返回 null。 */
export declare function loadLayoutFile(projectDir: string, id: string): Promise<{
    layout: LayoutData | null;
    error: Diagnostic | null;
}>;
/**
 * L1：渲染数据文件自身校验（形状 + 与直接子级集合的一致性）。
 * 需要 children（直接子模块 id 列表）与 siblingEdges（'from\0to' 集合）。
 */
export declare function l1ValidateLayout(data: unknown, id: string, children: string[], siblingEdges: Set<string>, where: string): {
    layout: LayoutData | null;
    errors: Diagnostic[];
    warnings: Diagnostic[];
};
/** 稳定序列化（字段顺序固定，便于 diff）。 */
export declare function serializeLayout(layout: LayoutData): string;
export declare function writeLayoutFile(projectDir: string, layout: LayoutData): Promise<string>;
export declare function deleteLayoutFile(projectDir: string, id: string): Promise<boolean>;
/** L2：全项目渲染数据校验 + 与结构数据集的交叉校验。 */
export declare function validateLayouts(projectDir: string, byId: Map<string, ModuleFile>, childrenOf: Map<string, string[]>, siblingEdges: Map<string, Set<string>>): Promise<{
    layouts: Map<string, LayoutData>;
    errors: Diagnostic[];
    warnings: Diagnostic[];
}>;
