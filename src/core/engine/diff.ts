/**
 * 语义化结构 diff：比较两份 tree.json（不同 revision / 不同分支 / PR 前后），
 * 输出模块/API/依赖级增删改，供 CI 门禁与 PR 评审使用（P2-03）。
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { diag } from './diag.js';
import type { Diagnostic } from './types.js';

interface TreeModuleLike {
    id?: string;
    uid?: string;
    parent?: string | null;
    state?: string;
    name?: { zh?: string; en?: string };
    apis?: { key?: string; protocol?: string; path?: string; method?: string }[];
    deps?: { kind?: string; to?: string; from_api?: string; to_api?: string }[];
    fingerprint?: string;
}
interface TreeLike {
    project?: { name?: string; compiled_at?: string; stats?: Record<string, unknown>; revision?: string };
    modules?: Record<string, TreeModuleLike>;
    api_index?: Record<string, string>;
}

export interface ModuleChangeRow {
    id: string;
    fields: string[];
}
export interface StructureDiff {
    ok: boolean;
    from: string;
    to: string;
    changed: boolean;
    modules: { added: string[]; removed: string[]; changed: ModuleChangeRow[] };
    apis: { added: string[]; removed: string[] };
    deps: { added: string[]; removed: string[] };
    states: { from: Record<string, number>; to: Record<string, number> };
    stats: { from: unknown; to: unknown };
    breaking: boolean;
    summary: string;
    errors: Diagnostic[];
}

/** 读取 tree.json：接受项目目录或 tree.json 路径。 */
export async function loadTreeForDiff(pathOrDir: string): Promise<{ tree: TreeLike | null; source: string; errors: Diagnostic[] }> {
    const abs = resolve(pathOrDir);
    const candidates = [abs, join(abs, 'tree.json')];
    for (const candidate of candidates) {
        try {
            const text = await readFile(candidate, 'utf8');
            const tree = JSON.parse(text) as TreeLike;
            if (tree.modules === undefined)
                throw new Error('缺少 modules 字段');
            return { tree, source: candidate, errors: [] };
        }
        catch {
            /* 尝试下一个候选 */
        }
    }
    return {
        tree: null,
        source: abs,
        errors: [diag('error', 'diff/no-tree', '找不到可解析的 tree.json：' + abs, {}, {}, ['先运行 normify_build；或把 --from/--to 指向 tree.json 或项目目录'])],
    };
}

function apiKeysOf(m: TreeModuleLike): string[] {
    return (m.apis ?? []).map(a => a.key ?? (String(a.protocol ?? '') + ':' + String(a.path ?? ''))).sort();
}
function depKeysOf(m: TreeModuleLike): string[] {
    return (m.deps ?? []).map(d => [d.kind ?? '', d.to ?? '', d.from_api ?? '', d.to_api ?? ''].join('|')).sort();
}
function stateCounts(tree: TreeLike): Record<string, number> {
    const counts: Record<string, number> = { active: 0, planned: 0, deprecated: 0 };
    for (const m of Object.values(tree.modules ?? {})) {
        const state = m.state ?? 'active';
        counts[state] = (counts[state] ?? 0) + 1;
    }
    return counts;
}

/** 比较 two tree snapshots。 */
export function diffTrees(fromTree: TreeLike, toTree: TreeLike, fromLabel = 'from', toLabel = 'to'): StructureDiff {
    const fromModules = fromTree.modules ?? {};
    const toModules = toTree.modules ?? {};
    const fromIds = new Set(Object.keys(fromModules));
    const toIds = new Set(Object.keys(toModules));
    const added = [...toIds].filter(id => !fromIds.has(id)).sort();
    const removed = [...fromIds].filter(id => !toIds.has(id)).sort();
    const changed: ModuleChangeRow[] = [];
    for (const id of [...fromIds].filter(id => toIds.has(id)).sort()) {
        const a = fromModules[id]!;
        const b = toModules[id]!;
        const fields: string[] = [];
        if ((a.parent ?? null) !== (b.parent ?? null))
            fields.push('parent');
        if ((a.state ?? 'active') !== (b.state ?? 'active'))
            fields.push('state');
        if (JSON.stringify(a.name ?? {}) !== JSON.stringify(b.name ?? {}))
            fields.push('name');
        if (JSON.stringify(apiKeysOf(a)) !== JSON.stringify(apiKeysOf(b)))
            fields.push('apis');
        if (JSON.stringify(depKeysOf(a)) !== JSON.stringify(depKeysOf(b)))
            fields.push('deps');
        if (fields.length > 0)
            changed.push({ id, fields });
    }
    const apiFrom = new Map<string, string>();
    const apiTo = new Map<string, string>();
    for (const [id, m] of Object.entries(fromModules))
        for (const key of apiKeysOf(m))
            apiFrom.set(key, id);
    for (const [id, m] of Object.entries(toModules))
        for (const key of apiKeysOf(m))
            apiTo.set(key, id);
    const apisAdded = [...apiTo.keys()].filter(k => !apiFrom.has(k)).sort();
    const apisRemoved = [...apiFrom.keys()].filter(k => !apiTo.has(k)).sort();
    const depFrom = new Map<string, string>();
    const depTo = new Map<string, string>();
    for (const [id, m] of Object.entries(fromModules))
        for (const key of depKeysOf(m))
            depFrom.set(id + '::' + key, id);
    for (const [id, m] of Object.entries(toModules))
        for (const key of depKeysOf(m))
            depTo.set(id + '::' + key, id);
    const depsAdded = [...depTo.keys()].filter(k => !depFrom.has(k)).sort();
    const depsRemoved = [...depFrom.keys()].filter(k => !depTo.has(k)).sort();
    const statesFrom = stateCounts(fromTree);
    const statesTo = stateCounts(toTree);
    const changedAny = added.length > 0 || removed.length > 0 || changed.length > 0 || apisAdded.length > 0 || apisRemoved.length > 0 || depsAdded.length > 0 || depsRemoved.length > 0;
    // "破坏性"判定（CI 可据此阻断）：删除模块（且无 replacement 记录）/ 删除 API / 删除依赖。
    const breaking = removed.length > 0 || apisRemoved.length > 0 || depsRemoved.length > 0;
    const parts: string[] = [];
    if (added.length > 0) parts.push('+' + added.length + ' 模块');
    if (removed.length > 0) parts.push('-' + removed.length + ' 模块');
    if (changed.length > 0) parts.push('~' + changed.length + ' 模块');
    if (apisAdded.length > 0) parts.push('+' + apisAdded.length + ' API');
    if (apisRemoved.length > 0) parts.push('-' + apisRemoved.length + ' API');
    if (depsAdded.length > 0) parts.push('+' + depsAdded.length + ' 依赖');
    if (depsRemoved.length > 0) parts.push('-' + depsRemoved.length + ' 依赖');
    const summary = changedAny ? parts.join(' / ') : '结构无变化';
    return {
        ok: true,
        from: fromLabel,
        to: toLabel,
        changed: changedAny,
        modules: { added, removed, changed },
        apis: { added: apisAdded, removed: apisRemoved },
        deps: { added: depsAdded, removed: depsRemoved },
        states: { from: statesFrom, to: statesTo },
        stats: { from: fromTree.project?.stats ?? null, to: toTree.project?.stats ?? null },
        breaking,
        summary,
        errors: [],
    };
}
