import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { sha256Text } from './store.js';
import { renderTemplate } from './template.js';
import { diag } from './diag.js';
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
interface TreeJson {
    project?: {
        name?: unknown;
        compiled_at?: unknown;
        stats?: Record<string, unknown>;
    };
}
/** 读取 tree.json → 注入查看器模板 → 输出单文件 HTML。 */
export async function renderProject(projectDir: string, opts: RenderOptions): Promise<RenderOutput> {
    const errors: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];
    let treeText: string;
    try {
        treeText = await readFile(join(projectDir, 'tree.json'), 'utf8');
    }
    catch {
        return {
            ok: false,
            htmlPath: null,
            bytes: 0,
            sha256: null,
            summary: null,
            errors: [diag('error', 'render/no-build', '缺少 tree.json 编译产物', {}, {}, ['先运行 normify_build'])],
            warnings,
        };
    }
    let tree: TreeJson;
    try {
        tree = JSON.parse(treeText) as TreeJson;
    }
    catch (error) {
        return {
            ok: false,
            htmlPath: null,
            bytes: 0,
            sha256: null,
            summary: null,
            errors: [diag('error', 'render/bad-tree', 'tree.json 解析失败：' + String(error), {}, {}, ['重新运行 normify_build'])],
            warnings,
        };
    }
    const project = (tree.project ?? {});
    const stats = (project.stats ?? {});
    const name = String(project.name ?? 'project');
    const summary = {
        name,
        stats,
        compiledAt: String(project.compiled_at ?? ''),
        treeSha12: sha256Text(treeText).slice(0, 12),
        lang: opts.lang ?? '',
        theme: opts.theme ?? '',
    };
    const html = renderTemplate(treeText, { name, stats, compiledAt: summary.compiledAt, treeSha12: summary.treeSha12 });
    const out = join(projectDir, opts.out && opts.out.trim() !== '' ? opts.out : 'normify.html');
    try {
        await writeFile(out, html, 'utf8');
    }
    catch (error) {
        return {
            ok: false,
            htmlPath: null,
            bytes: 0,
            sha256: null,
            summary,
            errors: [diag('error', 'render/write-failed', 'HTML 写入失败：' + String(error), { out }, {}, [])],
            warnings,
        };
    }
    return { ok: true, htmlPath: out, bytes: Buffer.byteLength(html, 'utf8'), sha256: sha256Text(html), summary, errors, warnings };
}
