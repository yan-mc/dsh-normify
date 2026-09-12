import { readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, dirname } from 'node:path';
import { DEP_KINDS, LAYOUT_MODES } from './types.js';
import type { Diagnostic, LayoutData, LayoutEdgeHint, LayoutGroup, LocalizedText, ModuleFile } from './types.js';
import { diag } from './diag.js';
import { isValidId, splitId } from './ids.js';
/**
 * 渲染数据集：与结构数据集并行的一份可读性数据，只存在于容器模块（有子级的模块）。
 * 文件路径 = renders/ + 模块 id 的点号换成斜杠 + .json，例如：
 *   demo          → renders/demo.json
 *   demo.order    → renders/demo/order.json
 *   demo.order.checkout → renders/demo/order/checkout.json
 * 叶子模块没有渲染图，因此没有渲染数据文件。
 */
const LAYOUT_KEYS = ['schema_version', 'id', 'updated_at', 'mode', 'max_columns', 'max_api_rows', 'reading', 'order', 'groups', 'edge_hints'];
const GROUP_KEYS = ['id', 'title', 'children'];
const HINT_KEYS = ['from', 'to', 'kind', 'lane', 'style', 'bundle', 'priority'];
type LayoutMode = (typeof LAYOUT_MODES)[number];
type DepKind = (typeof DEP_KINDS)[number];
export const LAYOUT_SCHEMA_VERSION = 1;
/** sibling 边集合的 key：避免 NUL 字面量在源码/JSON 转义中踩坑。 */
export function edgeKey(from: string, to: string): string {
    return from + String.fromCharCode(0) + to;
}
/** 模块 id → 渲染数据文件的项目相对路径（正斜杠）。 */
export function layoutRelPath(id: string): string {
    const segs = splitId(id);
    if (segs === null)
        throw new Error('normify: invalid module id: ' + JSON.stringify(id));
    return 'renders/' + segs.join('/') + '.json';
}
export function layoutFilePath(projectDir: string, id: string): string {
    const segs = splitId(id);
    if (segs === null)
        throw new Error('normify: invalid module id: ' + JSON.stringify(id));
    return join(projectDir, 'renders', ...segs) + '.json';
}
/** 渲染数据相对路径 → 模块 id（demo/order.json 或 renders/demo/order.json → demo.order）。 */
export function idFromLayoutPath(relPath: string): string | null {
    const rel = relPath.replace(/\\/g, '/');
    const relBody = rel.startsWith('renders/') ? rel.slice('renders/'.length) : rel;
    if (!relBody.endsWith('.json'))
        return null;
    const body = relBody.slice(0, -'.json'.length);
    if (body.length === 0)
        return null;
    const segs = body.split('/');
    for (const s of segs)
        if (s.length === 0)
            return null;
    const id = segs.join('.');
    return isValidId(id) ? id : null;
}
async function walkJson(dir: string, base: string, out: string[]): Promise<void> {
    let entries: Dirent[];
    try {
        entries = await readdir(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const e of entries) {
        const rel = base === '' ? e.name : base + '/' + e.name;
        if (e.isDirectory())
            await walkJson(join(dir, e.name), rel, out);
        else if (e.name.endsWith('.json'))
            out.push(rel);
    }
}
/** 列出全部渲染数据文件（renders/ 下相对路径，正斜杠）。 */
export async function listLayoutFiles(projectDir: string): Promise<string[]> {
    const out: string[] = [];
    await walkJson(join(projectDir, 'renders'), '', out);
    return out.sort();
}
/** 读取单个渲染数据文件；不存在返回 null。 */
export async function loadLayoutFile(projectDir: string, id: string): Promise<{
    layout: LayoutData | null;
    error: Diagnostic | null;
}> {
    const path = layoutFilePath(projectDir, id);
    let text: string;
    try {
        text = await readFile(path, 'utf8');
    }
    catch {
        return { layout: null, error: null };
    }
    try {
        return { layout: JSON.parse(text), error: null };
    }
    catch (error) {
        return {
            layout: null,
            error: diag('error', 'layout/json-parse', '渲染数据 JSON 解析失败：' + String(error instanceof Error ? error.message : error), { module: id }, { file: layoutRelPath(id) }, ['修复 JSON 语法或用 normify_layout_upsert 重写']),
        };
    }
}
function isPlain(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isL10n(v: unknown): v is LocalizedText {
    return isPlain(v) && typeof v.zh === 'string' && typeof v.en === 'string';
}
function isIsoish(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
}
/**
 * L1：渲染数据文件自身校验（形状 + 与直接子级集合的一致性）。
 * 需要 children（直接子模块 id 列表）与 siblingEdges（'from\0to' 集合）。
 */
export function l1ValidateLayout(data: unknown, id: string, children: string[], siblingEdges: Set<string>, where: string): {
    layout: LayoutData | null;
    errors: Diagnostic[];
    warnings: Diagnostic[];
} {
    const errors: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];
    if (!isPlain(data)) {
        errors.push(diag('error', 'layout/shape', '渲染数据必须为 JSON 对象', { module: id }, { path: where }, ['用 normify_layout_upsert 写入']));
        return { layout: null, errors, warnings };
    }
    for (const k of Object.keys(data)) {
        if (!LAYOUT_KEYS.includes(k)) {
            errors.push(diag('error', 'layout/unknown-field', '渲染数据不支持字段 ' + k, { module: id }, { path: where + '/' + k }, ['删除字段 ' + k]));
        }
    }
    if (data.schema_version !== LAYOUT_SCHEMA_VERSION) {
        errors.push(diag('error', 'layout/schema-version', 'schema_version 必须为 ' + LAYOUT_SCHEMA_VERSION, { module: id }, { value: data.schema_version }, ['改为 ' + LAYOUT_SCHEMA_VERSION]));
    }
    if (data.id !== id) {
        errors.push(diag('error', 'layout/id-mismatch', '渲染数据的 id 必须等于对应模块 id', { module: id }, { value: data.id }, ['改为 ' + id]));
    }
    if (typeof data.updated_at !== 'string' || !isIsoish(data.updated_at)) {
        errors.push(diag('error', 'layout/updated-at', 'updated_at 必须为 ISO 8601 时间', { module: id }, { value: data.updated_at }, ['如 2026-09-11T12:00:00Z']));
    }
    const childSet = new Set(children);
    let mode: LayoutMode | undefined;
    if (data.mode !== undefined) {
        if (typeof data.mode !== 'string' || !LAYOUT_MODES.includes(data.mode as LayoutMode)) {
            errors.push(diag('error', 'layout/mode', 'mode 必须为 ' + LAYOUT_MODES.join(' | '), { module: id }, { value: data.mode }, ['改为合法模式']));
        }
        else {
            mode = data.mode as LayoutMode;
        }
    }
    if (data.max_columns !== undefined) {
        if (!Number.isInteger(data.max_columns) || (data.max_columns as number) < 1 || (data.max_columns as number) > 6) {
            errors.push(diag('error', 'layout/max-columns', 'max_columns 必须为 1..6 的整数', { module: id }, { value: data.max_columns }, ['改为 1..6']));
        }
    }
    if (data.max_api_rows !== undefined) {
        if (!Number.isInteger(data.max_api_rows) || (data.max_api_rows as number) < 0 || (data.max_api_rows as number) > 48) {
            errors.push(diag('error', 'layout/max-api-rows', 'max_api_rows 必须为 0..48 的整数（0 = 全部展开）', { module: id }, { value: data.max_api_rows }, ['改为 0..48']));
        }
    }
    let reading: LocalizedText | undefined;
    if (data.reading !== undefined) {
        if (!isL10n(data.reading) || data.reading.zh.trim() === '' || data.reading.en.trim() === '') {
            errors.push(diag('error', 'layout/reading', 'reading 必须为 {zh, en} 非空双语', { module: id }, {}, ['补全双语阅读导语或删除该字段']));
        }
        else {
            reading = { zh: data.reading.zh, en: data.reading.en };
        }
    }
    let order: string[] | undefined;
    if (data.order !== undefined) {
        if (!Array.isArray(data.order)) {
            errors.push(diag('error', 'layout/order-shape', 'order 必须为子模块 id 数组', { module: id }, {}, []));
        }
        else {
            order = [];
            const seen = new Set<string>();
            for (const entry of data.order as unknown[]) {
                if (typeof entry !== 'string' || !childSet.has(entry)) {
                    errors.push(diag('error', 'layout/order-child', 'order 只能包含直接子模块 id', { module: id }, { value: entry, children }, ['改为直接子模块 id']));
                    continue;
                }
                if (seen.has(entry)) {
                    errors.push(diag('error', 'layout/order-duplicate', 'order 中重复的子模块 id', { module: id }, { value: entry }, ['删除重复项']));
                    continue;
                }
                seen.add(entry);
                order.push(entry);
            }
            const missing = children.filter(c => !seen.has(c));
            if (missing.length > 0) {
                warnings.push(diag('warning', 'layout/order-incomplete', 'order 未覆盖全部子模块（未列出的按启发式追加）', { module: id }, { missing }, ['在 order 中补全或依赖自动追加']));
            }
        }
    }
    let groups: LayoutGroup[] | undefined;
    if (data.groups !== undefined) {
        if (!Array.isArray(data.groups)) {
            errors.push(diag('error', 'layout/groups-shape', 'groups 必须为数组', { module: id }, {}, []));
        }
        else {
            groups = [];
            const groupIds = new Set<string>();
            const assigned = new Map<string, string>();
            for (const g of data.groups as unknown[]) {
                if (!isPlain(g)) {
                    errors.push(diag('error', 'layout/group-shape', 'group 必须为对象', { module: id }, {}, []));
                    continue;
                }
                for (const k of Object.keys(g)) {
                    if (!GROUP_KEYS.includes(k))
                        errors.push(diag('error', 'layout/group-unknown-field', 'group 不支持字段 ' + k, { module: id }, {}, []));
                }
                const gid = typeof g.id === 'string' && g.id.trim() !== '' ? g.id : null;
                if (gid === null) {
                    errors.push(diag('error', 'layout/group-id', 'group.id 必须为非空字符串', { module: id }, {}, []));
                    continue;
                }
                if (groupIds.has(gid)) {
                    errors.push(diag('error', 'layout/group-id-duplicate', 'group.id 重复', { module: id }, { value: gid }, []));
                    continue;
                }
                groupIds.add(gid);
                if (!isL10n(g.title) || g.title.zh.trim() === '' || g.title.en.trim() === '') {
                    errors.push(diag('error', 'layout/group-title', 'group.title 必须为 {zh, en} 非空双语', { module: id }, { group: gid }, []));
                    continue;
                }
                if (!Array.isArray(g.children) || g.children.length === 0) {
                    errors.push(diag('error', 'layout/group-children', 'group.children 必须为非空数组', { module: id }, { group: gid }, []));
                    continue;
                }
                const kids: string[] = [];
                for (const c of g.children as unknown[]) {
                    if (typeof c !== 'string' || !childSet.has(c)) {
                        errors.push(diag('error', 'layout/group-child', 'group.children 只能包含直接子模块 id', { module: id }, { group: gid, value: c, children }, []));
                        continue;
                    }
                    if (assigned.has(c)) {
                        errors.push(diag('error', 'layout/group-child-duplicate', '子模块被分到多个 group', { module: id }, { child: c, groups: [assigned.get(c), gid] }, []));
                        continue;
                    }
                    assigned.set(c, gid);
                    kids.push(c);
                }
                if (kids.length > 0)
                    groups.push({ id: gid, title: { zh: g.title.zh, en: g.title.en }, children: kids });
            }
            if (mode === 'groups' && groups.length === 0) {
                errors.push(diag('error', 'layout/groups-empty', 'mode=groups 时必须提供至少一个 group', { module: id }, {}, ['补 groups 或改用其它 mode']));
            }
        }
    }
    let edgeHints: LayoutEdgeHint[] | undefined;
    if (data.edge_hints !== undefined) {
        if (!Array.isArray(data.edge_hints)) {
            errors.push(diag('error', 'layout/hints-shape', 'edge_hints 必须为数组', { module: id }, {}, []));
        }
        else {
            edgeHints = [];
            let i = 0;
            for (const h of data.edge_hints as unknown[]) {
                const at = where + '/edge_hints/' + i;
                i++;
                if (!isPlain(h)) {
                    errors.push(diag('error', 'layout/hint-shape', 'edge_hint 必须为对象', { module: id }, { path: at }, []));
                    continue;
                }
                for (const k of Object.keys(h)) {
                    if (!HINT_KEYS.includes(k))
                        errors.push(diag('error', 'layout/hint-unknown-field', 'edge_hint 不支持字段 ' + k, { module: id }, { path: at }, []));
                }
                const from = h.from;
                const to = h.to;
                if (typeof from !== 'string' || !childSet.has(from) || typeof to !== 'string' || !childSet.has(to)) {
                    errors.push(diag('error', 'layout/hint-endpoint', 'edge_hint.from/to 必须是直接子模块 id', { module: id }, { from, to, children }, []));
                    continue;
                }
                if (from === to) {
                    errors.push(diag('error', 'layout/hint-self', 'edge_hint 不能指向自身', { module: id }, { from }, []));
                    continue;
                }
                if (!siblingEdges.has(edgeKey(from, to))) {
                    errors.push(diag('error', 'layout/hint-edge-missing', 'edge_hint 指向的兄弟依赖边不存在', { module: id }, { from, to }, ['删除该 hint 或先在源模块的 deps 中补边']));
                    continue;
                }
                const hint: LayoutEdgeHint = { from, to };
                if (h.kind !== undefined) {
                    if (typeof h.kind !== 'string' || !DEP_KINDS.includes(h.kind as DepKind)) {
                        errors.push(diag('error', 'layout/hint-kind', 'edge_hint.kind 必须为 ' + DEP_KINDS.join(' | '), { module: id }, { value: h.kind }, []));
                    }
                    else
                        hint.kind = h.kind;
                }
                if (h.lane !== undefined) {
                    if (!Number.isInteger(h.lane) || (h.lane as number) < 0 || (h.lane as number) > 9) {
                        errors.push(diag('error', 'layout/hint-lane', 'edge_hint.lane 必须为 0..9 整数', { module: id }, { value: h.lane }, []));
                    }
                    else
                        hint.lane = h.lane as number;
                }
                if (h.style !== undefined) {
                    if (h.style !== 'orthogonal' && h.style !== 'curve') {
                        errors.push(diag('error', 'layout/hint-style', "edge_hint.style 必须为 'orthogonal' | 'curve'", { module: id }, { value: h.style }, []));
                    }
                    else
                        hint.style = h.style;
                }
                if (h.bundle !== undefined) {
                    if (typeof h.bundle !== 'string' || h.bundle.trim() === '')
                        errors.push(diag('error', 'layout/hint-bundle', 'edge_hint.bundle 必须为非空字符串', { module: id }, { value: h.bundle }, []));
                    else
                        hint.bundle = h.bundle;
                }
                if (h.priority !== undefined) {
                    if (!Number.isInteger(h.priority))
                        errors.push(diag('error', 'layout/hint-priority', 'edge_hint.priority 必须为整数', { module: id }, { value: h.priority }, []));
                    else
                        hint.priority = h.priority as number;
                }
                edgeHints.push(hint);
            }
        }
    }
    if (errors.length > 0)
        return { layout: null, errors, warnings };
    const layout: LayoutData = {
        schema_version: LAYOUT_SCHEMA_VERSION,
        id,
        updated_at: String(data.updated_at),
        ...(mode !== undefined ? { mode } : {}),
        ...(data.max_columns !== undefined ? { max_columns: data.max_columns as number } : {}),
        ...(data.max_api_rows !== undefined ? { max_api_rows: data.max_api_rows as number } : {}),
        ...(reading !== undefined ? { reading } : {}),
        ...(order !== undefined ? { order } : {}),
        ...(groups !== undefined ? { groups } : {}),
        ...(edgeHints !== undefined ? { edge_hints: edgeHints } : {}),
    };
    return { layout, errors, warnings };
}
/** 稳定序列化（字段顺序固定，便于 diff）。 */
export function serializeLayout(layout: LayoutData): string {
    const out: LayoutData = {
        schema_version: layout.schema_version,
        id: layout.id,
        updated_at: layout.updated_at,
    };
    if (layout.mode !== undefined)
        out.mode = layout.mode;
    if (layout.max_columns !== undefined)
        out.max_columns = layout.max_columns;
    if (layout.max_api_rows !== undefined)
        out.max_api_rows = layout.max_api_rows;
    if (layout.reading !== undefined)
        out.reading = layout.reading;
    if (layout.order !== undefined)
        out.order = layout.order;
    if (layout.groups !== undefined)
        out.groups = layout.groups;
    if (layout.edge_hints !== undefined)
        out.edge_hints = layout.edge_hints;
    return JSON.stringify(out, null, 2) + '\n';
}
export async function writeLayoutFile(projectDir: string, layout: LayoutData): Promise<string> {
    const path = layoutFilePath(projectDir, layout.id);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, serializeLayout(layout), 'utf8');
    return layoutRelPath(layout.id);
}
export async function deleteLayoutFile(projectDir: string, id: string): Promise<boolean> {
    const path = layoutFilePath(projectDir, id);
    try {
        await rm(path, { force: true });
        return true;
    }
    catch {
        return false;
    }
}
/** L2：全项目渲染数据校验 + 与结构数据集的交叉校验。 */
export async function validateLayouts(projectDir: string, byId: Map<string, ModuleFile>, childrenOf: Map<string, string[]>, siblingEdges: Map<string, Set<string>>): Promise<{
    layouts: Map<string, LayoutData>;
    errors: Diagnostic[];
    warnings: Diagnostic[];
}> {
    const errors: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];
    const layouts = new Map<string, LayoutData>();
    const rels = await listLayoutFiles(projectDir);
    const seen = new Set<string>();
    for (const rel of rels) {
        const id = idFromLayoutPath(rel);
        if (id === null) {
            errors.push(diag('error', 'layout/file-name', '渲染数据文件名不符合 renders/<id>.json 约定', { path: rel }, {}, ['重命名为 renders/<模块 id 路径>.json']));
            continue;
        }
        if (seen.has(id)) {
            errors.push(diag('error', 'layout/id-duplicate', '同一模块出现多份渲染数据', { module: id }, { path: rel }, []));
            continue;
        }
        seen.add(id);
        const f = byId.get(id);
        if (f === undefined) {
            errors.push(diag('error', 'layout/orphan', '渲染数据没有对应的模块', { module: id }, { path: rel }, ['删除该文件或用 normify_module_upsert 创建模块']));
            continue;
        }
        const children = childrenOf.get(id) ?? [];
        if (children.length === 0) {
            errors.push(diag('error', 'layout/not-container', '叶子模块不需要渲染数据（没有可渲染的子层）', { module: id }, { path: rel }, ['删除该渲染数据文件']));
            continue;
        }
        const { layout, error } = await loadLayoutFile(projectDir, id);
        if (error !== null) {
            errors.push(error);
            continue;
        }
        if (layout === null)
            continue;
        const r = l1ValidateLayout(layout, id, children, siblingEdges.get(id) ?? new Set<string>(), 'renders/' + rel);
        errors.push(...r.errors);
        warnings.push(...r.warnings);
        if (r.layout !== null)
            layouts.set(id, r.layout);
    }
    const missing: string[] = [];
    for (const [id, kids] of childrenOf) {
        if (kids.length >= 2 && !layouts.has(id) && byId.has(id))
            missing.push(id);
    }
    for (const id of missing.slice(0, 15)) {
        warnings.push(diag('warning', 'layout/missing', '容器模块缺少渲染数据（图谱将回退自动布局）', { module: id }, { children: childrenOf.get(id) }, ['用 normify_layout_upsert 写该层渲染数据（order / groups / mode）']));
    }
    if (missing.length > 15) {
        warnings.push(diag('warning', 'layout/missing-many', '还有更多容器缺少渲染数据', {}, { remaining: missing.length - 15, total: missing.length }, []));
    }
    return { layouts, errors, warnings };
}
