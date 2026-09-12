import { readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { DEP_KINDS } from './types.js';
import { diag } from './diag.js';
import { deriveParent, isValidId, moduleFilePath, splitId } from './ids.js';
import { loadAllModules, writeModuleFile, fingerprintOf, gitHead } from './store.js';
import { evaluatePolicy, loadPolicyFile } from './policy.js';
import { l1Validate } from './frontmatter.js';
import { deleteLayoutFile, layoutRelPath, loadLayoutFile, writeLayoutFile } from './layout.js';
async function loadProject(projectDir) {
    const loaded = await loadAllModules(projectDir);
    return { files: loaded.files, byId: new Map(loaded.files.map(f => [f.module.id, f])), errors: loaded.errors, warnings: loaded.warnings };
}
function containerStatus(module, all) {
    if (module.parent === null)
        return true;
    return all.some(m => m.parent === module.id);
}
function targetPath(projectDir, module, all) {
    return moduleFilePath(projectDir, module.id, containerStatus(module, all));
}
async function walkRel(base, rel, out) {
    let entries;
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
/** 快照 modules/ 与 renders/（用于失败回滚；数据集很小，直接全量）。 */
async function snapshotProject(projectDir) {
    const files = new Map();
    for (const dir of ['modules', 'renders']) {
        const rels = [];
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
async function restoreProject(projectDir, snap) {
    for (const dir of ['modules', 'renders']) {
        const rels = [];
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
async function pruneEmpty(base, dirs) {
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
function cloneModule(m) {
    return JSON.parse(JSON.stringify(m));
}
/** 预览模块将写入的文件路径（不落盘）。 */
export function previewModuleFile(projectDir, module, all) {
    return relative(projectDir, targetPath(projectDir, module, all)).replace(/\\/g, '/');
}
/** 合并 patch 到模块（字段级替换；id/uid 不可变，parent 必须由 move 改）。 */
function applyPatch(existing, patch) {
    const errors = [];
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
    const data = { ...merged };
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
export async function patchModule(projectDir, id, patch, opts = {}) {
    const { files, byId, errors, warnings } = await loadProject(projectDir);
    const errorsOut = [...errors];
    if (!byId.has(id)) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/not-found', '模块不存在：' + id, { module: id }, {}, [])], warnings, changed: [], detail: {} };
    }
    const existing = byId.get(id).module;
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
    const writeRes = await writeModuleFile(projectDir, merged.module, bodyOverride ?? byId.get(id).body ?? '');
    warnings.push(...writeRes.warnings);
    return { ok: errorsOut.length === 0, dryRun: false, errors: errorsOut, warnings, changed: [rel], detail: { file: rel }, module: merged.module, file: rel };
}
/** 批量 upsert/patch：全部 L1 + 结构预检通过才落盘（原子，失败回滚）。 */
export async function batchWrite(projectDir, items, mode, opts = {}) {
    const { files, byId, errors: loadErrors, warnings } = await loadProject(projectDir);
    const errorsOut = [...loadErrors];
    const working = new Map();
    for (const f of files)
        working.set(f.module.id, cloneModule(f.module));
    const bodies = new Map();
    for (const f of files)
        bodies.set(f.module.id, f.body ?? '');
    const batchIds = new Set();
    // 被 L1 拒绝而没能进入工作集的模块：后续"悬空箭头/父模块不存在"要指向这个根因，
    // 否则 1 个根因会膨胀成 N 个看起来无关的连带错误（0.5.3 修复）。
    const droppedByL1 = new Map();
    for (const item of items) {
        if (mode === 'upsert') {
            const fm = { ...(item.frontmatter ?? {}) };
            if (fm.parent === 'null' || fm.parent === null)
                fm.parent = null;
            if (typeof fm.updated_at !== 'string')
                fm.updated_at = new Date().toISOString();
            const r = l1Validate(fm, 'batch:' + String(fm.id ?? '?'));
            errorsOut.push(...r.errors);
            if (r.module === null && r.errors.length > 0)
                droppedByL1.set(String(fm.id ?? '?'), r.errors[0]);
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
            const r = applyPatch(working.get(id), { ...(item.patch?.patch ?? {}) });
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
        if (m.parent !== null && !idSet.has(m.parent)) {
            const cause = droppedByL1.get(m.parent);
            if (cause !== undefined)
                errorsOut.push(diag('error', 'structure/parent-dropped', 'parent「' + m.parent + '」因本批 L1 校验失败被移出批次（根因见该模块的 ' + cause.code + ' 诊断），本模块随之无法落盘', { module: m.id }, { parent: m.parent, root_cause_code: cause.code, root_cause: cause.message }, ['先按 ' + cause.code + ' 的诊断修正 ' + m.parent + '，再整批重试（本批为原子写入，未落盘）']));
            else
                errorsOut.push(diag('error', 'structure/parent-not-exist', 'parent 不存在（批次内也找不到）', { module: m.id }, { parent: m.parent }, ['先写父模块或修正 parent']));
        }
        if (m.parent !== deriveParent(m.id))
            errorsOut.push(diag('error', 'structure/parent-mismatch', 'parent 必须等于 id 去掉最后一段', { module: m.id }, { parent: m.parent, derived: deriveParent(m.id) }, []));
        const segs = splitId(m.id);
        if (segs === null)
            errorsOut.push(diag('error', 'structure/id-format', 'id 非法', { module: m.id }, {}, []));
        for (const d of m.deps ?? []) {
            if (d.to === m.id)
                errorsOut.push(diag('error', 'dep/self-loop', '箭头不能指向自身', { module: m.id }, {}, []));
            else if (!idSet.has(d.to)) {
                const cause = droppedByL1.get(d.to);
                if (cause !== undefined)
                    errorsOut.push(diag('error', 'dep/target-dropped', '箭头目标「' + d.to + '」因本批 L1 校验失败被移出批次（根因见该模块的 ' + cause.code + ' 诊断），因此本模块的这条箭头成了悬空边', { module: m.id }, { to: d.to, root_cause_code: cause.code, root_cause: cause.message }, ['先按 ' + cause.code + ' 的诊断修正 ' + d.to + '，再整批重试（本批为原子写入，未落盘）']));
                else
                    errorsOut.push(diag('error', 'dep/target-missing', '箭头目标不存在（批次内也找不到）', { module: m.id }, { to: d.to }, ['同批写入目标模块或修正 to']));
            }
        }
    }
    if (errorsOut.length > 0)
        return { ok: false, dryRun: opts.dryRun === true, errors: errorsOut, warnings, changed: [], files: [], detail: { validated: items.length, dropped_by_l1: [...droppedByL1.entries()].map(([id, d]) => ({ module: id, code: d.code, message: d.message })), root_cause_hint: droppedByL1.size > 0 ? '本批有 ' + droppedByL1.size + ' 个模块未通过 L1（见 dropped_by_l1）；连带诊断 dep/target-dropped 与 structure/parent-dropped 都指向它们，先修这些再整批重试' : null } };
    const targets = all.filter(m => batchIds.has(m.id)).map(m => ({ module: m, path: targetPath(projectDir, m, all) }));
    if (opts.dryRun === true) {
        return { ok: true, dryRun: true, errors: [], warnings, changed: [], files: targets.map(t => relative(projectDir, t.path).replace(/\\/g, '/')), detail: { validated: targets.length } };
    }
    const snap = await snapshotProject(projectDir);
    try {
        // 父模块优先写入，保证晋升顺序稳定
        targets.sort((a, b) => a.module.id.length - b.module.id.length);
        for (const t of targets) {
            const writeRes = await writeModuleFile(projectDir, t.module, bodies.get(t.module.id) ?? '');
            warnings.push(...writeRes.warnings);
        }
    }
    catch (error) {
        await restoreProject(projectDir, snap);
        return { ok: false, dryRun: false, errors: [diag('error', 'module/batch-write-failed', '批量写入失败，已回滚：' + String(error instanceof Error ? error.message : error), {}, {}, [])], warnings, changed: [], files: [], detail: {} };
    }
    return { ok: true, dryRun: false, errors: [], warnings, changed: targets.map(t => relative(projectDir, t.path).replace(/\\/g, '/')), files: targets.map(t => relative(projectDir, t.path).replace(/\\/g, '/')), detail: { written: targets.length } };
}
/** 重命名/移动子树：保 uid、级联 parent、重写 deps.to、迁移模块与渲染数据文件。 */
export async function moveModuleTree(projectDir, id, opts) {
    const { files, byId, errors: loadErrors, warnings } = await loadProject(projectDir);
    const errorsOut = [...loadErrors];
    const empty = { moves: [], rewired: [] };
    if (!byId.has(id)) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/not-found', '模块不存在：' + id, { module: id }, {}, [])], warnings, changed: [], detail: {}, ...empty };
    }
    let newId = opts.newId?.trim();
    if (newId === '')
        newId = undefined;
    const newParent = opts.newParent?.trim() === '' ? undefined : opts.newParent?.trim();
    const lastSeg = splitId(id).slice(-1)[0];
    if (newId === undefined && newParent !== undefined)
        newId = newParent + '.' + lastSeg;
    if (newId === undefined) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/move-noop', '必须提供 new_id 或 new_parent', { module: id }, {}, [])], warnings, changed: [], detail: {}, ...empty };
    }
    if (newId === id && newParent === undefined) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/move-noop', '新 id 与旧 id 相同', { module: id }, {}, [])], warnings, changed: [], detail: {}, ...empty };
    }
    if (!isValidId(newId)) {
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
    const mapping = new Map();
    for (const m of subtree)
        mapping.set(m.id, newId + m.id.slice(id.length));
    const outsideIds = new Set(files.filter(f => !subtreeIds.has(f.module.id)).map(f => f.module.id));
    for (const [, to] of mapping) {
        if (outsideIds.has(to)) {
            return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'module/id-conflict', '移动后 id 与现有模块冲突', { module: id }, { conflict: to }, [])], warnings, changed: [], detail: {}, ...empty };
        }
    }
    // 生成新模块集（id/parent 级联 + deps.to 重写）
    const moved = new Map();
    const rewired = [];
    for (const f of files) {
        const m = cloneModule(f.module);
        if (mapping.has(m.id)) {
            m.id = mapping.get(m.id);
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
    const bodyOf = new Map(files.map(f => [f.module.id, f.body ?? '']));
    const moves = [];
    for (const [from, to] of mapping)
        moves.push({ from, to });
    // 需要重写的模块：被移动的子树 + 依赖被重写的源模块 + 新旧父级（文件形态可能变化）
    const dirty = new Set();
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
    const writePlan = [];
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
    // 渲染数据：随子树迁移，并把 id / order / groups / edge_hints 一并改写到新世界；
    // 父层渲染数据去掉已迁出子模块的引用（旧父级）、补上新子模块的 order（新父级）。
    // 降级为叶子的模块删除渲染数据。
    const layoutPlan = [];
    const layoutDeletes = [];
    for (const p of writePlan) {
        const hasChildren = all.some(x => x.parent === p.module.id) || p.module.parent === null;
        if (!hasChildren && existsSync(join(projectDir, layoutRelPath(p.module.id))))
            layoutDeletes.push(p.module.id);
    }
    const deletedLayoutIds = new Set(layoutDeletes);
    const movedOldIds = new Set(mapping.keys());
    const now = new Date().toISOString();
    const remap = (old) => mapping.get(old) ?? old;
    const unparsedLayouts = [];
    /** 父层渲染数据：删掉指向已迁出子模块的 order / groups / edge_hints 引用；无改动返回 null。 */
    const pruneLayoutRefs = (layout) => {
        const next = { ...layout };
        let touched = false;
        if (layout.order !== undefined) {
            const kept = layout.order.filter(x => !movedOldIds.has(x));
            if (kept.length !== layout.order.length) {
                touched = true;
                if (kept.length > 0)
                    next.order = kept;
                else
                    delete next.order;
            }
        }
        if (layout.groups !== undefined) {
            const kept = layout.groups
                .map(g => ({ ...g, children: g.children.filter(x => !movedOldIds.has(x)) }))
                .filter(g => g.children.length > 0);
            if (kept.length !== layout.groups.length) {
                touched = true;
                if (kept.length > 0)
                    next.groups = kept;
                else
                    delete next.groups;
            }
        }
        if (next.groups === undefined && next.mode === 'groups')
            delete next.mode;
        if (layout.edge_hints !== undefined) {
            const kept = layout.edge_hints.filter(h => !movedOldIds.has(h.from) && !movedOldIds.has(h.to));
            if (kept.length !== layout.edge_hints.length) {
                touched = true;
                if (kept.length > 0)
                    next.edge_hints = kept;
                else
                    delete next.edge_hints;
            }
        }
        if (!touched)
            return null;
        next.updated_at = now;
        return next;
    };
    for (const [from, to] of mapping) {
        const oldLayout = layoutRelPath(from);
        if (!existsSync(join(projectDir, oldLayout)))
            continue;
        const loaded = await loadLayoutFile(projectDir, from);
        if (loaded.layout === null) {
            // 数据本身坏了：按原样搬运（迁移不该被坏渲染数据拖死），随后 L2 validate 会报出来
            unparsedLayouts.push(oldLayout);
            layoutPlan.push({ from: oldLayout, to: layoutRelPath(to), id: to });
            continue;
        }
        const children = new Set(all.filter(m => m.parent === to).map(m => m.id));
        const migrated = { ...loaded.layout, id: to, updated_at: now };
        if (loaded.layout.order !== undefined)
            migrated.order = loaded.layout.order.map(remap).filter(x => children.has(x));
        if (loaded.layout.groups !== undefined) {
            const groups = loaded.layout.groups
                .map(g => ({ ...g, children: g.children.map(remap).filter(x => children.has(x)) }))
                .filter(g => g.children.length > 0);
            if (groups.length > 0)
                migrated.groups = groups;
            else
                delete migrated.groups;
        }
        if (migrated.groups === undefined && migrated.mode === 'groups')
            delete migrated.mode;
        if (loaded.layout.edge_hints !== undefined) {
            const hints = loaded.layout.edge_hints
                .map(h => ({ ...h, from: remap(h.from), to: remap(h.to) }))
                .filter(h => children.has(h.from) && children.has(h.to) && h.from !== h.to);
            if (hints.length > 0)
                migrated.edge_hints = hints;
            else
                delete migrated.edge_hints;
        }
        layoutPlan.push({ from: oldLayout, to: layoutRelPath(to), id: to, data: migrated });
    }
    const layoutRewrites = [];
    const parentIds = new Set();
    if (oldParentId !== null)
        parentIds.add(oldParentId);
    if (newParentId !== null)
        parentIds.add(newParentId);
    for (const pid of [...parentIds].sort()) {
        // 被移动的模块与降级为叶子的模块没有渲染数据要维护
        if (deletedLayoutIds.has(pid) || movedOldIds.has(pid))
            continue;
        if (!existsSync(join(projectDir, layoutRelPath(pid))))
            continue;
        const loaded = await loadLayoutFile(projectDir, pid);
        if (loaded.layout === null) {
            unparsedLayouts.push(layoutRelPath(pid));
            continue;
        }
        let data = pid === oldParentId ? pruneLayoutRefs(loaded.layout) : null;
        if (pid === newParentId) {
            const base = data ?? loaded.layout;
            if (base.order !== undefined && !base.order.includes(newId))
                data = { ...base, order: [...base.order, newId], updated_at: now };
        }
        if (data !== null)
            layoutRewrites.push({ id: pid, data });
    }
    if (unparsedLayouts.length > 0) {
        warnings.push(diag('warning', 'layout/unparsed-carried', '渲染数据无法解析，已按原样搬运（未重写 id/order）：' + unparsedLayouts.join('、'), {}, { paths: unparsedLayouts }, ['用 normify_layout_upsert 重写这些层']));
    }
    const writeTos = writePlan.filter(p => p.from === null || p.from !== p.to).map(p => p.to);
    const rewritePaths = layoutRewrites.map(r => layoutRelPath(r.id));
    const changed = [...writeTos, ...layoutPlan.map(p => p.to), ...rewritePaths, ...layoutDeletes.map(id => layoutRelPath(id))];
    if (opts.dryRun === true) {
        return {
            ok: true,
            dryRun: true,
            errors: [],
            warnings,
            changed,
            detail: { moves, rewired, layouts: layoutPlan, layout_rewrites: layoutRewrites.map(r => ({ id: r.id, path: layoutRelPath(r.id) })), layout_deletes: layoutDeletes, writes: writePlan.map(p => ({ id: p.module.id, from: p.from, to: p.to })) },
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
        // 2) 渲染数据随迁（id/order/groups/edge_hints 已重写；内容无法解析的按字节搬运）
        for (const l of layoutPlan) {
            if (l.data !== undefined) {
                await writeLayoutFile(projectDir, l.data);
                await rm(join(projectDir, l.from), { force: true });
                continue;
            }
            const buf = await readFile(join(projectDir, l.from), 'utf8');
            await mkdir(dirname(join(projectDir, l.to)), { recursive: true });
            await writeFile(join(projectDir, l.to), buf, 'utf8');
            await rm(join(projectDir, l.from), { force: true });
        }
        // 2b) 父层渲染数据引用维护（旧父级删引用、新父级补 order）
        for (const r of layoutRewrites)
            await writeLayoutFile(projectDir, r.data);
        // 3) 降级为叶子的模块删除渲染数据
        for (const delId of layoutDeletes)
            await deleteLayoutFile(projectDir, delId);
        // 4) 写入全部脏模块（父 → 子，保证父子形态稳定）
        for (const p of writePlan) {
            const writeRes = await writeModuleFile(projectDir, p.module, p.body);
            warnings.push(...writeRes.warnings);
        }
        // 5) 清理空目录
        const emptyDirs = new Set();
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
    return { ok: true, dryRun: false, errors: [], warnings, changed, detail: { moves, rewired, layouts: layoutPlan, layout_rewrites: layoutRewrites.map(r => ({ id: r.id, path: layoutRelPath(r.id) })), layout_deletes: layoutDeletes }, moves, rewired };
}
/** 重算 fingerprint/revision/updated_at；planned 模块落地后可用 activate 一键转 active。 */
export async function refreshModules(projectDir, opts) {
    const { files, byId, errors: loadErrors, warnings } = await loadProject(projectDir);
    const errorsOut = [...loadErrors];
    const refreshed = [];
    const missing = [];
    const targets = opts.all === true ? files.map(f => f.module.id) : (opts.ids ?? []);
    if (targets.length === 0) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'refresh/no-target', '必须提供 ids 或 all:true', {}, {}, [])], warnings, changed: [], detail: {}, refreshed, missing };
    }
    const head = gitHead(opts.repoRoot);
    if (head.sha === null) {
        return { ok: false, dryRun: opts.dryRun === true, errors: [diag('error', 'refresh/git-failed', head.error ?? '无法获取 git HEAD', { repoRoot: opts.repoRoot }, {}, [])], warnings, changed: [], detail: {}, refreshed, missing };
    }
    const activate = opts.activate === true;
    const planned = [];
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
                missing.push({ id, paths: fp.missing });
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
        for (const p of planned) {
            const writeRes = await writeModuleFile(projectDir, p.module, byId.get(p.id).body ?? '');
            warnings.push(...writeRes.warnings);
        }
    }
    catch (error) {
        await restoreProject(projectDir, snap);
        return { ok: false, dryRun: false, errors: [diag('error', 'refresh/write-failed', '刷新写入失败，已回滚：' + String(error instanceof Error ? error.message : error), {}, {}, [])], warnings, changed: [], detail: {}, refreshed: [], missing };
    }
    return { ok: true, dryRun: false, errors: [], warnings, changed: refreshed.map(r => r.file), detail: { refreshed: refreshed.length, activated: planned.filter(p => p.module.state === 'active').length }, refreshed, missing };
}
/** 编码/设计前预检：拟新增的模块与依赖是否违反核心约束与 policy。 */
export async function checkProposal(projectDir, proposal) {
    const { files, byId, errors: loadErrors, warnings } = await loadProject(projectDir);
    const errors = [...loadErrors];
    const simulated = new Map();
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
        if (d.kind !== undefined && !DEP_KINDS.includes(d.kind)) {
            errors.push(diag('error', 'proposal/kind', 'kind 必须为 ' + DEP_KINDS.join(' | '), { module: d.from }, { kind: d.kind }, []));
            continue;
        }
        const from = simulated.get(d.from);
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
//# sourceMappingURL=edit.js.map