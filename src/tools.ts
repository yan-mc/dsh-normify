import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEP_KINDS, PROTOCOLS } from './engine/types.js';
import { fieldReference, l1Validate } from './engine/frontmatter.js';
import { apiKey, isValidId, slugify, splitId } from './engine/ids.js';
import { NormifyError, deleteModuleTree, fingerprintOf, gitChangedFiles, listProjects, loadAllModules, promoteModule, resolveProject, writeModuleFile } from './engine/store.js';
import { LAYOUT_SCHEMA_VERSION, deleteLayoutFile, edgeKey, l1ValidateLayout, layoutRelPath, listLayoutFiles, loadLayoutFile, writeLayoutFile } from './engine/layout.js';
import { batchWrite, checkProposal, moveModuleTree, patchModule, previewModuleFile, refreshModules } from './engine/edit.js';
import { POLICY_SCHEMA_VERSION, defaultPolicyTemplate, evaluatePolicy, l1ValidatePolicy, loadPolicyFile, policyReference, writePolicyFile } from './engine/policy.js';
import { CHANGE_SCHEMA_VERSION, isValidChangeId, listChangeIds, loadChangeFile, writeChangeFile, l1ValidateChange } from './engine/changes.js';
import { closeChange } from './engine/companion.js';
import { validateProject } from './engine/validate.js';
import { buildProject } from './engine/compile.js';
import { renderProject } from './engine/render.js';
import { fmtDiag } from './engine/diag.js';

import type { Context } from '@deepseek-ai/cordis';
import type { ChangeModules, ChangeStatus, Diagnostic, LayoutData, LayoutEdgeHint, LayoutGroup, LocalizedText, Module, ModuleFile, ModuleState, PolicyData, PolicyRule, SourceRef } from './engine/types.js';

export interface ToolEnv {
    rootDir: string;
    requireBilingual: boolean;
}

/** JSON Schema 节点（作者态：属性级内联 required: true；编译后对象级为 required: string[]）。 */
interface SchemaNode {
    type?: string;
    description?: string;
    required?: boolean | string[];
    properties?: Record<string, SchemaNode>;
    items?: SchemaNode;
    additionalProperties?: boolean;
    [key: string]: unknown;
}

/** 递归的 schema 取值：节点本身或节点数组（items/required 等子结构）。 */
type SchemaValue = SchemaNode | SchemaValue[];

/** params() 编译出的对象级 JSON Schema。 */
type ObjectSchema = SchemaNode & { required?: string[] };

/** 工具行为标记：read=只读；write=写入；destroy=破坏性；idempotent=幂等。 */
type ToolBehavior = 'read' | 'write' | 'destroy' | 'idempotent';

/** register() 的工具定义。 */
interface ToolDef {
    description: string;
    behavior: ToolBehavior;
    parameters?: ObjectSchema;
}

/** dsh-tools 服务的注册面（可选外部服务）。 */
interface ToolService {
    register?: (def: ToolRegistration) => void;
}

/** 交给 tools.register 的注册对象。 */
interface ToolRegistration {
    name: string;
    description: string;
    behavior: ToolBehavior;
    parameters?: ObjectSchema;
    readOnly: boolean;
    idempotent: boolean;
    destructive: boolean;
    output: {
        schema: Record<string, unknown>;
        render: (args: Record<string, unknown>, value: unknown) => { type: string; text: string | undefined }[];
    };
    execute: (args: Record<string, unknown>) => Promise<unknown>;
    isConcurrencySafe?: () => boolean;
}

/** 结构数据项目定位（slug 或目录绝对路径）。 */
interface ProjectArgs {
    project?: string;
    dir?: string;
}

/** resolveProject 解析出的结构数据目录。 */
interface ProjectRef {
    dir: string;
    slug: string;
}

/** 仅需模块 id 的工具实参。 */
interface IdArgs extends ProjectArgs {
    id: string;
}

interface TreeListArgs {
    root?: string;
}

interface ModuleListArgs extends ProjectArgs {
    parent?: string;
    direct_only?: boolean;
}

interface ModuleUpsertArgs extends ProjectArgs {
    frontmatter: Record<string, unknown>;
    body?: string;
    expect_updated_at?: string;
    dry_run?: boolean;
}

interface RepoRootArgs extends ProjectArgs {
    repoRoot?: string;
}

interface SyncArgs extends ProjectArgs {
    repoRoot: string;
    diff?: string;
}

interface SearchArgs extends ProjectArgs {
    query: string;
    topK?: number;
}

interface DepsFindArgs extends ProjectArgs {
    to: string;
}

interface LayoutUpsertArgs extends ProjectArgs {
    id: string;
    mode?: LayoutData['mode'];
    max_columns?: number;
    max_api_rows?: number;
    reading?: LocalizedText;
    order?: string[];
    groups?: LayoutGroup[];
    edge_hints?: LayoutEdgeHint[];
}

interface RenderArgs extends ProjectArgs {
    out?: string;
}

interface FingerprintArgs {
    repoRoot: string;
    source: SourceRef[];
}

interface BriefArgs extends ProjectArgs {
    task?: string;
    id?: string;
    files?: string[];
    depth?: number;
}

interface ModulePatchArgs extends ProjectArgs {
    id: string;
    patch: Record<string, unknown>;
    expect_updated_at?: string;
    dry_run?: boolean;
}

/** 批量条目：mode=upsert 传 frontmatter；mode=patch 传 patch。 */
interface BatchItemShape {
    frontmatter?: Record<string, unknown>;
    patch?: { id: string; patch: Record<string, unknown> };
}

interface ModuleBatchArgs extends ProjectArgs {
    items: BatchItemShape[];
    mode?: string;
    dry_run?: boolean;
}

interface ModuleMoveArgs extends ProjectArgs {
    id: string;
    new_id?: string;
    new_parent?: string;
    dry_run?: boolean;
}

interface ModuleRefreshArgs extends ProjectArgs {
    ids?: string[];
    all?: boolean;
    repoRoot: string;
    activate?: boolean;
    dry_run?: boolean;
}

interface ChangeOpenArgs extends ProjectArgs {
    id?: string;
    title: LocalizedText;
    intent: LocalizedText;
    modules: ChangeModules;
    acceptance: string[];
    status?: 'proposed' | 'in_progress';
    note?: string;
}

interface ChangeUpdateArgs extends ProjectArgs {
    id: string;
    patch: Record<string, unknown>;
}

interface ChangeListArgs extends ProjectArgs {
    id?: string;
    status?: string;
}

interface ChangeCloseArgs extends ProjectArgs {
    id: string;
    repoRoot?: string;
    activate?: boolean;
    render?: boolean;
    note?: string;
}

interface PolicyUpsertArgs extends ProjectArgs {
    rules: PolicyRule[];
    dry_run?: boolean;
}

/** normify_check 的拟建模块条目。 */
interface ProposalModuleShape {
    id: string;
    parent?: string | null;
    state?: ModuleState;
}

/** normify_check 的拟新增依赖条目。 */
interface ProposalDepShape {
    from: string;
    to: string;
    kind?: string;
    to_api?: string;
}

interface CheckArgs extends ProjectArgs {
    modules?: ProposalModuleShape[];
    deps?: ProposalDepShape[];
}

/** normify_tree_list 的一行。 */
interface TreeListRow {
    slug: string;
    dir: string;
    trees: { tree_id: string; root_uid: string; repository: string | null }[];
}

/** normify_search 的一条命中。 */
interface SearchHit {
    id: string;
    name: string;
    snippet: string;
    api?: string;
}

/** 变更摘要（brief 的 open_changes 与 change_list 的公共部分）。 */
interface ChangeSummaryRow {
    id: string;
    status: ChangeStatus;
    title: LocalizedText;
    modules: ChangeModules;
}

/** normify_change_list 的一行。 */
interface ChangeListRow extends ChangeSummaryRow {
    acceptance_count: number;
    created_at: string;
    closed_at: string | null;
}

/** normify_policy_get 的返回体（policy.yml 不存在时补 template）。 */
interface PolicyGetOutput {
    ok: boolean;
    file: string;
    exists: boolean;
    policy: PolicyData | null;
    rule_count: number;
    reference: string;
    template?: string;
}

/** normify_brief 的新模块建议。 */
interface ModuleSuggestion {
    file: string;
    suggested_parent: string | null;
    suggested_id: string | null;
    state: string;
    note: string;
}

/** normify_brief 的候选模块画像。 */
interface BriefTarget {
    id: string;
    state: ModuleState;
    name: LocalizedText;
    description: LocalizedText;
    file: string | null;
    tags: string[];
    source: SourceRef[];
    apis: { key: string; description: LocalizedText }[];
    deps_out: { to: string; kind: string; to_api: string | null }[];
    deps_in: { from: string; kind: string }[];
    has_layout: boolean;
    children: string[];
}

/** normify_brief 的影响面。 */
interface ImpactSummary {
    direct: string[];
    transitive: string[];
    cross_tree: string[];
}

/** normify_sync 的 API 增删行。 */
interface ApiDiffRow {
    module: string;
    key: string;
}

/** normify_sync 的破坏性 API 删除行。 */
interface BreakingApiRow extends ApiDiffRow {
    reason: string;
}

/** tree.json 中模块条目的 API 快照（API diff 只需要 key）。 */
interface TreeApiEntry {
    key?: string;
}

/** build 产物 tree.json 的最小快照（只读取 modules[*].apis[*].key）。 */
interface TreeSnapshot {
    modules: Record<string, { apis?: TreeApiEntry[] }>;
}
function str(description: string): SchemaNode { return { type: 'string', description, required: true }; }
function strOpt(description: string): SchemaNode { return { type: 'string', description, required: false }; }
function numOpt(description: string): SchemaNode { return { type: 'number', description, required: false }; }
function boolOpt(description: string): SchemaNode { return { type: 'boolean', description, required: false }; }
/**
 * 把作者态 schema（属性内联 `required: true`，方便手写）编译为标准 JSON Schema：
 * 属性级 required 提升为对象级 `required: string[]`，对象补 `additionalProperties: false`。
 * dsh 0.1.5+ 会把工具 parameters 原样交给模型/provider，必须是规范 JSON Schema
 *（`required: true` 不是合法关键字）。
 */
function toJsonSchema(node: unknown): SchemaValue {
    if (Array.isArray(node))
        return node.map((entry: unknown) => toJsonSchema(entry));
    if (node === null || typeof node !== 'object')
        return node as SchemaValue;
    const source = node as SchemaNode;
    const out: SchemaNode = {};
    const required: string[] = [];
    let hasProperties = false;
    for (const [key, value] of Object.entries(source)) {
        if (key === 'required')
            continue; // 由属性内联 required 重新派生
        if (key === 'properties' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
            hasProperties = true;
            const properties: Record<string, SchemaNode> = {};
            for (const [propKey, propValue] of Object.entries(value as Record<string, unknown>)) {
                const prop = propValue as SchemaNode;
                if (prop !== null && typeof prop === 'object' && prop.required === true)
                    required.push(propKey);
                properties[propKey] = toJsonSchema(propValue) as SchemaNode;
            }
            out.properties = properties;
            continue;
        }
        out[key] = toJsonSchema(value);
    }
    if (hasProperties) {
        out.additionalProperties = false;
        if (required.length > 0)
            out.required = required;
    }
    return out;
}
function params(props: Record<string, SchemaNode>, _required: string[] = []): ObjectSchema {
    // `_required` 保留旧调用签名；必填信息已内联在属性描述里。
    return toJsonSchema({ type: 'object', properties: props }) as ObjectSchema;
}
function l10nParam(description: string): SchemaNode {
    return {
        type: 'object',
        description,
        required: true,
        properties: {
            zh: { type: 'string', description: '中文', required: true },
            en: { type: 'string', description: 'English', required: true },
        },
    };
}
function sourceParam(): SchemaNode {
    return {
        type: 'array',
        description: '代码位置证据：仓库内相对路径 + 可选行号',
        required: true,
        items: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'repo 相对 POSIX 路径', required: true },
                line: { type: 'number', description: '起始行', required: false },
                end_line: { type: 'number', description: '结束行', required: false },
            },
            required: ['path'],
        },
    };
}
function apiParam(): SchemaNode {
    return {
        type: 'array',
        description: '本模块全部 API（仅叶子模块允许；protocol: ' + PROTOCOLS.join('|') + '；http 必须带大写 method）',
        required: false,
        items: {
            type: 'object',
            properties: {
                protocol: { type: 'string', description: '协议', required: true },
                method: { type: 'string', description: '仅 http：大写 METHOD', required: false },
                path: { type: 'string', description: 'URL 路径或 topic/队列/表名', required: true },
                description: l10nParam('API 功能简介'),
            },
            required: ['protocol', 'path', 'description'],
        },
    };
}
function depParam(): SchemaNode {
    return {
        type: 'array',
        description: '出向依赖箭头（只存源端；kind: ' + DEP_KINDS.join('|') + '；to 为目标模块 id，可跨树）',
        required: false,
        items: {
            type: 'object',
            properties: {
                kind: { type: 'string', description: '箭头类型', required: true },
                to: { type: 'string', description: '目标模块 id', required: true },
                from_api: { type: 'string', description: '可选：本模块某 API 键（仅叶子）', required: false },
                to_api: { type: 'string', description: '可选：目标模块自身某 API 键', required: false },
                label: l10nParam('箭头标签'),
            },
            required: ['kind', 'to'],
        },
    };
}
function l10nOptParam(description: string): SchemaNode {
    return {
        type: 'object',
        description,
        required: false,
        properties: {
            zh: { type: 'string', description: '中文', required: true },
            en: { type: 'string', description: 'English', required: true },
        },
    };
}
function layoutGroupParam(): SchemaNode {
    return {
        type: 'array',
        description: '视觉分组：把直接子模块按语义聚类渲染（mode=groups 时必填）',
        required: false,
        items: {
            type: 'object',
            properties: {
                id: { type: 'string', description: '分组 id（文件内唯一）', required: true },
                title: l10nParam('分组标题'),
                children: { type: 'array', description: '属于该组的直接子模块 id', required: true, items: { type: 'string', description: '子模块 id', required: true } },
            },
            required: ['id', 'title', 'children'],
        },
    };
}
function layoutHintParam(): SchemaNode {
    return {
        type: 'array',
        description: '单条边的绘制提示（可选）：车道 / 曲线样式 / 捆扎',
        required: false,
        items: {
            type: 'object',
            properties: {
                from: { type: 'string', description: '源子模块 id', required: true },
                to: { type: 'string', description: '目标子模块 id', required: true },
                kind: { type: 'string', description: '仅当同点多边时区分：' + DEP_KINDS.join('|'), required: false },
                lane: { type: 'number', description: '车道序号 0..9（越大越靠外）', required: false },
                style: { type: 'string', description: 'orthogonal | curve', required: false },
                bundle: { type: 'string', description: '捆扎 id：同 bundle 的边共道', required: false },
                priority: { type: 'number', description: '绘制优先级（越大越先画）', required: false },
            },
            required: ['from', 'to'],
        },
    };
}
function strArrayOpt(description: string): SchemaNode {
    return { type: 'array', description, required: false, items: { type: 'string', description: '条目', required: true } };
}
function strArray(description: string): SchemaNode {
    return { type: 'array', description, required: true, items: { type: 'string', description: '条目', required: true } };
}
function objArrayParam(description: string, required = false): SchemaNode {
    return { type: 'array', description, required, items: { type: 'object', description: '对象条目' } };
}
function freeObjectParam(description: string, required = false): SchemaNode {
    return { type: 'object', description, required };
}
function moduleParams(): ObjectSchema {
    return params({
        uid: str('8 位小写 hex 随机串（不变标识，全项目唯一）'),
        id: str('路径式 id：小写段点分隔，含树名段 ≤ 12 段，如 demo.order.checkout.payment'),
        parent: str('父模块 id（= id 去掉最后一段）；根模块传 JSON null 或字符串 "null"'),
        name: l10nParam('模块名（≤60 字符）'),
        description: l10nParam('功能介绍（≤500 字符，刻意精炼）'),
        source: sourceParam(),
        revision: str('生成时对应的 40 位 git SHA'),
        updated_at: str('ISO 8601 时间，如 2026-08-30T12:00:00Z'),
        fingerprint: str('source 指纹（hex；planned 模块可填 pending）'),
        repository: strOpt('仅根模块：仓库 URL'),
        state: strOpt('生命周期状态：active | planned | deprecated（默认 active；计划态先建树、后实现）'),
        replacement: strOpt('仅 state=deprecated：替代模块 id'),
        tags: strArrayOpt('自由标签（≤12 个，用于检索/分组）'),
        apis: apiParam(),
        deps: depParam(),
    }, ['uid', 'id', 'parent', 'name', 'description', 'source', 'revision', 'updated_at', 'fingerprint']);
}
/** 项目定位参数（属性映射，供 `params({ ...projectParams() })` 展开）。 */
function projectParams(_required = false): { project: SchemaNode; dir: SchemaNode } {
    return {
        project: strOpt('项目 slug（结构数据目录 = normify-<slug>）；也可以直接传结构数据目录绝对路径'),
        dir: strOpt('结构数据目录绝对路径（与 project 二选一）'),
    };
}
function toErrorPayload(error: unknown): { ok: false; error: { code: string; message: string } } {
    if (error instanceof NormifyError) {
        return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof Error) {
        return { ok: false, error: { code: 'internal', message: error.message } };
    }
    return { ok: false, error: { code: 'internal', message: String(error) } };
}
function diagnosticsOut(errors: Diagnostic[], warnings: Diagnostic[]): { ok: boolean; errors: string[]; warnings: string[]; summary: string } {
    return {
        ok: errors.length === 0,
        errors: errors.map(fmtDiag),
        warnings: warnings.map(fmtDiag),
        summary: errors.length + ' error / ' + warnings.length + ' warning',
    };
}
export function registerTools(ctx: Context, env: ToolEnv): void {
    const register = <A>(key: string, def: ToolDef, execute: (args: A) => Promise<unknown>): void => {
        const tools = (ctx as unknown as { tools?: ToolService }).tools;
        if (tools === undefined || tools.register === undefined)
            return;
        const behavior = def.behavior;
        const wrapped = async (rawArgs: unknown): Promise<unknown> => {
            try {
                const args = (rawArgs ?? {}) as Record<string, unknown>;
                const required = def.parameters?.required ?? [];
                // `parent` 允许显式 null（根模块）；其余必填参数不允许 null/空串。
                const missing = required.filter(r => {
                    const value = args[r];
                    if (value === undefined || value === '')
                        return true;
                    if (value === null)
                        return r !== 'parent';
                    return false;
                });
                if (missing.length > 0) {
                    return { ok: false, error: { code: 'args/missing', message: '缺少必填参数: ' + missing.join(', ') } };
                }
                return await execute(args as A);
            }
            catch (error) {
                return toErrorPayload(error);
            }
        };
        tools.register({
            ...def,
            name: key,
            behavior,
            // 旧版行为标记保留（文档/兼容），新版 dsh 0.1.5+ 不再读取这三个字段。
            readOnly: behavior === 'read',
            idempotent: behavior === 'read' || behavior === 'idempotent' || behavior === 'destroy',
            destructive: behavior === 'destroy',
            output: {
                schema: {},
                render: (_args, value) => [
                    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
                ],
            },
            execute: wrapped,
            // 只读工具可被 dsh 0.1.5+ 的并发调度器并行调用；写工具保持独占。
            ...(behavior === 'read' ? { isConcurrencySafe: () => true } : {}),
        });
    };
    const resolve = (args: ProjectArgs, create = false): Promise<ProjectRef> => resolveProject(env.rootDir, { project: args.project, dir: args.dir }, { create });
    register('normify_tree_list', {
        description: '列出全部结构数据项目（normify-* 目录，含每棵树的根与仓库）。',
        behavior: 'read',
        parameters: params({
            root: strOpt('搜索根目录（默认插件配置的 rootDir，可传工作区绝对路径）'),
        }),
    }, async (args: TreeListArgs) => {
        const rootDir = typeof args.root === 'string' && args.root.trim() !== '' ? args.root : env.rootDir;
        const projects: ProjectRef[] = listProjects(rootDir);
        const out: TreeListRow[] = [];
        for (const p of projects) {
            const roots: ModuleFile[] = (await loadAllModules(p.dir)).files.filter(f => f.module.parent === null);
            out.push({
                slug: p.slug,
                dir: p.dir,
                trees: roots.map(r => ({ tree_id: r.module.id, root_uid: r.module.uid, repository: r.module.repository ?? null })),
            });
        }
        return { ok: true, rootDir: env.rootDir, projects: out };
    });
    register('normify_module_get', {
        description: '读取单个模块（frontmatter 字段 + 正文）。',
        behavior: 'read',
        parameters: params({
            id: str('模块 id 或 uid'),
            ...projectParams(true),
        }, ['id']),
    }, async (args: IdArgs) => {
        const proj = await resolve(args);
        const files: ModuleFile[] = (await loadAllModules(proj.dir)).files;
        const mf = files.find(f => f.module.id === args.id || f.module.uid === args.id);
        if (mf === undefined)
            return { ok: false, error: { code: 'module/not-found', message: '模块不存在：' + String(args.id) } };
        const kids = files.filter(f => f.module.parent === mf.module.id).map(f => f.module.id).sort();
        return { ok: true, module: mf.module, children: kids, file: mf.file, body: mf.body };
    });
    register('normify_module_list', {
        description: '列出模块（可按父模块/树过滤），含每个模块的统计。',
        behavior: 'read',
        parameters: params({
            parent: strOpt('父模块 id 或树名（默认全部）'),
            direct_only: boolOpt('只列 parent 的直接子模块（默认 false：含整个子树）'),
            ...projectParams(true),
        }, []),
    }, async (args: ModuleListArgs) => {
        const proj = await resolve(args);
        const files: ModuleFile[] = (await loadAllModules(proj.dir)).files;
        const kids = new Map<string, string[]>();
        for (const f of files) {
            if (f.module.parent === null)
                continue;
            const list = kids.get(f.module.parent) ?? [];
            list.push(f.module.id);
            kids.set(f.module.parent, list);
        }
        const layoutIds = new Set((await listLayoutFiles(proj.dir)).map(rel => rel.replace(/^renders\//, '').replace(/\.json$/, '').replace(/\//g, '.')));
        const filter = args.parent;
        const directOnly = args.direct_only === true;
        const rows = files
            .filter(f => directOnly
            ? filter === undefined || filter === '' || f.module.parent === filter
            : filter === undefined || filter === '' || f.module.parent === filter || f.module.id === filter || f.module.id.startsWith(filter + '.'))
            .sort((a, b) => a.module.id.localeCompare(b.module.id))
            .map(f => ({
            id: f.module.id,
            uid: f.module.uid,
            parent: f.module.parent,
            name: f.module.name,
            is_leaf: !kids.has(f.module.id),
            children_count: (kids.get(f.module.id) ?? []).length,
            has_layout: layoutIds.has(f.module.id),
            api_count: f.module.apis?.length ?? 0,
            dep_count: f.module.deps?.length ?? 0,
        }));
        return { ok: true, count: rows.length, modules: rows };
    });
    register('normify_module_upsert', {
        description: '创建/更新一个模块（写时执行 L1 校验；幂等；自动晋升父模块文件形态）。',
        behavior: 'write',
        parameters: params({
            frontmatter: moduleParams(),
            body: strOpt('Markdown 正文（给人类读者的展开介绍，可选）'),
            expect_updated_at: strOpt('可选：期望的当前 updated_at；不匹配则拒绝（防止覆盖他人写入）'),
            dry_run: boolOpt('仅校验并返回将写入的文件，不落盘'),
            ...projectParams(true),
        }, ['frontmatter']),
    }, async (args: ModuleUpsertArgs) => {
        const proj = await resolve(args, true);
        // dsh 0.1.5+ 会 deepFreeze 工具实参，禁止原地修改：先浅拷贝再规范化 parent。
        const fm = { ...args.frontmatter };
        // parent 允许传字符串 "null" 或 JSON null（根模块）。
        if (fm.parent === 'null' || fm.parent === null)
            fm.parent = null;
        const { module, errors, warnings } = l1Validate(fm, 'module.upsert');
        if (module === null) {
            return { ok: false, errors: errors.map(fmtDiag), warnings: warnings.map(fmtDiag), summary: errors.length + ' error（未写入）' };
        }
        const existing: ModuleFile | undefined = (await loadAllModules(proj.dir)).files.find(f => f.module.id === module.id);
        if (typeof args.expect_updated_at === 'string' && existing !== undefined && existing.module.updated_at !== args.expect_updated_at) {
            return { ok: false, error: { code: 'module/conflict', message: '模块已被其他写入修改（updated_at 不一致），请先重新读取：' + module.id } };
        }
        if (args.dry_run === true) {
            const all: Module[] = (await loadAllModules(proj.dir)).files.map(f => f.module);
            return {
                ok: true,
                dry_run: true,
                file: previewModuleFile(proj.dir, module, all),
                promoted: [],
                l1: { errors: errors.map(fmtDiag), warnings: warnings.map(fmtDiag) },
                hint: 'dry_run 通过（未写入）；去掉 dry_run 正式写入。',
            };
        }
        const result = await writeModuleFile(proj.dir, module, args.body ?? '');
        return {
            ok: true,
            file: result.file,
            promoted: result.promoted,
            l1: { errors: errors.map(fmtDiag), warnings: warnings.map(fmtDiag) },
            hint: '写入完成。请继续创作其它模块；全部完成后运行 normify_validate 做全项目校验（L2），再 normify_build。',
        };
    });
    register('normify_module_delete', {
        description: '删除模块及其整棵子树（含悬空边预警清单，供后续修复）。',
        behavior: 'destroy',
        parameters: params({
            id: str('要删除的模块 id'),
            ...projectParams(true),
        }, ['id']),
    }, async (args: IdArgs) => {
        const proj = await resolve(args);
        const id = String(args.id);
        // 悬空边预警：全项目扫描指向该子树任何模块的箭头
        const before: ModuleFile[] = (await loadAllModules(proj.dir)).files;
        const affected = new Set([id]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const f of before) {
                if (f.module.parent !== null && affected.has(f.module.parent) && !affected.has(f.module.id)) {
                    affected.add(f.module.id);
                    grew = true;
                }
            }
        }
        const dangling = before
            .filter(f => !affected.has(f.module.id))
            .flatMap(f => (f.module.deps ?? []).filter(d => affected.has(d.to)).map(d => ({ from: f.module.id, kind: d.kind, to: d.to })));
        const result = await deleteModuleTree(proj.dir, id);
        return {
            ok: true,
            deleted: result.deleted,
            demoted: result.demoted,
            dangling_edges: dangling,
            hint: dangling.length > 0 ? '存在悬空箭头（已列出）：请用 normify_module_upsert 修正或删除引用方的 deps，否则 normify_validate 将报错。' : '无悬空边。',
        };
    });
    register('normify_module_promote', {
        description: '把叶子模块晋升为容器（文件 x.md → x/index.md；为它创建子模块前调用）。',
        behavior: 'write',
        parameters: params({
            id: str('叶子模块 id'),
            ...projectParams(true),
        }, ['id']),
    }, async (args: IdArgs) => {
        const proj = await resolve(args);
        const result = await promoteModule(proj.dir, String(args.id));
        return { ok: true, file: result.file, hint: '晋升完成。现在可以为它创建子模块（子模块 parent 指向该 id）。' };
    });
    register('normify_validate', {
        description: '全项目校验（L2，零容忍）：结构/叶子/API/边/多树/文件映射/仓库证据。返回全部诊断（含 subject/evidence/supportedFixes）。',
        behavior: 'read',
        parameters: params({
            repoRoot: strOpt('仓库根目录（提供则校验 source 存在性与 fingerprint 一致性）'),
            ...projectParams(true),
        }, []),
    }, async (args: RepoRootArgs) => {
        const proj = await resolve(args);
        const v = await validateProject(proj.dir, { repoRoot: args.repoRoot, requireBilingual: env.requireBilingual });
        return diagnosticsOut(v.errors, v.warnings);
    });
    register('normify_build', {
        description: '校验并编译：产出 tree.json / outline.md / api-index.json / receipt.json（含 SHA-256 冻结）。任何 error 不产产物。',
        behavior: 'idempotent',
        parameters: params({
            repoRoot: strOpt('仓库根目录（启用证据校验）'),
            ...projectParams(true),
        }, []),
    }, async (args: RepoRootArgs) => {
        const proj = await resolve(args);
        const b = await buildProject(proj.dir, { repoRoot: args.repoRoot, requireBilingual: env.requireBilingual });
        if (!b.ok) {
            return { ok: false, errors: b.errors.map(fmtDiag), warnings: b.warnings.map(fmtDiag), summary: b.errors.length + ' error（未产出任何产物）' };
        }
        return { ok: true, receipt: b.receipt, warnings: b.warnings.map(fmtDiag), hint: '编译成功。可运行 normify_render 生成交互式 HTML。' };
    });
    register('normify_sync', {
        description: '增量再生成计划器 v2（只读）：git diff → 脏子树 / 新增文件建议 / 失效模块 / API 增删与破坏性变更 / planned 进度，供 AI 按清单局部重建。',
        behavior: 'read',
        parameters: params({
            repoRoot: str('仓库根目录'),
            diff: strOpt('git diff 范围（默认 HEAD）'),
            ...projectParams(true),
        }, ['repoRoot']),
    }, async (args: SyncArgs) => {
        const proj = await resolve(args);
        const repoRoot = String(args.repoRoot);
        const diff = args.diff;
        const changed = gitChangedFiles(repoRoot, diff ?? '');
        if (changed.files === null) {
            return { ok: false, error: { code: 'sync/git-failed', message: changed.error ?? 'git 不可用' } };
        }
        const files: ModuleFile[] = (await loadAllModules(proj.dir)).files;
        const affected = files.filter(f => f.module.source.some(s => changed.files!.some(cf => cf === s.path || cf.startsWith(s.path + '/'))));
        const affectedSet = new Set(affected.map(f => f.module.id));
        const toReview = new Set<string>();
        for (const f of affected) {
            let p = f.module.parent;
            while (p !== null) {
                toReview.add(p);
                const pf = files.find(x => x.module.id === p);
                p = pf?.module.parent ?? null;
            }
        }
        const drift: string[] = [];
        for (const f of affected) {
            const fp = await fingerprintOf(repoRoot, f.module.source);
            if (fp.hash !== null && fp.hash !== f.module.fingerprint)
                drift.push(f.module.id);
        }
        const layoutIds = new Set((await listLayoutFiles(proj.dir)).map(rel => rel.replace(/^renders\//, '').replace(/\.json$/, '').replace(/\//g, '.')));
        const layoutsToReview = [...new Set([...affected.map(f => f.module.id), ...toReview])].filter(id => layoutIds.has(id)).sort();
        // v2：新增文件 → 建议新模块；失效 source → 待删/待修；API 增删 → 破坏性变更；planned 进度
        const CODE_EXT = /\.(ts|tsx|js|mjs|cjs|mts|cts|py|java|kt|go|rs|cs|c|cpp|h|hpp|rb|php|swift|scala|lua|vue|svelte|md|yml|yaml|json)$/i;
        const IGNORE_DIR = /^(lib|dist|build|out|node_modules|vendor|coverage|\.git|_tmp|\.dsh-module-fallback)\//;
        const kindRank = (p: string): number => p.startsWith('src/') ? 0 : /^(scripts|tests)\//.test(p) ? 1 : p.startsWith('skills/') ? 2 : p.startsWith('docs/') ? 4 : /\.md$/i.test(p) ? 5 : 3;
        const newFiles = changed.files
            .filter(cf => CODE_EXT.test(cf) && !IGNORE_DIR.test(cf) && !files.some(f => f.module.source.some(s => s.path === cf || cf.startsWith(s.path + '/') || s.path.startsWith(cf + '/'))))
            .sort((a, b) => kindRank(a) - kindRank(b) || a.localeCompare(b));
        const deletedFiles = changed.files.filter(cf => !existsSync(join(repoRoot, cf)));
        const staleModules = files.filter(f => f.module.source.length > 0 && f.module.source.some(s => !existsSync(join(repoRoot, s.path)))).map(f => ({ id: f.module.id, missing: f.module.source.filter(s => !existsSync(join(repoRoot, s.path))).map(s => s.path) }));
        const suggestedModules = newFiles.slice(0, 20).map(cf => {
            const dir = cf.includes('/') ? cf.slice(0, cf.lastIndexOf('/')) : '';
            let parent: string | null = null;
            for (const f of files)
                for (const s of f.module.source) {
                    const sdir = s.path.includes('/') ? s.path.slice(0, s.path.lastIndexOf('/')) : '';
                    if (dir === sdir || dir.startsWith(sdir + '/'))
                        if (parent === null || f.module.id.length > parent.length)
                            parent = f.module.id;
                }
            if (parent === null)
                parent = files.find(f => f.module.parent === null)?.module.id ?? null;
            const stem = cf.slice(cf.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/i, '');
            const slug = slugify(stem);
            const id = parent !== null ? parent + '.' + slug : slug;
            const valid = isValidId(id) && splitId(id) !== null && splitId(id)!.length <= 12;
            return { file: cf, suggested_parent: parent, suggested_id: valid ? id : null, state: 'planned' };
        });
        const plannedRemaining = files.filter(f => f.module.state === 'planned').map(f => f.module.id);
        const activateCandidates = files.filter(f => f.module.state === 'planned' && f.module.source.length > 0 && f.module.source.every(s => existsSync(join(repoRoot, s.path)))).map(f => f.module.id);
        const apiAdded: ApiDiffRow[] = [];
        const apiRemoved: ApiDiffRow[] = [];
        const breakingApiRemovals: BreakingApiRow[] = [];
        try {
            const tree: TreeSnapshot = JSON.parse(await readFile(join(proj.dir, 'tree.json'), 'utf8'));
            const prev = tree.modules ?? {};
            const refs = new Set<string>();
            for (const f of files)
                for (const d of f.module.deps ?? []) {
                    if (d.from_api !== undefined)
                        refs.add(d.from_api);
                    if (d.to_api !== undefined)
                        refs.add(d.to_api);
                }
            for (const f of files) {
                const before = new Set((prev[f.module.id]?.apis ?? []).map(a => String(a.key ?? '')));
                const now = new Set((f.module.apis ?? []).map(a => apiKey(a)));
                for (const k of now)
                    if (!before.has(k))
                        apiAdded.push({ module: f.module.id, key: k });
                for (const k of before)
                    if (!now.has(k)) {
                        apiRemoved.push({ module: f.module.id, key: k });
                        if (refs.has(k))
                            breakingApiRemovals.push({ module: f.module.id, key: k, reason: '仍被 deps 的 from_api/to_api 引用' });
                    }
            }
        }
        catch {
            /* 无 tree.json（未 build）时跳过 API diff */
        }
        return {
            ok: true,
            changed_files: changed.files.slice(0, 500),
            changed_count: changed.files.length,
            affected: affected.map(f => f.module.id),
            to_review: [...toReview],
            layouts_to_review: layoutsToReview,
            drift_fingerprints: drift,
            new_files: newFiles.slice(0, 100),
            deleted_files: deletedFiles,
            stale_modules: staleModules,
            suggested_modules: suggestedModules,
            planned_remaining: plannedRemaining,
            activate_candidates: activateCandidates,
            api_added: apiAdded,
            api_removed: apiRemoved,
            breaking_api_removals: breakingApiRemovals,
            plan: '1) affected 模块按深度从深到浅重建（重读代码：增删 API、更新介绍、必要时拆分）；2) to_review 的祖先只复核介绍与统计；3) layouts_to_review 的层用 normify_layout_upsert 同步更新渲染数据；4) new_files 按 suggested_modules 用 normify_module_batch 建计划态模块（先 normify_check）；5) stale_modules/deleted_files 确认后删除或修正 source；6) breaking_api_removals 必须迁移引用方；7) planned 落地后用 normify_module_refresh(activate:true)。修复后 normify_validate + normify_build 必须 0 error，建议用 normify_change_close 留痕。',
        };
    });
    register('normify_search', {
        description: '跨 id/名称/介绍/API 检索结构数据。',
        behavior: 'read',
        parameters: params({
            query: str('搜索关键词'),
            topK: numOpt('返回条数（默认 20）'),
            ...projectParams(true),
        }, ['query']),
    }, async (args: SearchArgs) => {
        const proj = await resolve(args);
        const q = String(args.query).toLowerCase();
        const topK = typeof args.topK === 'number' ? args.topK : 20;
        const files: ModuleFile[] = (await loadAllModules(proj.dir)).files;
        const hits: SearchHit[] = [];
        for (const f of files) {
            const m = f.module;
            const hay = (m.id + ' ' + m.name.zh + ' ' + m.name.en + ' ' + m.description.zh + ' ' + m.description.en).toLowerCase();
            if (hay.includes(q)) {
                hits.push({ id: m.id, name: m.name.zh + ' / ' + m.name.en, snippet: m.description.zh.slice(0, 100) });
            }
            for (const a of m.apis ?? []) {
                const key = apiKey(a);
                const ahay = (key + ' ' + a.description.zh + ' ' + a.description.en).toLowerCase();
                if (ahay.includes(q)) {
                    hits.push({ id: m.id, name: m.name.zh + ' / ' + m.name.en, snippet: a.description.zh.slice(0, 100), api: key });
                }
            }
        }
        return { ok: true, count: hits.length, results: hits.slice(0, topK) };
    });
    register('normify_deps_find', {
        description: '反查"谁依赖我"：列出所有指向指定模块（或其 API）的箭头（含跨树），删除/改名前的安全网。',
        behavior: 'read',
        parameters: params({
            to: str('目标模块 id'),
            ...projectParams(true),
        }, ['to']),
    }, async (args: DepsFindArgs) => {
        const proj = await resolve(args);
        const target = String(args.to);
        const files: ModuleFile[] = (await loadAllModules(proj.dir)).files;
        const rows = files.flatMap(f => (f.module.deps ?? [])
            .filter(d => d.to === target || d.to.startsWith(target + '.'))
            .map(d => ({ from: f.module.id, kind: d.kind, to: d.to, from_api: d.from_api ?? null, to_api: d.to_api ?? null })));
        return { ok: true, target, count: rows.length, references: rows };
    });
    register('normify_outline', {
        description: '仅重建 outline.md 派生索引（不重新编译 tree.json）。',
        behavior: 'idempotent',
        parameters: params({
            ...projectParams(true),
        }, []),
    }, async (args: ProjectArgs) => {
        const proj = await resolve(args);
        const b = await buildProject(proj.dir, { requireBilingual: env.requireBilingual });
        if (!b.ok) {
            return { ok: false, errors: b.errors.map(fmtDiag), summary: 'outline 未更新（存在 error）' };
        }
        return { ok: true, hint: 'outline.md 已重建（随 build 一并更新）。' };
    });
    register('normify_layout_get', {
        description: '读取某容器模块的渲染数据（renders/<id>.json）：本层子模块顺序/分组/边提示/阅读导语。',
        behavior: 'read',
        parameters: params({
            id: str('容器模块 id（有子模块的模块）'),
            ...projectParams(true),
        }, ['id']),
    }, async (args: IdArgs) => {
        const proj = await resolve(args);
        const files: ModuleFile[] = (await loadAllModules(proj.dir)).files;
        const id = String(args.id);
        const mf = files.find(f => f.module.id === id);
        if (mf === undefined)
            return { ok: false, error: { code: 'module/not-found', message: '模块不存在：' + id } };
        const children = files.filter(f => f.module.parent === id).map(f => f.module.id).sort();
        if (children.length === 0)
            return { ok: false, error: { code: 'layout/not-container', message: '叶子模块没有可渲染的子层：' + id } };
        const { layout, error }: { layout: LayoutData | null; error: Diagnostic | null } = await loadLayoutFile(proj.dir, id);
        if (error !== null)
            return { ok: false, errors: [fmtDiag(error)] };
        if (layout === null) {
            return { ok: true, has_layout: false, id, file: layoutRelPath(id), children, hint: '该层还没有渲染数据；写模块的同一轮里用 normify_layout_upsert 建立（order / groups / mode / reading）。' };
        }
        const listed = new Set(layout.order ?? []);
        const grouped = new Set((layout.groups ?? []).flatMap(g => g.children));
        return {
            ok: true,
            has_layout: true,
            id,
            file: layoutRelPath(id),
            layout,
            children,
            missing_in_order: children.filter(c => !listed.has(c)),
            missing_in_groups: children.filter(c => !grouped.has(c)),
        };
    });
    register('normify_layout_delete', {
        description: '删除某容器模块的渲染数据（结构模块保留，图谱回退自动布局）。',
        behavior: 'destroy',
        parameters: params({
            id: str('容器模块 id'),
            ...projectParams(true),
        }, ['id']),
    }, async (args: IdArgs) => {
        const proj = await resolve(args);
        const id = String(args.id);
        const removed = await deleteLayoutFile(proj.dir, id);
        return { ok: true, id, removed, hint: removed ? '渲染数据已删除。' : '本来就不存在渲染数据。' };
    });
    register('normify_layout_upsert', {
        description: '写入/覆盖某容器模块的渲染数据（order / groups / mode / reading / edge_hints），写时校验并全量落盘；应与结构模块同轮建立与维护，让每一层的图易读。',
        behavior: 'write',
        parameters: params({
            id: str('容器模块 id（必须已有 ≥1 个子模块）'),
            mode: strOpt('auto | layers | groups | grid（默认 auto：有分组用 groups，兄弟边多用 layers，否则 grid）'),
            max_columns: numOpt('最大列数 1..6（grid / layers 模式）'),
            max_api_rows: numOpt('叶子框内最多展示几行 API（0 = 全部；缺省 6）'),
            reading: l10nOptParam('本层阅读导语（可选，显示在图上方，说明阅读顺序与分组逻辑）'),
            order: strArrayOpt('子模块阅读顺序（建议覆盖全部直接子模块；未列出的自动追加）'),
            groups: layoutGroupParam(),
            edge_hints: layoutHintParam(),
            ...projectParams(true),
        }, ['id']),
    }, async (args: LayoutUpsertArgs) => {
        const proj = await resolve(args, true);
        const files: ModuleFile[] = (await loadAllModules(proj.dir)).files;
        const id = String(args.id);
        const byId = new Map(files.map(f => [f.module.id, f.module]));
        if (!byId.has(id))
            return { ok: false, error: { code: 'module/not-found', message: '模块不存在：' + id } };
        const children = files.filter(f => f.module.parent === id).map(f => f.module.id).sort();
        if (children.length === 0)
            return { ok: false, error: { code: 'layout/not-container', message: '叶子模块没有可渲染的子层：' + id } };
        const childSet = new Set(children);
        const siblingEdges = new Set<string>();
        for (const kid of children) {
            const km = byId.get(kid);
            for (const d of km?.deps ?? [])
                if (childSet.has(d.to) && d.to !== kid)
                    siblingEdges.add(edgeKey(kid, d.to));
        }
        // 工具实参是 deepFreeze 的：先浅拷贝再规范化，避免原地改写
        const data: LayoutData = { schema_version: LAYOUT_SCHEMA_VERSION, id, updated_at: new Date().toISOString() };
        if (args.mode !== undefined)
            data.mode = args.mode;
        if (args.max_columns !== undefined)
            data.max_columns = args.max_columns;
        if (args.max_api_rows !== undefined)
            data.max_api_rows = args.max_api_rows;
        if (args.reading !== undefined)
            data.reading = { ...args.reading };
        if (Array.isArray(args.order))
            data.order = [...args.order];
        if (Array.isArray(args.groups)) {
            data.groups = args.groups.map(g => {
                const raw = { ...g };
                raw.children = Array.isArray(raw.children) ? [...raw.children] : [];
                return raw;
            });
        }
        if (Array.isArray(args.edge_hints))
            data.edge_hints = args.edge_hints.map(h => ({ ...h }));
        const r = l1ValidateLayout(data, id, children, siblingEdges, 'tool:layout_upsert');
        if (r.layout === null) {
            return { ok: false, errors: r.errors.map(fmtDiag), warnings: r.warnings.map(fmtDiag), summary: r.errors.length + ' error（未写入）' };
        }
        const file = await writeLayoutFile(proj.dir, r.layout);
        return { ok: true, file, children, warnings: r.warnings.map(fmtDiag), hint: '渲染数据已写入。继续创作其它层；全部完成后 normify_validate + normify_build（布局会编入 tree.json）。' };
    });
    register('normify_render', {
        description: '把 tree.json 渲染成单文件交互式 HTML（逐层下钻/悬停介绍/深链接/双语切换/多树/API 聚合）。需先 normify_build。',
        behavior: 'idempotent',
        parameters: params({
            out: strOpt('输出文件名（默认 normify.html，写在结构数据目录下）'),
            ...projectParams(true),
        }, []),
    }, async (args: RenderArgs) => {
        const proj = await resolve(args);
        const r = await renderProject(proj.dir, { out: args.out });
        if (!r.ok)
            return { ok: false, errors: r.errors.map(fmtDiag) };
        return {
            ok: true,
            html: r.htmlPath,
            bytes: r.bytes,
            sha256: r.sha256,
            stats: r.summary?.stats ?? null,
            hint: 'HTML 已生成。浏览器打开后：点击模块下钻；悬停看介绍；?lang=en 或 ?lang=zh 切换语言；#module=<id>、#api=<key>、#view=outline 深链直达。',
        };
    });
    register('normify_fingerprint', {
        description: '按与校验器一致的确定性算法计算 source 指纹（写模块 fingerprint 字段前调用）。',
        behavior: 'read',
        parameters: params({
            repoRoot: str('仓库根目录（绝对路径）'),
            source: sourceParam(),
        }),
    }, async (args: FingerprintArgs) => {
        const repoRoot = String(args.repoRoot);
        const sources = Array.isArray(args.source) ? args.source : [];
        const fp = await fingerprintOf(repoRoot, sources);
        return {
            ok: fp.missing.length === 0,
            fingerprint: fp.hash,
            files: sources.map(s => s.path),
            missing: fp.missing,
            algorithm: 'sha256: 按 path 升序，逐个 update(UTF-8(path)) + update(0x00) + update(file bytes)',
        };
    });
    register('normify_brief', {
        description: '开发指引（只读）：给任务描述 / 模块 id / 改动文件，返回目标模块与契约、架构规则约束、影响面、建议新增模块（含路径建议）、验收清单与收尾步骤。建议在每次开发任务开始时先调用。',
        behavior: 'read',
        parameters: params({
            task: strOpt('任务/需求描述（自由文本，用于检索相关模块）'),
            id: strOpt('目标模块 id（明确改动对象时传）'),
            files: strArrayOpt('涉及的文件路径（repo 相对或绝对；用于定位模块）'),
            depth: numOpt('影响面深度 1..4（默认 2）'),
            ...projectParams(true),
        }),
    }, async (args: BriefArgs) => {
        const proj = await resolve(args);
        const files: ModuleFile[] = (await loadAllModules(proj.dir)).files;
        const byId = new Map(files.map(f => [f.module.id, f.module]));
        const fileOf = new Map(files.map(f => [f.module.id, f.file]));
        const childrenOf = new Map<string, string[]>();
        for (const f of files)
            if (f.module.parent !== null) {
                const list = childrenOf.get(f.module.parent) ?? [];
                list.push(f.module.id);
                childrenOf.set(f.module.parent, list);
            }
        const layoutIds = new Set((await listLayoutFiles(proj.dir)).map(rel => rel.replace(/\.json$/, '').replace(/\//g, '.')));
        const policyLoad = await loadPolicyFile(proj.dir);
        const policy = policyLoad.policy;
        const depsIn = new Map<string, { from: string; kind: string }[]>();
        for (const f of files)
            for (const d of f.module.deps ?? []) {
                const list = depsIn.get(d.to) ?? [];
                list.push({ from: f.module.id, kind: d.kind });
                depsIn.set(d.to, list);
            }
        const candidates = new Set<string>();
        const unmatchedFiles: string[] = [];
        if (typeof args.id === 'string' && args.id.trim() !== '') {
            const id = args.id.trim();
            if (!byId.has(id))
                return { ok: false, error: { code: 'module/not-found', message: '模块不存在：' + id } };
            candidates.add(id);
        }
        if (Array.isArray(args.files)) {
            for (const raw of args.files) {
                const p = String(raw).replace(/\\/g, '/').replace(/^\.\//, '');
                const hit = files.find(f => f.module.source.some(s => s.path === p || p.startsWith(s.path + '/') || s.path.startsWith(p + '/')));
                if (hit !== undefined)
                    candidates.add(hit.module.id);
                else
                    unmatchedFiles.push(p);
            }
        }
        const task = typeof args.task === 'string' ? args.task.trim() : '';
        if (task !== '' && candidates.size === 0) {
            const words = task.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
            const scored = files.map(f => {
                const m = f.module;
                const hay = (m.id + ' ' + m.name.zh + ' ' + m.name.en + ' ' + m.description.zh + ' ' + m.description.en + ' ' + (m.tags ?? []).join(' ') + ' ' + (m.apis ?? []).map(a => apiKey(a)).join(' ')).toLowerCase();
                let score = 0;
                for (const w of words)
                    if (hay.includes(w))
                        score++;
                return { id: m.id, score };
            }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 8);
            for (const s of scored)
                candidates.add(s.id);
        }
        const depth = typeof args.depth === 'number' ? Math.max(1, Math.min(4, Math.round(args.depth))) : 2;
        const impact: ImpactSummary = { direct: [], transitive: [], cross_tree: [] };
        const visited = new Set([...candidates]);
        let frontier = [...candidates];
        for (let d = 1; d <= depth; d++) {
            const next: string[] = [];
            for (const id of frontier) {
                for (const ref of depsIn.get(id) ?? []) {
                    if (visited.has(ref.from))
                        continue;
                    visited.add(ref.from);
                    if (d === 1)
                        impact.direct.push(ref.from);
                    else
                        impact.transitive.push(ref.from);
                    const tree = (candidate: string): string => candidate.split('.')[0];
                    for (const c of candidates)
                        if (tree(c) !== tree(ref.from))
                            impact.cross_tree.push(ref.from + ' ← ' + c);
                    next.push(ref.from);
                }
            }
            frontier = next;
        }
        const targets = [...candidates].map(id => {
            const m = byId.get(id)!;
            return {
                id,
                state: m.state ?? 'active',
                name: m.name,
                description: m.description,
                file: fileOf.get(id) ?? null,
                tags: m.tags ?? [],
                source: m.source,
                apis: (m.apis ?? []).map(a => ({ key: apiKey(a), description: a.description })),
                deps_out: (m.deps ?? []).map(d => ({ to: d.to, kind: d.kind, to_api: d.to_api ?? null })),
                deps_in: (depsIn.get(id) ?? []).map(r => ({ from: r.from, kind: r.kind })),
                has_layout: layoutIds.has(id),
                children: childrenOf.get(id) ?? [],
            };
        });
        const policyDiags = policy === null ? [] : evaluatePolicy(policy, { files, byId: new Map(files.map(f => [f.module.id, f])) });
        const violations = policyDiags.filter(d => {
            const s = (d.subject ?? {});
            return candidates.has(String(s.module ?? '')) || candidates.has(String(s.to ?? ''));
        });
        const suggestions: ModuleSuggestion[] = [];
        for (const p of unmatchedFiles.slice(0, 20)) {
            const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
            let parent: string | null = null;
            for (const f of files) {
                for (const s of f.module.source) {
                    const sdir = s.path.includes('/') ? s.path.slice(0, s.path.lastIndexOf('/')) : '';
                    if (dir === sdir || dir.startsWith(sdir + '/')) {
                        if (parent === null || f.module.id.length > parent.length)
                            parent = f.module.id;
                    }
                }
            }
            if (parent === null)
                parent = files.find(f => f.module.parent === null)?.module.id ?? null;
            const stem = p.slice(p.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/i, '');
            const slug = slugify(stem);
            const id = parent !== null ? parent + '.' + slug : slug;
            const valid = isValidId(id) && splitId(id) !== null && splitId(id)!.length <= 12;
            suggestions.push({
                file: p,
                suggested_parent: parent,
                suggested_id: valid ? id : null,
                state: 'planned',
                note: valid ? '先用 normify_check 预检，再用 normify_module_batch/upsert 建计划态模块（source 指向该文件，fingerprint=pending）' : '自动建议的 id 非法或超深，请人工命名',
            });
        }
        const checklist: string[] = [];
        if (targets.some(t => t.state === 'planned'))
            checklist.push('计划态模块：实现 source 指向的文件后调用 normify_module_refresh({ ids: [...], activate: true, repoRoot })');
        if (targets.some(t => t.children.length >= 2 && !t.has_layout))
            checklist.push('该层缺渲染数据：用 normify_layout_upsert 补 order / groups / mode / reading');
        if (violations.length > 0)
            checklist.push('存在架构规则违规：先按 supportedFixes 修正，或经评审调整 policy.yml');
        checklist.push('收尾（0 error 强制）：normify_validate（带 repoRoot）→ normify_build → normify_render');
        checklist.push('建议留痕：normify_change_open → 实现 → normify_change_close');
        const allChanges: ChangeSummaryRow[] = [];
        for (const cid of await listChangeIds(proj.dir)) {
            const c = await loadChangeFile(proj.dir, cid);
            if (c.change !== null)
                allChanges.push({ id: c.change.id, status: c.change.status, title: c.change.title, modules: c.change.modules });
        }
        const openChanges = allChanges.filter(c => c.status === 'proposed' || c.status === 'in_progress');
        const plan = [
            '1) 用 normify_check 预检拟新增模块/依赖（不符合规则先调整设计）',
            '2) 计划态先建树：normify_module_batch 或 normify_module_upsert（state=planned, fingerprint=pending, source 可未落地）',
            '3) 实现代码；结构变化用 normify_module_patch / normify_module_move / normify_layout_upsert',
            '4) 模块落地：normify_module_refresh（ids + activate:true + repoRoot）',
            '5) 收尾：normify_validate（0 error）→ normify_build → normify_render；需要留痕则 normify_change_close',
        ];
        return {
            ok: true,
            task,
            candidates: [...candidates],
            targets,
            impact,
            policy: policy === null ? { exists: false, rule_count: 0 } : { exists: true, rule_count: policy.rules.length, rules: policy.rules.map(r => ({ id: r.id, type: r.type, severity: r.severity ?? 'error' })) },
            violations: violations.map(fmtDiag),
            suggestions,
            open_changes: openChanges,
            checklist,
            plan,
            hint: '按 plan 顺序执行；实现过程中结构性变更随时 normify_sync 复核。',
        };
    });
    register('normify_module_patch', {
        description: '部分更新模块：只传要改的字段（服务端合并后写时 L1 校验）；支持 expect_updated_at 乐观并发与 dry_run；id/uid/parent 不可在此修改（用 normify_module_move）。',
        behavior: 'write',
        parameters: params({
            id: str('模块 id'),
            patch: freeObjectParam('要修改的字段：name/description/source/apis/deps/repository/state/replacement/tags/revision/fingerprint/body 等', true),
            expect_updated_at: strOpt('可选：期望的当前 updated_at；不匹配则拒绝（防止覆盖他人写入）'),
            dry_run: boolOpt('仅校验并返回将写入的文件，不落盘'),
            ...projectParams(true),
        }, ['id', 'patch']),
    }, async (args: ModulePatchArgs) => {
        const proj = await resolve(args);
        const r = await patchModule(proj.dir, String(args.id), {
            ...args.patch,
            ...(typeof args.expect_updated_at === 'string' ? { expect_updated_at: args.expect_updated_at } : {}),
        }, { dryRun: args.dry_run === true });
        if (!r.ok) {
            return { ok: false, dry_run: r.dryRun, errors: r.errors.map(fmtDiag), warnings: r.warnings.map(fmtDiag), summary: r.errors.length + ' error（未写入）' };
        }
        return {
            ok: true,
            dry_run: r.dryRun,
            file: typeof r.detail.file === 'string' ? r.detail.file : (r.file ?? null),
            changed: r.changed,
            warnings: r.warnings.map(fmtDiag),
            hint: r.dryRun ? 'dry_run 通过（未写入）；去掉 dry_run 正式写入。' : '已更新。如代码同时变化，记得 normify_module_refresh 刷新指纹。',
        };
    });
    register('normify_module_batch', {
        description: '批量 upsert/patch 模块：全部 L1 + 结构预检通过才落盘（原子；失败回滚）。计划态建树首选，一轮可写多个模块。',
        behavior: 'write',
        parameters: params({
            items: objArrayParam("批次条目：mode=upsert 传 [{ frontmatter }]；mode=patch 传 [{ patch: { id, patch } }]", true),
            mode: strOpt("'upsert'（默认，整模块写入）| 'patch'（部分字段合并）"),
            dry_run: boolOpt('仅校验并返回将写的文件，不落盘'),
            ...projectParams(true),
        }, ['items']),
    }, async (args: ModuleBatchArgs) => {
        const proj = await resolve(args, true);
        const mode = args.mode === 'patch' ? 'patch' : 'upsert';
        const items = args.items.map(i => ({ ...i }));
        const r = await batchWrite(proj.dir, items, mode, { dryRun: args.dry_run === true });
        if (!r.ok) {
            return { ok: false, dry_run: r.dryRun, errors: r.errors.map(fmtDiag), warnings: r.warnings.map(fmtDiag), summary: r.errors.length + ' error（整批未写入）' };
        }
        return {
            ok: true,
            dry_run: r.dryRun,
            files: r.files,
            count: r.files.length,
            warnings: r.warnings.map(fmtDiag),
            hint: r.dryRun ? 'dry_run 通过（未写入）。' : '整批已写入。继续建树或进入实现阶段（planned → normify_module_refresh activate）。',
        };
    });
    register('normify_module_move', {
        description: '重命名/移动子树：保 uid、级联 children parent、重写全项目 deps.to、迁移模块文件与 renders/*.json；dry_run 先看计划。',
        behavior: 'write',
        parameters: params({
            id: str('要移动的模块 id（子树根）'),
            new_id: strOpt('新 id（重命名/换路径；与 new_parent 至少给一个）'),
            new_parent: strOpt('新父模块 id（换父级；等价于 new_id = new_parent + "." + 原末段）'),
            dry_run: boolOpt('仅返回迁移计划（模块/依赖/渲染数据），不落盘'),
            ...projectParams(true),
        }, ['id']),
    }, async (args: ModuleMoveArgs) => {
        const proj = await resolve(args);
        if (typeof args.new_id !== 'string' && typeof args.new_parent !== 'string') {
            return { ok: false, error: { code: 'module/move-noop', message: '必须提供 new_id 或 new_parent' } };
        }
        const r = await moveModuleTree(proj.dir, String(args.id), {
            newId: typeof args.new_id === 'string' ? args.new_id : undefined,
            newParent: typeof args.new_parent === 'string' ? args.new_parent : undefined,
            dryRun: args.dry_run === true,
        });
        if (!r.ok)
            return { ok: false, dry_run: r.dryRun, errors: r.errors.map(fmtDiag), warnings: r.warnings.map(fmtDiag) };
        return {
            ok: true,
            dry_run: r.dryRun,
            moves: r.moves,
            rewired_deps: r.rewired,
            layouts: r.detail.layouts ?? [],
            changed: r.changed,
            warnings: r.warnings.map(fmtDiag),
            hint: r.dryRun ? 'dry_run 计划如上（未落盘）；确认后去掉 dry_run 执行。移动后建议 normify_validate 复核。' : '移动完成；渲染数据已随迁，建议 normify_validate + normify_build。',
        };
    });
    register('normify_module_refresh', {
        description: '重算模块 fingerprint/revision(git HEAD)/updated_at：planned 模块源码落地后用 activate:true 一键转 active，是"逐个模块完成"的收尾动作。',
        behavior: 'idempotent',
        parameters: params({
            ids: strArrayOpt('要刷新的模块 id 数组'),
            all: boolOpt('刷新全部模块（与 ids 二选一）'),
            repoRoot: str('仓库根目录（计算 fingerprint 与 HEAD）'),
            activate: boolOpt('把已落地的 planned 模块转为 active（默认 false）'),
            dry_run: boolOpt('仅计算并返回结果，不写磁盘'),
            ...projectParams(true),
        }, ['repoRoot']),
    }, async (args: ModuleRefreshArgs) => {
        const proj = await resolve(args);
        const ids = Array.isArray(args.ids) ? args.ids.map(String) : undefined;
        if ((ids === undefined || ids.length === 0) && args.all !== true) {
            return { ok: false, error: { code: 'refresh/no-target', message: '必须提供 ids 或 all:true' } };
        }
        const r = await refreshModules(proj.dir, {
            ids,
            all: args.all === true,
            repoRoot: String(args.repoRoot),
            activate: args.activate === true,
            dryRun: args.dry_run === true,
        });
        if (!r.ok)
            return { ok: false, dry_run: r.dryRun, errors: r.errors.map(fmtDiag), warnings: r.warnings.map(fmtDiag), missing: r.missing };
        return {
            ok: true,
            dry_run: r.dryRun,
            refreshed: r.refreshed,
            missing: r.missing,
            changed: r.changed,
            warnings: r.warnings.map(fmtDiag),
            hint: r.dryRun ? 'dry_run 结果如上（未写入）。' : '指纹/修订已刷新。建议接着 normify_validate（0 error 门禁）。',
        };
    });
    register('normify_change_open', {
        description: '开启一个开发变更（changes/<id>.json，随结构目录一起回档）：记录意图、涉及模块（create/modify/delete/api_add/api_remove）与验收标准；实现完成后用 normify_change_close 收尾（强制 0 error）。',
        behavior: 'write',
        parameters: params({
            id: strOpt('变更 id（默认 YYYY-MM-DD-<title.en slug>）'),
            title: l10nParam('变更标题'),
            intent: l10nParam('变更意图 / 背景'),
            modules: freeObjectParam('涉及模块 { create?: [], modify?: [], delete?: [], api_add?: [{module,key}], api_remove?: [{module,key}] }', true),
            acceptance: strArray('验收标准（≥1 条，close 前逐条自检）'),
            status: strOpt("'proposed' | 'in_progress'（默认 in_progress）"),
            note: strOpt('备注（可选）'),
            ...projectParams(true),
        }, ['title', 'intent', 'modules', 'acceptance']),
    }, async (args: ChangeOpenArgs) => {
        const proj = await resolve(args);
        const title = { ...args.title };
        const intent = { ...args.intent };
        const id = typeof args.id === 'string' && args.id.trim() !== ''
            ? args.id.trim()
            : new Date().toISOString().slice(0, 10) + '-' + slugify(String(title.en || title.zh || 'change'));
        if (!isValidChangeId(id))
            return { ok: false, error: { code: 'change/id-format', message: '变更 id 必须为 YYYY-MM-DD-<slug>：' + id } };
        const exists = await loadChangeFile(proj.dir, id);
        if (exists.change !== null)
            return { ok: false, error: { code: 'change/exists', message: '变更已存在：' + id } };
        const files: ModuleFile[] = (await loadAllModules(proj.dir)).files;
        const byId = new Set(files.map(f => f.module.id));
        const modules = { ...args.modules };
        const refs = [
            ...(modules.create ?? []),
            ...(modules.modify ?? []),
            ...(modules.delete ?? []),
        ];
        const missing = refs.filter(r => !byId.has(r));
        if (missing.length > 0) {
            return { ok: false, error: { code: 'change/module-missing', message: '变更引用的模块不存在：' + missing.join(', ') + '（计划态模块也可以先建）' } };
        }
        const now = new Date().toISOString();
        const data = {
            schema_version: CHANGE_SCHEMA_VERSION,
            id,
            title,
            status: args.status === 'proposed' ? 'proposed' : 'in_progress',
            intent,
            modules,
            acceptance: Array.isArray(args.acceptance) ? [...args.acceptance] : [],
            ...(typeof args.note === 'string' ? { note: args.note } : {}),
            revision: { before: null, after: null },
            created_at: now,
            updated_at: now,
        };
        const r = l1ValidateChange(data, id, 'tool:change_open');
        if (r.change === null)
            return { ok: false, errors: r.errors.map(fmtDiag), warnings: r.warnings.map(fmtDiag) };
        const file = await writeChangeFile(proj.dir, r.change);
        return { ok: true, id, file, status: r.change.status, hint: '变更已开启。按 normify_brief 的计划实现；收尾用 normify_change_close（0 error 强制）。' };
    });
    register('normify_change_update', {
        description: '更新变更日志字段（title/intent/status/acceptance/modules/note）；id/created_at 不可改。关闭请用 normify_change_close。',
        behavior: 'write',
        parameters: params({
            id: str('变更 id'),
            patch: freeObjectParam('要更新的字段（title/intent/status/acceptance/modules/note 等）', true),
            ...projectParams(true),
        }, ['id', 'patch']),
    }, async (args: ChangeUpdateArgs) => {
        const proj = await resolve(args);
        const { change, error } = await loadChangeFile(proj.dir, String(args.id));
        if (error !== null)
            return { ok: false, errors: [fmtDiag(error)] };
        if (change === null)
            return { ok: false, error: { code: 'change/not-found', message: '变更不存在：' + String(args.id) } };
        if (change.status === 'verified')
            return { ok: false, error: { code: 'change/closed', message: '变更已关闭，不能再更新：' + change.id } };
        const patch = { ...args.patch };
        delete patch.id;
        delete patch.created_at;
        delete patch.schema_version;
        const merged = { ...change, ...patch, updated_at: new Date().toISOString() };
        if (merged.status === 'abandoned' && merged.closed_at === undefined)
            merged.closed_at = new Date().toISOString();
        const r = l1ValidateChange(merged, change.id, 'tool:change_update');
        if (r.change === null)
            return { ok: false, errors: r.errors.map(fmtDiag), warnings: r.warnings.map(fmtDiag) };
        const file = await writeChangeFile(proj.dir, r.change);
        return { ok: true, id: r.change.id, file, status: r.change.status, hint: '变更已更新。' };
    });
    register('normify_change_list', {
        description: '列出开发变更（按状态汇总）；传 id 返回完整变更详情。',
        behavior: 'read',
        parameters: params({
            id: strOpt('变更 id（传则返回详情）'),
            status: strOpt('按状态过滤：proposed | in_progress | verified | abandoned'),
            ...projectParams(true),
        }),
    }, async (args: ChangeListArgs) => {
        const proj = await resolve(args);
        if (typeof args.id === 'string' && args.id.trim() !== '') {
            const { change, error } = await loadChangeFile(proj.dir, args.id.trim());
            if (error !== null)
                return { ok: false, errors: [fmtDiag(error)] };
            if (change === null)
                return { ok: false, error: { code: 'change/not-found', message: '变更不存在：' + args.id } };
            return { ok: true, change, file: 'changes/' + change.id + '.json' };
        }
        const out: ChangeListRow[] = [];
        for (const id of await listChangeIds(proj.dir)) {
            const { change } = await loadChangeFile(proj.dir, id);
            if (change === null)
                continue;
            if (typeof args.status === 'string' && args.status !== '' && change.status !== args.status)
                continue;
            out.push({
                id: change.id,
                status: change.status,
                title: change.title,
                modules: change.modules,
                acceptance_count: change.acceptance.length,
                created_at: change.created_at,
                closed_at: change.closed_at ?? null,
            });
        }
        const counts: Record<string, number> = { proposed: 0, in_progress: 0, verified: 0, abandoned: 0 };
        for (const c of out)
            counts[String(c.status)] = (counts[String(c.status)] ?? 0) + 1;
        return { ok: true, count: out.length, counts, changes: out };
    });
    register('normify_change_close', {
        description: '关闭变更（收尾，0 error 强制）：刷新涉及模块指纹/激活 planned → validate → build（可选 render）→ 标记 verified 并写 revision.after。任何一步失败都不关闭。',
        behavior: 'idempotent',
        parameters: params({
            id: str('变更 id'),
            repoRoot: strOpt('仓库根目录（强烈建议提供：启用指纹证据校验与 HEAD 记录）'),
            activate: boolOpt('自动把 create 中已落地的 planned 模块转 active（默认 true）'),
            render: boolOpt('关闭后顺便重新渲染 HTML（默认 false）'),
            note: strOpt('关闭备注（可选）'),
            ...projectParams(true),
        }, ['id']),
    }, async (args: ChangeCloseArgs) => {
        const proj = await resolve(args);
        const r = await closeChange(proj.dir, String(args.id), {
            repoRoot: typeof args.repoRoot === 'string' ? args.repoRoot : undefined,
            activate: args.activate !== false,
            render: args.render === true,
            note: typeof args.note === 'string' ? args.note : undefined,
            requireBilingual: env.requireBilingual,
        });
        return {
            ok: r.ok,
            phase: r.phase,
            ...(r.change !== undefined ? { id: r.change.id, status: r.change.status } : {}),
            errors: r.errors.map(fmtDiag),
            warnings: r.warnings.map(fmtDiag),
            ...(r.refresh !== undefined && r.refresh !== null ? { refresh: r.refresh } : {}),
            ...(r.build !== undefined && r.build !== null ? { build: r.build } : {}),
            ...(r.render !== undefined && r.render !== null ? { render: r.render } : {}),
            ...(r.revision !== undefined ? { revision: r.revision } : {}),
            ...(r.message !== undefined ? { summary: r.message } : {}),
            ...(r.hint !== undefined ? { hint: r.hint } : {}),
            ...(r.file !== undefined ? { file: r.file } : {}),
        };
    });
    register('normify_policy_get', {
        description: '读取项目的架构规则（policy.yml）；不存在时返回完整默认模板与规则参考，供设计阶段安装。',
        behavior: 'read',
        parameters: params({
            ...projectParams(true),
        }),
    }, async (args: ProjectArgs) => {
        const proj = await resolve(args);
        const r = await loadPolicyFile(proj.dir);
        if (r.errors.length > 0)
            return { ok: false, errors: r.errors.map(fmtDiag) };
        const out: PolicyGetOutput = {
            ok: true,
            file: 'policy.yml',
            exists: r.exists,
            policy: r.policy,
            rule_count: r.policy === null ? 0 : r.policy.rules.length,
            reference: policyReference(),
        };
        if (!r.exists)
            out.template = defaultPolicyTemplate();
        return out;
    });
    register('normify_policy_upsert', {
        description: '写入/覆盖架构规则 policy.yml（完整规则集，写时校验规则字段；dry_run 只校验不落盘）。安装后 normify_validate / normify_check 即按规则强制。',
        behavior: 'write',
        parameters: params({
            rules: objArrayParam('规则数组；类型与字段见 normify_policy_get 的 reference/template', true),
            dry_run: boolOpt('仅校验并返回规则数，不写磁盘'),
            ...projectParams(true),
        }, ['rules']),
    }, async (args: PolicyUpsertArgs) => {
        const proj = await resolve(args, true);
        const data = { schema_version: POLICY_SCHEMA_VERSION, updated_at: new Date().toISOString(), rules: args.rules };
        const r = l1ValidatePolicy(data, 'tool:policy_upsert');
        if (r.policy === null)
            return { ok: false, errors: r.errors.map(fmtDiag), warnings: r.warnings.map(fmtDiag), summary: r.errors.length + ' error（未写入）' };
        if (args.dry_run === true)
            return { ok: true, dry_run: true, rule_count: r.policy.rules.length, policy: r.policy };
        const file = await writePolicyFile(proj.dir, r.policy);
        return { ok: true, file, rule_count: r.policy.rules.length, hint: '架构规则已生效：后续 normify_validate / normify_build / normify_check 都会执行。' };
    });
    register('normify_check', {
        description: '设计/编码前预检（只读）：拟建模块与拟加依赖是否违反核心约束或架构规则 policy.yml；建议在动手前先跑。',
        behavior: 'read',
        parameters: params({
            modules: objArrayParam('拟建/调整的模块 [{ id, parent?, state? }]'),
            deps: objArrayParam('拟新增依赖 [{ from, to, kind?, to_api? }]'),
            ...projectParams(true),
        }),
    }, async (args: CheckArgs) => {
        const proj = await resolve(args);
        const modules = Array.isArray(args.modules) ? args.modules.map(m => ({ ...m })) : undefined;
        const deps = Array.isArray(args.deps) ? args.deps.map(d => ({ ...d })) : undefined;
        const r = await checkProposal(proj.dir, { modules, deps });
        return {
            ok: r.ok,
            errors: r.errors.map(fmtDiag),
            warnings: r.warnings.map(fmtDiag),
            summary: r.errors.length + ' error / ' + r.warnings.length + ' warning',
            hint: r.ok ? '预检通过，可以动手实现；完成后用 normify_module_refresh / normify_change_close 收尾。' : '预检未通过：按 supportedFixes 调整设计后再试。',
        };
    });
    register('normify_help', {
        description: 'Normify 模块字段速查（生成器写模块时的字段规范）。',
        behavior: 'read',
        parameters: params({}),
    }, async () => {
        return { ok: true, reference: fieldReference() };
    });
}
