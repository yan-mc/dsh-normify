import type { Diagnostic } from './types.js';
export interface RenderOptions {
    out?: string;
    lang?: string;
    theme?: string;
}
export interface RenderOutput {
    ok: boolean;
    htmlPath: string | null;
    bytes: number;
    sha256: string | null;
    summary: Record<string, unknown> | null;
    errors: Diagnostic[];
    warnings: Diagnostic[];
}
/** 读取 tree.json → 注入查看器模板 → 输出单文件 HTML。 */
export declare function renderProject(projectDir: string, opts: RenderOptions): Promise<RenderOutput>;
