import type { Diagnostic, Module } from './types.js';
export declare function checkSourceEntry(v: unknown, where: string, out: Diagnostic[]): boolean;
export declare function checkApiEntry(v: unknown, where: string, out: Diagnostic[]): boolean;
export declare function checkDepEntry(v: unknown, where: string, out: Diagnostic[]): boolean;
/** L1：单文件级字段校验（规范 §5.2 结构/API/边类的格式部分）。 */
export declare function l1Validate(data: unknown, where: string): {
    module: Module | null;
    errors: Diagnostic[];
    warnings: Diagnostic[];
};
/** 解析模块文件文本：frontmatter（严格子集 YAML）+ 正文。 */
export declare function parseModuleText(text: string, where: string): {
    module: Module | null;
    body: string;
    errors: Diagnostic[];
    warnings: Diagnostic[];
};
export declare function serializeModule(module: Module, body: string): string;
/** 为 AI 生成器准备的字段速查（与 skills/normify-gen/SKILL.md 同步维护）。 */
export declare function fieldReference(): string;
