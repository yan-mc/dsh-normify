import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { apiKey, depthOf, deriveParent, idFromFilePath, treeOf } from './ids.js';
import { fingerprintOf, loadAllModules } from './store.js';
import { edgeKey, validateLayouts } from './layout.js';
import { evaluatePolicy, loadPolicyFile } from './policy.js';
import { validateChanges } from './changes.js';
import { diag } from './diag.js';
const BILINGUAL_CODES = new Set([
    'structure/name-shape', 'structure/name-empty', 'structure/name-too-long',
    'structure/description-shape', 'structure/description-empty', 'structure/description-too-long',
    'api/description-shape', 'api/description-empty', 'api/description-too-long',
    'dep/label-shape', 'dep/label-empty', 'dep/label-too-long',
]);
/** L2：全项目校验（规范 §5.2 规则全集）。零容忍：任何 error 阻断构建。 */
export async function validateProject(projectDir, opts) {
    const loaded = await loadAllModules(projectDir);
    let errors = loaded.errors;
    let warnings = loaded.warnings;
    // 双语放宽开关：把双语类错误降级为 warning
    if (!opts.requireBilingual) {
        errors = errors.filter(e => {
            if (BILINGUAL_CODES.has(e.code)) {
                warnings.push({ ...e, severity: 'warning' });
                return false;
            }
            return true;
        });
    }
    const files = loaded.files;
    const byId = new Map();
    const byUid = new Map();
    const childrenOf = new Map();
    // 唯一性
    for (const f of files) {
        const m = f.module;
        const prev = byId.get(m.id);
        if (prev !== undefined) {
            errors.push(diag('error', 'structure/id-duplicate', '模块 id 重复', { module: m.id }, { files: [prev.file, f.file] }, ['合并或重命名其中一个模块']));
        }
        else {
            byId.set(m.id, f);
        }
        const list = byUid.get(m.uid) ?? [];
        list.push(m.id);
        byUid.set(m.uid, list);
    }
    for (const [uid, ids] of byUid) {
        if (ids.length > 1) {
            errors.push(diag('error', 'structure/uid-duplicate', 'uid 重复', { uid }, { modules: ids }, ['为其中一个模块重新分配 uid']));
        }
    }
    // children 索引（单方向 parent → 派生）
    for (const f of files) {
        const p = f.module.parent;
        if (p === null)
            continue;
        const list = childrenOf.get(p) ?? [];
        list.push(f.module.id);
        childrenOf.set(p, list);
    }
    for (const list of childrenOf.values())
        list.sort();
    // 根与结构
    const roots = files.filter(f => f.module.parent === null).map(f => f.module.id).sort();
    if (roots.length === 0) {
        errors.push(diag('error', 'structure/no-root', '全项目必须至少一个根模块（id 单段、parent: null）', {}, {}, ['创建根模块，如 id: demo, parent: null']));
    }
    for (const r of roots) {
        if (r.includes('.')) {
            errors.push(diag('error', 'structure/root-single-segment', '根模块 id 必须为单段（树名）', { module: r }, {}, ['将根 id 改为单段树名']));
        }
    }
    const seen = new Set();
    const checkChain = (id, chain) => {
        if (seen.has(id))
            return;
        const f = byId.get(id);
        if (f === undefined)
            return;
        const m = f.module;
        if (chain.includes(id)) {
            errors.push(diag('error', 'structure/cycle', 'parent 链存在环', { module: id }, { chain: [...chain, id] }, ['修复 parent 使链条终止于根']));
            return;
        }
        seen.add(id);
        if (m.parent !== null) {
            const pf = byId.get(m.parent);
            if (pf === undefined) {
                errors.push(diag('error', 'structure/parent-not-exist', 'parent 指向的模块不存在（孤儿）', { module: id }, { parent: m.parent }, ['创建父模块 ' + m.parent + ' 或修正 parent']));
            }
            else {
                checkChain(m.parent, [...chain, id]);
            }
        }
    };
    for (const id of byId.keys())
        checkChain(id, []);
    // 文件 ↔ id 映射、叶子规则、API、边
    const apiOwners = new Map();
    const coarseLeaves = [];
    for (const f of files) {
        const m = f.module;
        const where = m.id;
        const derivedFileId = idFromFilePath('modules/' + f.file);
        if (derivedFileId !== m.id) {
            errors.push(diag('error', 'structure/file-id-mismatch', '文件路径与 id 映射不一致', { module: m.id }, { file: f.file, expected: derivedFileId }, ['将文件移至 ' + expectedPathHint(f.file, m.id)]));
        }
        const isLeaf = !childrenOf.has(m.id);
        if (isLeaf) {
            const spans = m.source.map(s => (s.end_line ?? s.line ?? 0) - (s.line ?? 0));
            const maxSpan = spans.length > 0 ? Math.max(...spans) : 0;
            if (m.source.length >= 2 || maxSpan >= 220)
                coarseLeaves.push({ id: m.id, files: m.source.length, span: maxSpan });
            if (m.apis === undefined) {
                errors.push(diag('error', 'api/leaf-missing', '叶子模块必须写 apis 字段', { module: m.id }, {}, ['提取该模块的 API/接口并写入 apis（可为空数组，记 warning）']));
            }
            else if (m.apis.length === 0) {
                warnings.push(diag('warning', 'api/leaf-empty', '叶子模块 apis 为空（无接口的功能单元）', { module: m.id }, {}, []));
            }
        }
        else if (m.apis !== undefined) {
            errors.push(diag('error', 'api/non-leaf', '非叶子（含根）模块禁止 apis 字段；API 只定义在叶子上', { module: m.id }, {}, ['将 apis 下放到叶子模块并删除本字段']));
        }
        if (m.apis !== undefined) {
            for (const a of m.apis) {
                const key = apiKey(a);
                const list = apiOwners.get(key) ?? [];
                list.push(m.id);
                apiOwners.set(key, list);
            }
            const fromApiKeys = new Set(m.apis.map(a => apiKey(a)));
            if (m.deps !== undefined) {
                for (const d of m.deps) {
                    if (d.to === m.id) {
                        errors.push(diag('error', 'dep/self-loop', '依赖箭头不能指向自身', { module: m.id }, { to: d.to }, ['删除该箭头']));
                    }
                    const target = byId.get(d.to);
                    if (target === undefined) {
                        errors.push(diag('error', 'dep/target-missing', '箭头目标模块不存在（悬空边）', { module: m.id }, { to: d.to }, ['创建目标模块或修正/删除该箭头']));
                        continue;
                    }
                    if (d.from_api !== undefined) {
                        if (!isLeaf) {
                            errors.push(diag('error', 'dep/from-api-non-leaf', 'from_api 只能引用本模块 API（非叶子没有 API）', { module: m.id }, { from_api: d.from_api }, ['删除 from_api 或改为模块级箭头']));
                        }
                        else if (!fromApiKeys.has(d.from_api)) {
                            errors.push(diag('error', 'dep/from-api-invalid', 'from_api 不是本模块的 API 键', { module: m.id }, { from_api: d.from_api, own: [...fromApiKeys] }, ['使用本模块 apis 中的键']));
                        }
                    }
                    if (d.to_api !== undefined) {
                        const targetApis = new Set((target.module.apis ?? []).map(a => apiKey(a)));
                        if (!targetApis.has(d.to_api)) {
                            errors.push(diag('error', 'dep/to-api-invalid', 'to_api 不是目标模块自身的 API 键', { module: m.id }, { to: d.to, to_api: d.to_api, target_apis: [...targetApis] }, ['使用目标模块 apis 中的键或删除 to_api']));
                        }
                    }
                }
                const seenDeps = new Set();
                for (const d of m.deps) {
                    const sig = [d.from_api ?? '', d.to, d.to_api ?? '', d.kind].join('|');
                    if (seenDeps.has(sig)) {
                        errors.push(diag('error', 'dep/duplicate', '重复的依赖箭头', { module: m.id }, { sig }, ['删除重复项']));
                    }
                    seenDeps.add(sig);
                }
            }
        }
    }
    for (const [key, ids] of apiOwners) {
        if (ids.length > 1) {
            errors.push(diag('error', 'api/key-duplicate', 'API 键全项目重复', { api: key }, { modules: ids }, ['只保留一个定义，或调整 path/method']));
        }
    }
    // 生命周期：deprecated/replacement 与指向 deprecated 的入边
    for (const f of files) {
        const m = f.module;
        if (m.state === 'deprecated') {
            if (m.replacement === undefined) {
                warnings.push(diag('warning', 'deprecation/no-replacement', '已废弃模块未提供 replacement，调用方无从迁移', { module: m.id }, {}, ['补 replacement 指向替代模块']));
            }
            else {
                const r = byId.get(m.replacement);
                if (r === undefined)
                    errors.push(diag('error', 'deprecation/replacement-missing', 'replacement 指向的模块不存在', { module: m.id }, { replacement: m.replacement }, ['改为存在的模块 id 或删除 replacement']));
                else if (r.module.state === 'deprecated')
                    warnings.push(diag('warning', 'deprecation/replacement-deprecated', 'replacement 本身也是 deprecated', { module: m.id }, { replacement: m.replacement }, ['改用未废弃的替代模块']));
            }
        }
    }
    for (const f of files) {
        for (const d of f.module.deps ?? []) {
            const target = byId.get(d.to);
            if (target !== undefined && target.module.state === 'deprecated') {
                warnings.push(diag('warning', 'deprecation/inbound', '依赖指向已废弃模块，建议迁移', { module: f.module.id }, { to: d.to, replacement: target.module.replacement ?? null }, ['迁移到 replacement 或删除该依赖']));
            }
        }
    }
    // 解析精细度提示（warning，不阻断）：过粗的叶子 / 过浅的整体层级
    for (const c of coarseLeaves.slice(0, 15)) {
        warnings.push(diag('warning', 'structure/leaf-too-coarse', '叶子模块可能过大（source ' + c.files + ' 个文件，最大行跨度 ' + c.span + '），建议下沉一层拆分', { module: c.id }, { source_files: c.files, max_line_span: c.span }, ['用 normify_module_promote 晋升为容器并拆出子模块']));
    }
    if (coarseLeaves.length > 15) {
        warnings.push(diag('warning', 'structure/leaf-too-coarse-many', '还有更多过粗的叶子模块', {}, { remaining: coarseLeaves.length - 15, total: coarseLeaves.length }, []));
    }
    const maxDepth = files.reduce((acc, f) => Math.max(acc, f.module.id.split('.').length), 0);
    if (files.length >= 24 && maxDepth <= 3) {
        warnings.push(diag('warning', 'structure/shallow-hierarchy', '模块数已较多但层级过浅（最深 ' + maxDepth + ' 段），建议继续下钻以获得更精细的架构图', {}, { module_count: files.length, max_depth: maxDepth }, ['对功能较多的容器继续拆分子模块']));
    }
    // 渲染数据集（renders/）：与结构数据集交叉校验
    const siblingEdges = new Map();
    for (const [parent, kids] of childrenOf) {
        const set = new Set();
        const kidSet = new Set(kids);
        for (const kid of kids) {
            const kf = byId.get(kid);
            if (kf === undefined)
                continue;
            for (const d of kf.module.deps ?? []) {
                if (kidSet.has(d.to) && d.to !== kid)
                    set.add(edgeKey(kid, d.to));
            }
        }
        siblingEdges.set(parent, set);
    }
    const layoutResult = await validateLayouts(projectDir, byId, childrenOf, siblingEdges);
    errors.push(...layoutResult.errors);
    warnings.push(...layoutResult.warnings);
    // 架构规则（policy.yml）：设计阶段安装，L2 强制执行
    const policyResult = await loadPolicyFile(projectDir);
    errors.push(...policyResult.errors);
    let policy = policyResult.policy;
    if (!policyResult.exists) {
        warnings.push(diag('warning', 'policy/missing', '项目未安装架构规则（policy.yml），结构演进缺少约束', {}, {}, ['用 normify_policy_get 查看完整规则模板，或 normify_policy_upsert 安装']));
    }
    else if (policy !== null) {
        const ruleDiags = evaluatePolicy(policy, { files, byId });
        for (const d of ruleDiags) {
            if (d.severity === 'error')
                errors.push(d);
            else
                warnings.push(d);
        }
    }
    // 开发变更日志（changes/）：与模块集交叉校验
    const changeResult = await validateChanges(projectDir, byId);
    for (const d of changeResult.errors)
        errors.push(d);
    for (const d of changeResult.warnings)
        warnings.push(d);
    // 一致性类：仓库证据（--repo-root）
    if (opts.repoRoot !== undefined && opts.repoRoot.trim() !== '') {
        const repoRoot = opts.repoRoot.trim();
        for (const f of files) {
            const m = f.module;
            const planned = m.state === 'planned';
            if (m.source.length === 0) {
                if (m.parent === null && !planned)
                    warnings.push(diag('warning', 'evidence/root-no-source', '根模块无 source（纯文档根）', { module: m.id }, {}, []));
                continue;
            }
            const missing = m.source.filter(s => !existsSync(join(repoRoot, s.path)));
            if (missing.length > 0) {
                if (planned) {
                    warnings.push(diag('warning', 'structure/planned-source-missing', '计划态模块的 source 尚未落地（实现后刷新即可）', { module: m.id }, { missing: missing.map(s => s.path) }, ['实现对应文件后调用 normify_module_refresh({ ids: ["' + m.id + '"], activate: true })']));
                }
                else {
                    errors.push(diag('error', 'evidence/source-missing', 'source 指向的文件在仓库中不存在', { module: m.id }, { missing: missing.map(s => s.path) }, ['修正 source.path 或运行 normify_sync 增量重建']));
                }
                continue;
            }
            if (m.fingerprint === 'pending') {
                if (!planned)
                    errors.push(diag('error', 'evidence/fingerprint-pending', '只有 planned 模块可以使用 fingerprint: pending', { module: m.id }, {}, ['用 normify_fingerprint 重算或把 state 改为 planned']));
                continue;
            }
            const fp = await fingerprintOf(repoRoot, m.source);
            if (fp.hash === null) {
                errors.push(diag('error', 'evidence/fingerprint-unavailable', '无法计算 fingerprint（文件缺失）', { module: m.id }, { missing: fp.missing }, []));
            }
            else if (fp.hash !== m.fingerprint) {
                errors.push(diag('error', 'evidence/fingerprint-drift', 'fingerprint 与仓库当前内容不一致（结构数据已过期）', { module: m.id }, { authored: m.fingerprint, actual: fp.hash }, ['运行 normify_sync 计划增量重建，或更新 fingerprint']));
            }
        }
    }
    else if (files.some(f => f.module.source.length > 0)) {
        warnings.push(diag('warning', 'evidence/checks-skipped', '未提供 repoRoot，跳过 source 存在性与 fingerprint 一致性校验', {}, {}, ['传入 repoRoot 参数以启用证据校验']));
    }
    return { ok: errors.length === 0, errors, warnings, files, childrenOf, byId, layouts: layoutResult.layouts, policy, changes: changeResult.changes };
}
function expectedPathHint(file, id) {
    // 按规范布局给出目标路径提示（modules/<tree>/<rest>...）
    const segs = id.split('.');
    if (segs.length === 1)
        return 'modules/' + id + '/index.md';
    const rest = segs.slice(1);
    return 'modules/' + segs[0] + '/' + rest.join('/') + '.md 或 modules/' + segs[0] + '/' + rest.join('/') + '/index.md';
}
export { depthOf, deriveParent, treeOf };
//# sourceMappingURL=validate.js.map