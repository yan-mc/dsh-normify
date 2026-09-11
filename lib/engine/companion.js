import { diag } from './diag.js';
import { gitHead, loadAllModules as loadAllModulesForClose } from './store.js';
import { refreshModules } from './edit.js';
import { validateProject } from './validate.js';
import { buildProject } from './compile.js';
import { renderProject } from './render.js';
import { l1ValidateChange, loadChangeFile, writeChangeFile } from './changes.js';
/**
 * 关闭开发变更（伴随开发收尾）：刷新指纹/激活 planned → validate（0 error 强制）→ build（可选 render）
 * → 标记 verified 并记录 revision.after。任何一步失败都不关闭，变更保持原状态。
 */
export async function closeChange(projectDir, id, opts) {
    const { change, error } = await loadChangeFile(projectDir, id);
    if (error !== null)
        return { ok: false, phase: 'load', errors: [error], warnings: [] };
    if (change === null)
        return { ok: false, phase: 'load', errors: [diag('error', 'change/not-found', '变更不存在：' + id, { change: id }, {}, [])], warnings: [] };
    if (change.status === 'verified')
        return { ok: false, phase: 'load', errors: [diag('error', 'change/closed', '变更已关闭：' + id, { change: id }, {}, [])], warnings: [] };
    if (change.status === 'abandoned')
        return { ok: false, phase: 'load', errors: [diag('error', 'change/abandoned', '变更已放弃，不能再关闭：' + id, { change: id }, {}, [])], warnings: [] };
    const repoRoot = opts.repoRoot !== undefined && opts.repoRoot.trim() !== '' ? opts.repoRoot : undefined;
    let refresh = null;
    if (repoRoot !== undefined) {
        const targets = [...new Set([...(change.modules.create ?? []), ...(change.modules.modify ?? [])])];
        if (targets.length > 0) {
            const rr = await refreshModules(projectDir, { ids: targets, repoRoot, activate: opts.activate !== false });
            if (!rr.ok) {
                return { ok: false, phase: 'refresh', errors: rr.errors, warnings: rr.warnings, change, hint: '先修正 refresh 报错（源码落地/路径/指纹），再关闭变更。' };
            }
            refresh = { refreshed: rr.refreshed, missing: rr.missing };
        }
    }
    // create 清单必须全部落地（active）：叶子必须有源码；容器随子树落地
    if (repoRoot !== undefined) {
        const after = (await loadAllModulesForClose(projectDir)).files;
        const notDone = (change.modules.create ?? []).filter(id => {
            const hit = after.find(f => f.module.id === id);
            return hit !== undefined && (hit.module.state ?? 'active') === 'planned';
        });
        if (notDone.length > 0) {
            return {
                ok: false,
                phase: 'landing',
                errors: [diag('error', 'change/create-not-landed', '变更 create 清单中仍有 planned 模块：' + notDone.join(', '), { change: change.id }, { modules: notDone }, ['实现 source 后用 normify_module_refresh({ ids, activate: true }) 落地'])],
                warnings: [],
                change,
                hint: 'close 要求 create 模块全部落地（0 error 强制）。',
            };
        }
    }
    const v = await validateProject(projectDir, { repoRoot, requireBilingual: opts.requireBilingual });
    if (!v.ok) {
        return {
            ok: false,
            phase: 'validate',
            errors: v.errors,
            warnings: v.warnings,
            change,
            message: 'close 被拒绝：必须 0 error（0 error 强制）',
            hint: '按 supportedFixes 修复后重试；变更保持 ' + change.status + '。',
        };
    }
    const b = await buildProject(projectDir, { repoRoot, requireBilingual: opts.requireBilingual });
    if (!b.ok)
        return { ok: false, phase: 'build', errors: b.errors, warnings: v.warnings, change };
    let render = null;
    if (opts.render === true) {
        const r = await renderProject(projectDir, {});
        if (!r.ok)
            return { ok: false, phase: 'render', errors: r.errors, warnings: v.warnings, change };
        render = { html: r.htmlPath, bytes: r.bytes, sha256: r.sha256 };
    }
    const now = new Date().toISOString();
    const head = repoRoot !== undefined ? gitHead(repoRoot) : { sha: null };
    const updated = {
        ...change,
        status: 'verified',
        closed_at: now,
        updated_at: now,
        revision: { before: change.revision.before ?? null, after: head.sha ?? change.revision.after ?? null },
        ...(opts.note !== undefined && opts.note !== '' ? { note: (change.note !== undefined && change.note !== '' ? change.note + '\n' : '') + opts.note } : {}),
    };
    const r = l1ValidateChange(updated, change.id, 'close:' + change.id);
    if (r.change === null)
        return { ok: false, phase: 'change-write', errors: r.errors, warnings: r.warnings, change };
    const file = await writeChangeFile(projectDir, r.change);
    // 变更状态落盘后重建一次产物，让 tree.json/receipt 反映 change_count / open_change_count
    const rebuilt = await buildProject(projectDir, { repoRoot, requireBilingual: opts.requireBilingual });
    if (!rebuilt.ok)
        return { ok: false, phase: 'rebuild', errors: rebuilt.errors, warnings: rebuilt.warnings, change: r.change };
    return {
        ok: true,
        phase: 'verified',
        errors: [],
        warnings: v.warnings,
        change: r.change,
        file,
        refresh,
        build: (rebuilt.receipt?.stats ?? b.receipt?.stats ?? null),
        render,
        revision: r.change.revision,
        hint: '变更已关闭并冻结。继续下一个变更：normify_change_open。',
    };
}
//# sourceMappingURL=companion.js.map