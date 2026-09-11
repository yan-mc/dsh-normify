import { readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { DEP_KINDS } from './types.js';
import { diag } from './diag.js';
import { deriveParent, isValidId, moduleFilePath, splitId, MAX_DEPTH } from './ids.js';
import { loadAllModules, writeModuleFile, fingerprintOf, gitHead } from './store.js';
import { evaluatePolicy, loadPolicyFile } from './policy.js';
import { l1Validate } from './frontmatter.js';
import { deleteLayoutFile, layoutRelPath } from './layout.js';
import type { Diagnostic, Module, ModuleState, ModuleFile } from './types.js';
import type { Dirent } from 'node:fs';
/**
 * 修改强化：patch / batch（原子）/ move（级联）/ refresh（激活）。
 * 所有写操作支持 dry_run；失败时整批回滚（快照 modules/ + renders/）。
 */
export interface EditOptions {
    dryRun?: boolean;
}
export interface EditResult {
    ok: boolean;
    dryRun: boolean;
    errors: Diagnostic[];
    warnings: Diagnostic[];
    changed: string[];
    detail: Record<string, unknown>;
}
/** DEP_KINDS 的字面量联合（types.ts 未导出同名别名）。 */
type DepKind = (typeof DEP_KINDS)[number];
/** 内部：一次模块移动（旧 id → 新 id）。 */
interface ModuleMove {
    from: string;
    to: string;
}
/** 内部：一处依赖目标改写记录。 */
interface DepRewire {
    module: string;
    from: string;
    to: string;
}
/** 内部：一次刷新结果（写盘后汇总）。 */
interface RefreshEntry {
    id: string;
    fingerprint: string;
    state: ModuleState;
    file: string;
}
/** 内部：缺失证据文件清单。 */
interface MissingEntry {
    id: string;
    paths: string[];
}
/** 内部：moveModuleTree 的单条写盘计划。 */
interface WritePlanEntry {
    from: string | null;
    to: string;
    module: Module;
    moved: boolean;
    body: string;
}
/** 内部：渲染数据文件迁移计划。 */
interface LayoutPlanEntry {
    from: string;
    to: string;
    id: string;
}
async function loadProject(projectDir: string): Promise<{ files: ModuleFile[]; byId: Map<string, ModuleFile>; errors: Diagnostic[]; warnings: Diagnostic[] }> {
    const loaded = await loadAllModules(projectDir);
    return { files: loaded.files, byId: new Map(loaded.files.map(f => [f.module.id, f])), errors: loaded.errors, warnings: loaded.warnings };
}
function containerStatus(module: Module, all: Module[]): boolean {
    if (module.parent === null)
        return true;
    return all.some(m => m.parent === module.id);
}
function targetPath(projectDir: string, module: Module, all: Module[]): string {
    return moduleFilePath(projectDir, module.id, containerStatus(module, all));
}
async function walkRel(base: string, rel: string, out: string[]): Promise<void> {
    let entries: Dirent[];
    try {
        entries = await readdir(join(base, rel), { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const e of entries) {
        const child = rel === '' ? e.name : rel + '/' + e.name;
        if (e.isDirectory())
            await walkRel(base, child, out);
        else
            out.push(child);
    }
}
/** 内部：modules/ 与 renders/ 的全量快照。 */
interface ProjectSnapshot {
    files: Map<string, Buffer>;
}
/** 快照 modules/ 与 renders/（用于失败回滚；数据集很小，直接全量）。 */
async function snapshotProject(projectDir: string): Promise<ProjectSnapshot> {
    const files = new Map<string, Buffer>();
    for (const dir of ['modules', 'renders']) {
        const rels: string[] = [];
        await walkRel(join(projectDir, dir), '', rels);
        for (const rel of rels) {
            try {
                files.set(dir + '/' + rel, await readFile(join(projectDir, dir, rel)));
            }
            catch {
                /* 忽略读取失败 */
            }
        }
    }
    return { files };
}
async function restoreProject(projectDir: string, snap: ProjectSnapshot): Promise<void> {
    for (const dir of ['modules', 'renders']) {
        const rels: string[] = [];
        await walkRel(join(projectDir, dir), '', rels);
        for (const rel of rels) {
            const key = dir + '/' + rel;
            if (!snap.files.has(key))
                await rm(join(projectDir, dir, rel), { force: true });
        }
    }
    for (const [key, buf] of snap.files) {
        const path = join(projectDir, key);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, buf);
    }
}
async function pruneEmpty(base: string, dirs: Set<string>): Promise<void> {
    const sorted = [...dirs].sort((a, b) => b.length - a.length);
    for (const d of sorted) {
        try {
            const entries = await readdir(d);
            if (entries.length === 0)
                await rm(d, { force: true });
        }
        catch {
            /* 非空或不存在 */
        }
    }
}
function cloneModule(m: Module): Module {
    return JSON.parse(JSON.stringify(m));
}
/** 预览模块将写入的文件路径（不落盘）。 */
export function previewModuleFile(projectDir: string, module: Module, all: Module[]): string {
    return relative(projectDir, targetPath(projectDir, module, all)).replace(/\\/g, '/');
}
/** 合并 patch 到模块（字段级替换；id/uid 不可变，parent 必须由 move 改）。 */
function applyPatch(existing: Module, patch: Record<string, unknown>): { module: Module | null; errors: Diagnostic[] } {
    const errors: Diagnostic[] = [];
    for (const key of Object.keys(patch)) {
        if (key === 'id' || key === 'uid') {
            errors.push(diag('error', 'module/immutable-field', key + ' 不可通过 patch 修改', { module: existing.id }, { field: key }, ['用 normify_module_move 处理重命名/移动']));
        }
        if (key === 'parent' && patch.parent !== existing.parent) {
            errors.push(diag('error', 'module/parent-patch', 'parent 不可通过 patch 修改', { module: existing.id }, { parent: patch.parent, expected: existing.parent }, ['用 normify_module_move({ id, new_parent })']));
        }
    }
    if (errors.length > 0)
        return { module: null, errors };
    const merged = cloneModule(existing);
    const data: Record<string, unknown> = { ...merged };
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined)
            continue;
        data[key] = value;
    }
    data.updated_at = typeof patch.updated_at === 'string' ? patch.updated_at : new Date().toISOString();
    const r = l1Validate(data, 'patch:' + existing.id);
    if (r.module === null)
        return { module: null, errors: r.errors };
    return { module: r.module, errors: [] };
}
export interface PatchResult extends EditResult {
    module?: Module;
    file?: string;
}
export async function patchModule(projectDir: string, id: string, patch: Record<string, unknown>, opts: EditOptions & { body?: string } = {}): Promise<PatchResult> {
    const { files, byId, errors, warnings } = await loadProject(projectDir);
    const errorsOut = [...errors];
    if (!byId.has(id)) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/not-found', '模块不存在：' + id, { module: id }, {}, [])], warnings, changed: [], detail: {} };
    }
    const existing = byId.get(id)!.module;
    if (typeof patch.expect_updated_at === 'string' && patch.expect_updated_at !== existing.updated_at) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/conflict', '模块已被其他写入修改（updated_at 不一致），请先重新读取', { module: id }, { expected: patch.expect_updated_at, actual: existing.updated_at }, ['先 normify_module_get 复核再重写'])], warnings, changed: [], detail: {} };
    }
    const cleanPatch = { ...patch };
    delete cleanPatch.expect_updated_at;
    const bodyOverride = typeof cleanPatch.body === 'string' ? cleanPatch.body : undefined;
    delete cleanPatch.body;
    const merged = applyPatch(existing, cleanPatch);
    errorsOut.push(...merged.errors);
    if (merged.module === null)
        return { ok: false, dryRun: opts.dryRun === true, errors: errorsOut, warnings, changed: [], detail: {} };
    const all = files.map(f => f.module);
    const path = targetPath(projectDir, merged.module, all);
    const rel = relative(projectDir, path).replace(/\\/g, '/');
    if (opts.dryRun === true) {
        return { ok: errorsOut.length === 0, dryRun: true, errors: errorsOut, warnings, changed: [], detail: { file: rel, module: merged.module } };
    }
    await writeModuleFile(projectDir, merged.module, bodyOverride ?? byId.get(id)!.body ?? '');
    return { ok: errorsOut.length === 0, dryRun: false, errors: errorsOut, warnings, changed: [rel], detail: { file: rel }, module: merged.module, file: rel };
}
export interface BatchItem {
    frontmatter?: Record<string, unknown>;
    patch?: {
        id: string;
        patch: Record<string, unknown>;
    };
}
export interface BatchResult extends EditResult {
    files: string[];
}
/** 批量 upsert/patch：全部 L1 + 结构预检通过才落盘（原子，失败回滚）。 */
export async function batchWrite(projectDir: string, items: BatchItem[], mode: 'upsert' | 'patch', opts: EditOptions = {}): Promise<BatchResult> {
    const { files, byId, errors: loadErrors, warnings } = await loadProject(projectDir);
    const errorsOut = [...loadErrors];
    const working = new Map<string, Module>();
    for (const f of files)
        working.set(f.module.id, cloneModule(f.module));
    const bodies = new Map<string, string>();
    for (const f of files)
        bodies.set(f.module.id, f.body ?? '');
    const batchIds = new Set<string>();
    for (const item of items) {
        if (mode === 'upsert') {
            const fm = { ...(item.frontmatter ?? {}) };
            if (fm.parent === 'null' || fm.parent === null)
                fm.parent = null;
            if (typeof fm.updated_at !== 'string')
                fm.updated_at = new Date().toISOString();
            const r = l1Validate(fm, 'batch:' + String(fm.id ?? '?'));
            errorsOut.push(...r.errors);
            if (r.module !== null) {
                if (batchIds.has(r.module.id))
                    errorsOut.push(diag('error', 'module/batch-duplicate', '同一批次中模块 id 重复', { module: r.module.id }, {}, []));
                batchIds.add(r.module.id);
                working.set(r.module.id, r.module);
                bodies.set(r.module.id, typeof fm.body === 'string' ? fm.body : (bodies.get(r.module.id) ?? ''));
            }
        }
        else {
            const id = String(item.patch?.id ?? '');
            if (!working.has(id)) {
                errorsOut.push(diag('error', 'module/not-found', 'patch 目标模块不存在：' + id, { module: id }, {}, []));
                continue;
            }
            const r = applyPatch(working.get(id)!, { ...(item.patch?.patch ?? {}) });
            errorsOut.push(...r.errors);
            if (r.module !== null) {
                if (batchIds.has(r.module.id))
                    errorsOut.push(diag('error', 'module/batch-duplicate', '同一批次中模块 id 重复', { module: r.module.id }, {}, []));
                batchIds.add(r.module.id);
                working.set(r.module.id, r.module);
            }
        }
    }
    const all = [...working.values()];
    const idSet = new Set(all.map(m => m.id));
    for (const m of all) {
        if (m.parent !== null && !idSet.has(m.parent))
            errorsOut.push(diag('error', 'structure/parent-not-exist', 'parent 不存在（批次内也找不到）', { module: m.id }, { parent: m.parent }, ['先写父模块或修正 parent']));
        if (m.parent !== deriveParent(m.id))
            errorsOut.push(diag('error', 'structure/parent-mismatch', 'parent 必须等于 id 去掉最后一段', { module: m.id }, { parent: m.parent, derived: deriveParent(m.id) }, []));
        const segs = splitId(m.id);
        if (segs === null)
            errorsOut.push(diag('error', 'structure/id-format', 'id 非法', { module: m.id }, {}, []));
        for (const d of m.deps ?? []) {
            if (d.to === m.id)
                errorsOut.push(diag('error', 'dep/self-loop', '箭头不能指向自身', { module: m.id }, {}, []));
            else if (!idSet.has(d.to))
                errorsOut.push(diag('error', 'dep/target-missing', '箭头目标不存在（批次内也找不到）', { module: m.id }, { to: d.to }, ['同批写入目标模块或修正 to']));
        }
    }
    if (errorsOut.length > 0)
        return { ok: false, dryRun: opts.dryRun === true, errors: errorsOut, warnings, changed: [], files: [], detail: { validated: items.length } };
    const targets = all.filter(m => batchIds.has(m.id)).map(m => ({ module: m, path: targetPath(projectDir, m, all) }));
    if (opts.dryRun === true) {
        return { ok: true, dryRun: true, errors: [], warnings, changed: [], files: targets.map(t => relative(projectDir, t.path).replace(/\\/g, '/')), detail: { validated: targets.length } };
    }
    const snap = await snapshotProject(projectDir);
    try {
        // 父模块优先写入，保证晋升顺序稳定
        targets.sort((a, b) => a.module.id.length - b.module.id.length);
        for (const t of targets)
            await writeModuleFile(projectDir, t.module, bodies.get(t.module.id) ?? '');
    }
    catch (error) {
        await restoreProject(projectDir, snap);
        return { ok: false, dryRun: false, errors: [diag('error', 'module/batch-write-failed', '批量写入失败，已回滚：' + String(error instanceof Error ? error.message : error), {}, {}, [])], warnings, changed: [], files: [], detail: {} };
    }
    return { ok: true, dryRun: false, errors: [], warnings, changed: targets.map(t => relative(projectDir, t.path).replace(/\\/g, '/')), files: targets.map(t => relative(projectDir, t.path).replace(/\\/g, '/')), detail: { written: targets.length } };
}
export interface MoveOptions extends EditOptions {
    newId?: string;
    newParent?: string;
}
/** 重命名/移动子树：保 uid、级联 parent、重写 deps.to、迁移模块与渲染数据文件。 */
export async function moveModuleTree(projectDir: string, id: string, opts: MoveOptions): Promise<EditResult & {
    moves: {
        from: string;
        to: string;
    }[];
    rewired: {
        module: string;
        from: string;
        to: string;
    }[];
}> {
    const { files, byId, errors: loadErrors, warnings } = await loadProject(projectDir);
    const errorsOut = [...loadErrors];
    const empty: { moves: ModuleMove[]; rewired: DepRewire[] } = { moves: [], rewired: [] };
    if (!byId.has(id)) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/not-found', '模块不存在：' + id, { module: id }, {}, [])], warnings, changed: [], detail: {}, ...empty };
    }
    let newId = opts.newId?.trim();
    if (newId === '')
        newId = undefined;
    const newParent = opts.newParent?.trim() === '' ? undefined : opts.newParent?.trim();
    const lastSeg = splitId(id)!.slice(-1)[0];
    if (newId === undefined && newParent !== undefined)
        newId = newParent + '.' + lastSeg;
    if (newId === undefined) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/move-noop', '必须提供 new_id 或 new_parent', { module: id }, {}, [])], warnings, changed: [], detail: {}, ...empty };
    }
    if (newId === id && newParent === undefined) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/move-noop', '新 id 与旧 id 相同', { module: id }, {}, [])], warnings, changed: [], detail: {}, ...empty };
    }
    if (!isValidId(newId) || splitId(newId)!.length > MAX_DEPTH) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'structure/id-format', 'new_id 非法或超过深度上限', { module: id }, { new_id: newId }, [])], warnings, changed: [], detail: {}, ...empty };
    }
    const derivedParent = deriveParent(newId);
    if (newParent !== undefined && newParent !== derivedParent) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/move-parent-mismatch', 'new_parent 必须等于 new_id 去掉最后一段', { module: id }, { new_id: newId, new_parent: newParent, derived: derivedParent }, [])], warnings, changed: [], detail: {}, ...empty };
    }
    if (newParent !== undefined && !byId.has(newParent)) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'structure/parent-not-exist', '目标父模块不存在', { module: id }, { new_parent: newParent }, [])], warnings, changed: [], detail: {}, ...empty };
    }
    const subtree = files.filter(f => f.module.id === id || f.module.id.startsWith(id + '.')).map(f => f.module);
    const subtreeIds = new Set(subtree.map(m => m.id));
    if (newParent !== undefined && subtreeIds.has(newParent)) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/move-cycle', '目标父模块在被移动的子树内', { module: id }, { new_parent: newParent }, [])], warnings, changed: [], detail: {}, ...empty };
    }
    const mapping = new Map<string, string>();
    for (const m of subtree)
        mapping.set(m.id, newId + m.id.slice(id.length));
    const outsideIds = new Set(files.filter(f => !subtreeIds.has(f.module.id)).map(f => f.module.id));
    for (const [, to] of mapping) {
        if (outsideIds.has(to)) {
            return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/id-conflict', '移动后 id 与现有模块冲突', { module: id }, { conflict: to }, [])], warnings, changed: [], detail: {}, ...empty };
        }
        if (splitId(to)!.length > MAX_DEPTH) {
            return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'structure/depth-exceeded', '移动后超过深度上限', { module: id }, { id: to, max: MAX_DEPTH }, [])], warnings, changed: [], detail: {}, ...empty };
        }
    }
    // 生成新模块集（id/parent 级联 + deps.to 重写）
    const moved = new Map<string, Module>();
    const rewired: DepRewire[] = [];
    for (const f of files) {
        const m = cloneModule(f.module);
        if (mapping.has(m.id)) {
            m.id = mapping.get(m.id)!;
            m.parent = deriveParent(m.id);
        }
        if (m.deps !== undefined) {
            for (const d of m.deps) {
                const target = mapping.get(d.to);
                if (target !== undefined) {
                    rewired.push({ module: m.id, from: d.to, to: target });
                    d.to = target;
                }
            }
        }
        moved.set(m.id, m);
    }
    const all = [...moved.values()];
    const bodyOf = new Map<string, string>(files.map(f => [f.module.id, f.body ?? '']));
    const moves: ModuleMove[] = [];
    for (const [from, to] of mapping)
        moves.push({ from, to });
    // 需要重写的模块：被移动的子树 + 依赖被重写的源模块 + 新旧父级（文件形态可能变化）
    const dirty = new Set<string>();
    for (const [, to] of mapping)
        dirty.add(to);
    for (const r of rewired)
        dirty.add(r.module);
    const oldParentId = deriveParent(id);
    const newParentId = deriveParent(newId);
    if (oldParentId !== null)
        dirty.add(oldParentId);
    if (newParentId !== null)
        dirty.add(newParentId);
    const writePlan: WritePlanEntry[] = [];
    for (const did of [...dirty].sort((a, b) => a.length - b.length)) {
        const m = moved.get(did);
        if (m === undefined)
            continue;
        const to = relative(projectDir, targetPath(projectDir, m, all)).replace(/\\/g, '/');
        const oldEntry = [...mapping.entries()].find(([, toId]) => toId === did);
        const oldId = oldEntry !== undefined ? oldEntry[0] : did;
        const oldSrc = byId.get(oldId);
        const from = oldSrc !== undefined ? 'modules/' + oldSrc.file : null;
        writePlan.push({ from, to, module: m, moved: oldEntry !== undefined, body: bodyOf.get(oldId) ?? '' });
    }
    // 渲染数据：随子树迁移；降级为叶子的模块删除渲染数据
    const layoutPlan: LayoutPlanEntry[] = [];
    const layoutDeletes: string[] = [];
    for (const [from, to] of mapping) {
        const oldLayout = layoutRelPath(from);
        if (existsSync(join(projectDir, oldLayout)))
            layoutPlan.push({ from: oldLayout, to: layoutRelPath(to), id: to });
    }
    for (const p of writePlan) {
        const hasChildren = all.some(x => x.parent === p.module.id) || p.module.parent === null;
        if (!hasChildren && existsSync(join(projectDir, layoutRelPath(p.module.id))))
            layoutDeletes.push(p.module.id);
    }
    const writeTos = writePlan.filter(p => p.from === null || p.from !== p.to).map(p => p.to);
    const changed = [...writeTos, ...layoutPlan.map(p => p.to), ...layoutDeletes.map(id => layoutRelPath(id))];
    if (opts.dryRun === true) {
        return {
            ok: true,
            dryRun: true,
            errors: [],
            warnings,
            changed,
            detail: { moves, rewired, layouts: layoutPlan, layout_deletes: layoutDeletes, writes: writePlan.map(p => ({ id: p.module.id, from: p.from, to: p.to })) },
            moves,
            rewired,
        };
    }
    const snap = await snapshotProject(projectDir);
    try {
        // 1) 删除被移动子树的旧文件（新位置由 writeModuleFile 写入）
        for (const p of writePlan)
            if (p.moved && p.from !== null)
                await rm(join(projectDir, p.from), { force: true });
        // 2) 渲染数据随迁
        for (const l of layoutPlan) {
            const buf = await readFile(join(projectDir, l.from), 'utf8');
            await mkdir(dirname(join(projectDir, l.to)), { recursive: true });
            await writeFile(join(projectDir, l.to), buf, 'utf8');
            await rm(join(projectDir, l.from), { force: true });
        }
        // 3) 降级为叶子的模块删除渲染数据
        for (const delId of layoutDeletes)
            await deleteLayoutFile(projectDir, delId);
        // 4) 写入全部脏模块（父 → 子，保证父子形态稳定）
        for (const p of writePlan)
            await writeModuleFile(projectDir, p.module, p.body);
        // 5) 清理空目录
        const emptyDirs = new Set<string>();
        for (const p of writePlan)
            if (p.from !== null && p.from !== p.to) {
                let cur = dirname(join(projectDir, p.from));
                while (cur.length > join(projectDir, 'modules').length) {
                    emptyDirs.add(cur);
                    cur = dirname(cur);
                }
            }
        for (const l of layoutPlan) {
            let cur = dirname(join(projectDir, l.from));
            while (cur.length > join(projectDir, 'renders').length) {
                emptyDirs.add(cur);
                cur = dirname(cur);
            }
        }
        await pruneEmpty(join(projectDir, 'modules'), emptyDirs);
        await pruneEmpty(join(projectDir, 'renders'), emptyDirs);
    }
    catch (error) {
        await restoreProject(projectDir, snap);
        return { ok: false, dryRun: false, errors: [diag('error', 'module/move-failed', '移动失败，已回滚：' + String(error instanceof Error ? error.message : error), {}, {}, [])], warnings, changed: [], detail: {}, moves: [], rewired: [] };
    }
    return { ok: true, dryRun: false, errors: [], warnings, changed, detail: { moves, rewired, layouts: layoutPlan, layout_deletes: layoutDeletes }, moves, rewired };
}
export interface RefreshOptions extends EditOptions {
    ids?: string[];
    all?: boolean;
    repoRoot: string;
    activate?: boolean;
}
/** 重算 fingerprint/revision/updated_at；planned 模块落地后可用 activate 一键转 active。 */
export async function refreshModules(projectDir: string, opts: RefreshOptions): Promise<EditResult & {
    refreshed: {
        id: string;
        fingerprint: string;
        state: ModuleState;
        file: string;
    }[];
    missing: {
        id: string;
        paths: string[];
    }[];
}> {
    const { files, byId, errors: loadErrors, warnings } = await loadProject(projectDir);
    const errorsOut = [...loadErrors];
    const refreshed: RefreshEntry[] = [];
    const missing: MissingEntry[] = [];
    const targets = opts.all === true ? files.map(f => f.module.id) : (opts.ids ?? []);
    if (targets.length === 0) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'refresh/no-target', '必须提供 ids 或 all:true', {}, {}, [])], warnings, changed: [], detail: {}, refreshed, missing };
    }
    const head = gitHead(opts.repoRoot);
    if (head.sha === null) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'refresh/git-failed', head.error ?? '无法获取 git HEAD', { repoRoot: opts.repoRoot }, {}, [])], warnings, changed: [], detail: {}, refreshed, missing };
    }
    const activate = opts.activate === true;
    const planned: { id: string; module: Module }[] = [];
    for (const id of targets) {
        const f = byId.get(id);
        if (f === undefined) {
            errorsOut.push(diag('error', 'module/not-found', '模块不存在：' + id, { module: id }, {}, []));
            continue;
        }
        const m = cloneModule(f.module);
        const hasChildren = files.some(x => x.module.parent === id) || m.parent === null;
        if (m.source.length === 0) {
            if (activate && m.state === 'planned' && hasChildren) {
                // 容器/根模块本身就是结构节点：子树落地即可激活（fingerprint 保持 pending，不做证据校验）
                m.state = 'active';
                m.updated_at = new Date().toISOString();
                planned.push({ id, module: m });
            }
            else if (activate && m.state === 'planned') {
                errorsOut.push(diag('error', 'refresh/activate-no-source', '计划态叶子没有 source，无法激活：' + id, { module: id }, {}, ['先补 source 指向落地文件']));
            }
            else {
                missing.push({ id, paths: [] });
            }
            continue;
        }
        const fp = await fingerprintOf(opts.repoRoot, m.source);
        if (fp.hash === null) {
            if (activate) {
                errorsOut.push(diag('error', 'refresh/activate-not-landed', '请求激活但 source 尚未落地：' + id, { module: id }, { missing: fp.missing }, ['先实现 source 指向的文件，或去掉 activate']));
            }
            else if (m.state === 'planned') {
                warnings.push(diag('warning', 'refresh/planned-not-landed', '计划态模块的 source 尚未落地，跳过：' + id, { module: id }, { missing: fp.missing }, []));
                missing.push({ id, paths: fp.missing as string[] });
            }
            else {
                errorsOut.push(diag('error', 'evidence/source-missing', 'source 指向的文件不存在，无法刷新：' + id, { module: id }, { missing: fp.missing }, []));
            }
            continue;
        }
        m.fingerprint = fp.hash;
        m.revision = head.sha;
        m.updated_at = new Date().toISOString();
        if (activate)
            m.state = 'active';
        planned.push({ id, module: m });
    }
    if (errorsOut.length > 0)
        return { ok: false, dryRun: opts.dryRun === true, errors: errorsOut, warnings, changed: [], detail: {}, refreshed, missing };
    const all = files.map(f => f.module);
    for (const p of planned) {
        const path = targetPath(projectDir, p.module, all);
        const rel = relative(projectDir, path).replace(/\\/g, '/');
        refreshed.push({ id: p.id, fingerprint: p.module.fingerprint, state: p.module.state ?? 'active', file: rel });
    }
    if (opts.dryRun === true) {
        return { ok: true, dryRun: true, errors: [], warnings, changed: [], detail: {}, refreshed, missing };
    }
    const snap = await snapshotProject(projectDir);
    try {
        for (const p of planned)
            await writeModuleFile(projectDir, p.module, byId.get(p.id)!.body ?? '');
    }
    catch (error) {
        await restoreProject(projectDir, snap);
        return { ok: false, dryRun: false, errors: [diag('error', 'refresh/write-failed', '刷新写入失败，已回滚：' + String(error instanceof Error ? error.message : error), {}, {}, [])], warnings, changed: [], detail: {}, refreshed: [], missing };
    }
    return { ok: true, dryRun: false, errors: [], warnings, changed: refreshed.map(r => r.file), detail: { refreshed: refreshed.length, activated: planned.filter(p => p.module.state === 'active').length }, refreshed, missing };
}
export interface Proposal {
    deps?: {
        from: string;
        to: string;
        kind?: string;
        to_api?: string;
    }[];
    modules?: {
        id: string;
        parent?: string | null;
        state?: ModuleState;
    }[];
}
/** 编码/设计前预检：拟新增的模块与依赖是否违反核心约束与 policy。 */
export async function checkProposal(projectDir: string, proposal: Proposal): Promise<{ ok: boolean; errors: Diagnostic[]; warnings: Diagnostic[] }> {
    const { files, byId, errors: loadErrors, warnings } = await loadProject(projectDir);
    const errors: Diagnostic[] = [...loadErrors];
    const simulated = new Map<string, Module>();
    for (const f of files)
        simulated.set(f.module.id, cloneModule(f.module));
    for (const item of proposal.modules ?? []) {
        if (typeof item.id !== 'string' || !isValidId(item.id)) {
            errors.push(diag('error', 'proposal/id-format', '拟建模块 id 非法', { module: item.id }, {}, []));
            continue;
        }
        const parent = item.parent === undefined ? deriveParent(item.id) : item.parent;
        const existing = simulated.get(item.id);
        if (existing !== undefined) {
            if (item.state !== undefined)
                existing.state = item.state;
            if (parent !== undefined && parent !== existing.parent)
                errors.push(diag('error', 'proposal/parent-patch', '拟建/变更的 parent 与现有模块不一致（应使用 move）', { module: item.id }, { parent, actual: existing.parent }, []));
            continue;
        }
        if (parent !== null && !simulated.has(parent))
            errors.push(diag('error', 'proposal/parent-not-exist', '拟建模块的 parent 不存在', { module: item.id }, { parent }, ['同批创建父模块，或修正 parent']));
        if (parent !== deriveParent(item.id))
            errors.push(diag('error', 'proposal/parent-mismatch', 'parent 必须等于 id 去掉最后一段', { module: item.id }, { parent, derived: deriveParent(item.id) }, []));
        if (splitId(item.id)!.length > MAX_DEPTH)
            errors.push(diag('error', 'proposal/depth-exceeded', '拟建模块超过深度上限', { module: item.id }, { max: MAX_DEPTH }, []));
        simulated.set(item.id, {
            uid: '00000000',
            id: item.id,
            parent: parent ?? null,
            name: { zh: item.id, en: item.id },
            description: { zh: 'proposal', en: 'proposal' },
            source: [],
            revision: '0'.repeat(40),
            updated_at: new Date().toISOString(),
            fingerprint: 'pending',
            ...(item.state !== undefined ? { state: item.state } : {}),
        });
    }
    for (const d of proposal.deps ?? []) {
        if (!simulated.has(d.from)) {
            errors.push(diag('error', 'proposal/from-missing', '依赖源模块不存在', { module: d.from }, {}, []));
            continue;
        }
        if (!simulated.has(d.to)) {
            errors.push(diag('error', 'proposal/to-missing', '依赖目标不存在（可同时把它列入 modules）', { module: d.from }, { to: d.to }, []));
            continue;
        }
        if (d.to === d.from) {
            errors.push(diag('error', 'proposal/self-loop', '依赖不能指向自身', { module: d.from }, {}, []));
            continue;
        }
        if (d.kind !== undefined && !DEP_KINDS.includes(d.kind as DepKind)) {
            errors.push(diag('error', 'proposal/kind', 'kind 必须为 ' + DEP_KINDS.join(' | '), { module: d.from }, { kind: d.kind }, []));
            continue;
        }
        const from = simulated.get(d.from)!;
        from.deps = from.deps ?? [];
        from.deps.push({ kind: d.kind ?? 'reference', to: d.to, ...(d.to_api !== undefined ? { to_api: d.to_api } : {}) });
    }
    const fakeFiles = [...simulated.values()].map(m => ({ module: m, body: '', file: '' }));
    const policyResult = await loadPolicyFile(projectDir);
    errors.push(...policyResult.errors);
    if (policyResult.policy !== null) {
        const diags = evaluatePolicy(policyResult.policy, { files: fakeFiles, byId: new Map(fakeFiles.map(f => [f.module.id, f])) });
        for (const d of diags) {
            if (d.severity === 'error')
                errors.push(d);
            else
                warnings.push(d);
        }
    }
    return { ok: errors.length === 0, errors, warnings };
}
