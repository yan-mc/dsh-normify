import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { sha256Text } from './store.js';
import { safeOutName, writeFileAtomic } from './atomic.js';
import { renderTemplate } from './template.js';
import { diag } from './diag.js';
/** 读取 tree.json → 注入查看器模板 → 输出单文件 HTML。 */
export async function renderProject(projectDir, opts) {
    const errors = [];
    const warnings = [];
    let treeText;
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
    let tree;
    try {
        tree = JSON.parse(treeText);
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
    let out;
    try {
        // 只允许纯文件名：out 是模型可控参数，绝不能拼出项目目录之外（P0-02）
        out = join(projectDir, safeOutName(opts.out));
    }
    catch (error) {
        return {
            ok: false,
            htmlPath: null,
            bytes: 0,
            sha256: null,
            summary,
            errors: [diag('error', 'render/invalid-out', '输出文件名不合法：' + String(error instanceof Error ? error.message : error), { out: opts.out }, {}, ['out 只接受纯文件名（如 normify.html），不支持路径'])],
            warnings,
        };
    }
    try {
        await writeFileAtomic(out, html);
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
//# sourceMappingURL=render.js.map