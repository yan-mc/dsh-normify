import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { apiKey, depthOf, treeOf } from './ids.js';
import { sha256Text } from './store.js';
import { validateProject } from './validate.js';
import { diag } from './diag.js';
function oneLine(desc, max = 100) {
    const line = desc.split(/\r?\n/)[0]?.trim() ?? '';
    return line.length > max ? line.slice(0, max) + '…' : line;
}
function outlineText(slug, v) {
    const files = [...v.files].sort((a, b) => a.module.id.localeCompare(b.module.id));
    const byId = new Map(files.map(f => [f.module.id, f.module]));
    const roots = files.filter(f => f.module.parent === null).sort((a, b) => a.module.id.localeCompare(b.module.id));
    const descendantMemo = new Map();
    const countDesc = (id) => {
        const hit = descendantMemo.get(id);
        if (hit !== undefined)
            return hit;
        const kids = v.childrenOf.get(id) ?? [];
        let total = kids.length;
        for (const k of kids)
            total += countDesc(k);
        descendantMemo.set(id, total);
        return total;
    };
    const apiCount = (id) => {
        const kids = v.childrenOf.get(id) ?? [];
        let total = 0;
        for (const k of kids) {
            const m = byId.get(k);
            total += (m !== undefined && m.apis !== undefined ? m.apis.length : 0) + apiCount(k);
        }
        return total;
    };
    const lines = [];
    lines.push('# ' + slug + ' · Normify Outline');
    lines.push('');
    lines.push('> 派生索引（每次 normify.build 重建）。AI 导航入口：先广度后深度。');
    lines.push('');
    const walk = (id, indent) => {
        const m = byId.get(id);
        if (m === undefined)
            return;
        const modules = countDesc(id) + 1;
        const apis = (m.apis?.length ?? 0) + apiCount(id);
        lines.push('  '.repeat(indent) + '- ' + id
            + ' — ' + m.name.zh + ' / ' + m.name.en
            + ' — ' + oneLine(m.description.zh, 80)
            + ' — [模块 ' + modules + ' · API ' + apis + ']');
        for (const k of v.childrenOf.get(id) ?? [])
            walk(k, indent + 1);
    };
    for (const r of roots) {
        const m = r.module;
        lines.push('## ' + m.id + (m.repository !== undefined ? '（' + m.repository + '）' : ''));
        lines.push('');
        walk(m.id, 0);
        lines.push('');
    }
    return lines.join('\n') + '\n';
}
/** L3：校验通过后编译 tree.json / outline.md / api-index.json / receipt.json（冻结）。 */
export async function buildProject(projectDir, opts) {
    const v = await validateProject(projectDir, opts);
    if (!v.ok) {
        return { ok: false, receipt: null, errors: v.errors, warnings: v.warnings, validate: v };
    }
    const slug = projectDir.split(/[\\\/]/).pop() ?? 'project';
    const files = [...v.files].sort((a, b) => a.module.id.localeCompare(b.module.id));
    const byId = new Map(files.map(f => [f.module.id, f.module]));
    const roots = files.filter(f => f.module.parent === null).sort((a, b) => a.module.id.localeCompare(b.module.id));
    const descendantMemo = new Map();
    const countDesc = (id) => {
        const hit = descendantMemo.get(id);
        if (hit !== undefined)
            return hit;
        const kids = v.childrenOf.get(id) ?? [];
        let total = kids.length;
        for (const k of kids)
            total += countDesc(k);
        descendantMemo.set(id, total);
        return total;
    };
    const apiBelow = (id) => {
        let total = 0;
        for (const k of v.childrenOf.get(id) ?? []) {
            const m = byId.get(k);
            total += (m !== undefined && m.apis !== undefined ? m.apis.length : 0) + apiBelow(k);
        }
        return total;
    };
    const depIn = new Map();
    let depCount = 0;
    let crossTreeDepCount = 0;
    const edges = [];
    for (const f of files) {
        const m = f.module;
        if (m.deps === undefined)
            continue;
        for (const d of m.deps) {
            depCount++;
            depIn.set(d.to, (depIn.get(d.to) ?? 0) + 1);
            const cross = treeOf(d.to) !== treeOf(m.id);
            if (cross)
                crossTreeDepCount++;
            edges.push({
                from: m.id,
                from_api: d.from_api,
                to: d.to,
                to_api: d.to_api,
                kind: d.kind,
                cross_tree: cross,
                label: d.label,
            });
        }
    }
    edges.sort((a, b) => String(a.from).localeCompare(String(b.from)) || String(a.to).localeCompare(String(b.to)));
    const modules = {};
    let apiCount = 0;
    let leafCount = 0;
    let maxDepth = 0;
    for (const f of files) {
        const m = f.module;
        const ownApis = m.apis ?? [];
        apiCount += ownApis.length;
        const isLeaf = !v.childrenOf.has(m.id);
        if (isLeaf)
            leafCount++;
        maxDepth = Math.max(maxDepth, depthOf(m.id));
        modules[m.id] = {
            uid: m.uid,
            id: m.id,
            parent: m.parent,
            tree: treeOf(m.id),
            depth: depthOf(m.id),
            name: m.name,
            description: m.description,
            source: m.source,
            revision: m.revision,
            updated_at: m.updated_at,
            fingerprint: m.fingerprint,
            ...(m.repository !== undefined ? { repository: m.repository } : {}),
            ...(ownApis.length > 0 ? { apis: ownApis.map(a => ({ ...a, key: apiKey(a) })) } : {}),
            ...(m.deps !== undefined && m.deps.length > 0 ? { deps: m.deps.map(d => ({ ...d, cross_tree: treeOf(d.to) !== treeOf(m.id) })) } : {}),
            aggregate: {
                descendant_count: countDesc(m.id),
                own_api_count: ownApis.length,
                inherited_api_count: apiBelow(m.id),
                dep_out: m.deps?.length ?? 0,
                dep_in: depIn.get(m.id) ?? 0,
            },
        };
    }
    const apiIndex = {};
    for (const f of files) {
        const m = f.module;
        for (const a of m.apis ?? [])
            apiIndex[apiKey(a)] = m.id;
    }
    const compiledAt = new Date().toISOString();
    const treeJson = {
        schema_version: 1,
        project: {
            name: slug,
            trees: roots.map(r => ({
                tree_id: r.module.id,
                root_uid: r.module.uid,
                ...(r.module.repository !== undefined ? { repository: r.module.repository } : {}),
            })),
            compiled_at: compiledAt,
            stats: {
                tree_count: roots.length,
                module_count: files.length,
                leaf_count: leafCount,
                api_count: apiCount,
                dep_count: depCount,
                cross_tree_dep_count: crossTreeDepCount,
                max_depth: maxDepth,
            },
        },
        modules,
        api_index: Object.fromEntries(Object.entries(apiIndex).sort(([a], [b]) => a.localeCompare(b))),
        edges,
    };
    try {
        const treeText = JSON.stringify(treeJson, null, 2) + '\n';
        const outline = outlineText(slug, v);
        const apiIndexText = JSON.stringify(Object.fromEntries(Object.entries(apiIndex).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n';
        await writeFile(join(projectDir, 'tree.json'), treeText, 'utf8');
        await writeFile(join(projectDir, 'outline.md'), outline, 'utf8');
        await writeFile(join(projectDir, 'api-index.json'), apiIndexText, 'utf8');
        const warningSummary = {};
        for (const w of v.warnings)
            warningSummary[w.code] = (warningSummary[w.code] ?? 0) + 1;
        const artifacts = {
            'tree.json': { sha256: sha256Text(treeText), bytes: Buffer.byteLength(treeText, 'utf8') },
            'outline.md': { sha256: sha256Text(outline), bytes: Buffer.byteLength(outline, 'utf8') },
            'api-index.json': { sha256: sha256Text(apiIndexText), bytes: Buffer.byteLength(apiIndexText, 'utf8') },
        };
        const receipt = {
            schema_version: 1,
            ok: true,
            project: slug,
            compiled_at: compiledAt,
            stats: treeJson.project && typeof treeJson.project === 'object'
                ? treeJson.project.stats
                : {},
            warnings: warningSummary,
            artifacts,
        };
        const receiptText0 = JSON.stringify(receipt, null, 2) + '\n';
        artifacts['receipt.json'] = { sha256: sha256Text(receiptText0), bytes: Buffer.byteLength(receiptText0, 'utf8') };
        const receiptText = JSON.stringify(receipt, null, 2) + '\n';
        await writeFile(join(projectDir, 'receipt.json'), receiptText, 'utf8');
        return { ok: true, receipt, errors: [], warnings: v.warnings, validate: v };
    }
    catch (error) {
        return {
            ok: false,
            receipt: null,
            errors: [diag('error', 'build/write-failed', '编译产物写入失败：' + String(error), {}, {}, [])],
            warnings: v.warnings,
            validate: v,
        };
    }
}
//# sourceMappingURL=compile.js.map