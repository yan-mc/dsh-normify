/**
 * Normify 原语面（0.7 目标面，0.6 起可 opt-in）：7 个工具按 op 分派到既有 31 个工具。
 * - 与 DSH 无关（纯规格），由 src/dsh 适配层注册；`toolset: 'core'` 时启用。
 * - op 用 enum 精确约束；参数用已编译 JSON Schema（type/properties/required/additionalProperties）。
 * - dispatch 复用 createNormifyTools() 的 execute，保持与旧面完全同一套领域逻辑。
 */
import { createNormifyTools } from './toolset.js';
import type { NormifyToolSpec, ToolEnv } from './toolset.js';

type Schema = Record<string, unknown>;

function obj(properties: Record<string, Schema>, required: string[] = []): Schema {
    return {
        type: 'object',
        additionalProperties: false,
        properties,
        ...(required.length > 0 ? { required } : {}),
    };
}
function str(description: string, required = false): Schema {
    return { type: 'string', description, ...(required ? {} : {}) };
}
function strReq(description: string): Schema {
    return { type: 'string', description };
}
function strEnum(values: string[], description: string, required = true): Schema {
    return { type: 'string', description, enum: values, ...(required ? {} : {}) };
}
function bool(description: string): Schema {
    return { type: 'boolean', description };
}
function num(description: string): Schema {
    return { type: 'number', description };
}
function arr(description: string, items?: Schema): Schema {
    return { type: 'array', description, ...(items !== undefined ? { items } : { items: { type: 'string', description: '条目' } }) };
}
function objArg(description: string): Schema {
    return { type: 'object', description, additionalProperties: true };
}

const PROJECT_ARGS: Record<string, Schema> = {
    project: str('项目 slug（结构数据目录 = normify-<slug>）'),
    dir: str('结构数据目录绝对路径（与 project 二选一）'),
};

function pick(args: Record<string, unknown>, keys: string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of keys) {
        if (args[key] !== undefined)
            out[key] = args[key];
    }
    return out;
}

/** 7 个原语：project / read / write / check / build / render / change。 */
export function createNormifyPrimitiveTools(env: ToolEnv): NormifyToolSpec[] {
    const full = createNormifyTools(env);
    const byName = new Map(full.map(spec => [spec.name, spec]));
    const run = (name: string, args: Record<string, unknown>): Promise<unknown> => {
        const spec = byName.get(name);
        if (spec === undefined)
            throw new Error('primitive dispatch: missing tool ' + name);
        return spec.execute(args);
    };
    const projectKeys = ['project', 'dir'];

    return [
        {
            name: 'normify_project',
            description: '项目原语（7 原语之一）：op=init 初始化项目（可一步建计划态根模块）/ list 列出全部结构项目 / status 项目模块清单与统计。',
            behavior: 'write',
            parameters: obj({
                op: strEnum(['init', 'list', 'status'], 'init | list | status'),
                ...PROJECT_ARGS,
                root: str('list：搜索根目录（默认插件 rootDir）'),
                root_module: objArg('init：可选的计划态根模块 {id, name:{zh,en}, description:{zh,en}, repository?}'),
            }, ['op']),
            execute: async (raw: unknown) => {
                const a = (raw ?? {}) as Record<string, unknown>;
                switch (a.op) {
                    case 'init':
                        return run('normify_project_init', { ...pick(a, projectKeys), ...(a.root_module !== undefined ? { root: a.root_module } : {}) });
                    case 'list':
                        return run('normify_tree_list', pick(a, ['root']));
                    case 'status':
                        return run('normify_module_list', pick(a, projectKeys));
                    default:
                        throw new Error('normify_project: 未知 op ' + String(a.op));
                }
            },
        },
        {
            name: 'normify_read',
            description: '只读查询原语（7 原语之一）：op=get 读模块 / list 按父级列模块 / search 检索 / deps 反查依赖 / outline 大纲 / brief 开发指引 / layout 读渲染数据 / policy 读架构规则。',
            behavior: 'read',
            parameters: obj({
                op: strEnum(['get', 'list', 'search', 'deps', 'outline', 'brief', 'layout', 'policy'], 'get | list | search | deps | outline | brief | layout | policy'),
                ...PROJECT_ARGS,
                id: str('get/layout：模块 id'),
                parent: str('list：父模块 id'),
                direct_only: bool('list：只返回直接子模块'),
                query: str('search：搜索关键词'),
                topK: num('search：返回条数（默认 20）'),
                to: str('deps：反查目标模块 id'),
                task: str('brief：任务/需求描述'),
                files: arr('brief：涉及的文件路径'),
                depth: num('brief：影响面深度 1..4'),
            }, ['op']),
            execute: async (raw: unknown) => {
                const a = (raw ?? {}) as Record<string, unknown>;
                switch (a.op) {
                    case 'get':
                        return run('normify_module_get', { ...pick(a, projectKeys), id: a.id });
                    case 'list':
                        return run('normify_module_list', { ...pick(a, [...projectKeys, 'parent', 'direct_only']) });
                    case 'search':
                        return run('normify_search', { ...pick(a, projectKeys), query: a.query, topK: a.topK });
                    case 'deps':
                        return run('normify_deps_find', { ...pick(a, projectKeys), to: a.to });
                    case 'outline':
                        return run('normify_outline', pick(a, projectKeys));
                    case 'brief':
                        return run('normify_brief', { ...pick(a, [...projectKeys, 'task', 'files', 'depth']), ...(a.id !== undefined ? { id: a.id } : {}) });
                    case 'layout':
                        return run('normify_layout_get', { ...pick(a, projectKeys), id: a.id });
                    case 'policy':
                        return run('normify_policy_get', pick(a, projectKeys));
                    default:
                        throw new Error('normify_read: 未知 op ' + String(a.op));
                }
            },
        },
        {
            name: 'normify_write',
            description: '写入原语（7 原语之一，事务化）：op=upsert 写单模块 / patch 部分更新 / batch 原子批量 / move 移动 / delete 删除子树 / promote 晋升容器 / layout_upsert 写渲染数据 / layout_delete 删渲染数据。',
            behavior: 'write',
            parameters: obj({
                op: strEnum(['upsert', 'patch', 'batch', 'move', 'delete', 'promote', 'layout_upsert', 'layout_delete'], 'upsert | patch | batch | move | delete | promote | layout_upsert | layout_delete'),
                ...PROJECT_ARGS,
                id: str('patch/move/delete/promote/layout_*：模块 id'),
                frontmatter: objArg('upsert：模块 frontmatter 对象'),
                body: str('upsert：Markdown 正文'),
                expect_updated_at: str('upsert/patch：并发保护'),
                dry_run: bool('只预演不落盘'),
                items: arr('batch：批量条目（upsert 传 [{frontmatter}]；patch 传 [{patch:{id,patch}}]）', objArg('批次条目')),
                mode: strEnum(['upsert', 'patch'], 'batch 模式（默认 upsert）', false),
                patch: objArg('patch：要改的字段'),
                new_id: str('move：新 id'),
                new_parent: str('move：新父模块 id'),
                order: arr('layout_upsert：子模块顺序'),
                groups: arr('layout_upsert：视觉分组', objArg('分组')),
                reading: objArg('layout_upsert：阅读导语 {zh,en}'),
                layout_mode: strEnum(['auto', 'layers', 'groups', 'grid'], 'layout_upsert：布局模式', false),
                max_columns: num('layout_upsert：最大列数 1..6'),
                max_api_rows: num('layout_upsert：叶子 API 最大展示行数'),
                edge_hints: arr('layout_upsert：边绘制提示', objArg('边提示')),
            }, ['op']),
            execute: async (raw: unknown) => {
                const a = (raw ?? {}) as Record<string, unknown>;
                const base = pick(a, projectKeys);
                switch (a.op) {
                    case 'upsert':
                        return run('normify_module_upsert', { ...base, frontmatter: a.frontmatter, body: a.body, expect_updated_at: a.expect_updated_at, dry_run: a.dry_run });
                    case 'patch':
                        return run('normify_module_patch', { ...base, id: a.id, patch: a.patch, expect_updated_at: a.expect_updated_at, dry_run: a.dry_run });
                    case 'batch':
                        return run('normify_module_batch', { ...base, items: a.items, mode: a.mode, dry_run: a.dry_run });
                    case 'move':
                        return run('normify_module_move', { ...base, id: a.id, new_id: a.new_id, new_parent: a.new_parent, dry_run: a.dry_run });
                    case 'delete':
                        return run('normify_module_delete', { ...base, id: a.id });
                    case 'promote':
                        return run('normify_module_promote', { ...base, id: a.id });
                    case 'layout_upsert':
                        return run('normify_layout_upsert', {
                            ...base,
                            id: a.id,
                            ...(a.layout_mode !== undefined ? { mode: a.layout_mode } : {}),
                            max_columns: a.max_columns,
                            max_api_rows: a.max_api_rows,
                            order: a.order,
                            groups: a.groups,
                            reading: a.reading,
                            edge_hints: a.edge_hints,
                        });
                    case 'layout_delete':
                        return run('normify_layout_delete', { ...base, id: a.id });
                    default:
                        throw new Error('normify_write: 未知 op ' + String(a.op));
                }
            },
        },
        {
            name: 'normify_check',
            description: '校验/预检原语（7 原语之一，只读）：op=validate 全项目 L2 / check 拟建模块预检 / drift git 漂移与增量同步规划 / policy 读架构规则。',
            behavior: 'read',
            parameters: obj({
                op: strEnum(['validate', 'check', 'drift', 'policy'], 'validate | check | drift | policy'),
                ...PROJECT_ARGS,
                repoRoot: str('validate/drift：仓库根目录（启用证据校验 / 定位 git 变更）'),
                diff: str('drift：git diff 范围（默认 HEAD）'),
                modules: arr('check：拟建/调整模块 [{id,parent?,state?}]', objArg('模块条目')),
                deps: arr('check：拟新增依赖 [{from,to,kind?,to_api?}]', objArg('依赖条目')),
            }, ['op']),
            execute: async (raw: unknown) => {
                const a = (raw ?? {}) as Record<string, unknown>;
                const base = pick(a, projectKeys);
                switch (a.op) {
                    case 'validate':
                        return run('normify_validate', { ...base, repoRoot: a.repoRoot });
                    case 'check':
                        return run('normify_check', { ...base, modules: a.modules, deps: a.deps });
                    case 'drift':
                        return run('normify_sync', { ...base, repoRoot: a.repoRoot, diff: a.diff });
                    case 'policy':
                        return run('normify_policy_get', base);
                    default:
                        throw new Error('normify_check: 未知 op ' + String(a.op));
                }
            },
        },
        {
            name: 'normify_build',
            description: '编译原语（7 原语之一）：op=build 校验并编译五件产物（含结构 SBOM）与回执链 / verify|sbom 只校验已有产物哈希（不重编译）。',
            behavior: 'idempotent',
            parameters: obj({
                op: strEnum(['build', 'verify', 'sbom'], 'build | verify | sbom'),
                ...PROJECT_ARGS,
                repoRoot: str('build：仓库根目录（启用证据校验）'),
            }, ['op']),
            execute: async (raw: unknown) => {
                const a = (raw ?? {}) as Record<string, unknown>;
                const base = pick(a, projectKeys);
                if (a.op === 'build')
                    return run('normify_build', { ...base, repoRoot: a.repoRoot });
                if (a.op === 'verify' || a.op === 'sbom')
                    return run('normify_build', { ...base, verify_only: true });
                throw new Error('normify_build: 未知 op ' + String(a.op));
            },
        },
        {
            name: 'normify_render',
            description: '渲染原语（7 原语之一）：op=render 生成单文件交互式架构图（normify.html）。',
            behavior: 'idempotent',
            parameters: obj({
                op: strEnum(['render'], 'render'),
                ...PROJECT_ARGS,
                out: str('输出文件名（纯文件名，默认 normify.html）'),
            }, ['op']),
            execute: async (raw: unknown) => {
                const a = (raw ?? {}) as Record<string, unknown>;
                if (a.op !== 'render')
                    throw new Error('normify_render: 未知 op ' + String(a.op));
                return run('normify_render', { ...pick(a, projectKeys), out: a.out });
            },
        },
        {
            name: 'normify_change',
            description: '变更原语（7 原语之一）：op=open 开启变更 / update 更新 / list 列表 / close 关闭（0 error 强制，刷新指纹并编译）。',
            behavior: 'write',
            parameters: obj({
                op: strEnum(['open', 'update', 'list', 'close'], 'open | update | list | close'),
                ...PROJECT_ARGS,
                id: str('update/list(传则详情)/close：变更 id'),
                title: objArg('open：标题 {zh,en}'),
                intent: objArg('open：意图 {zh,en}'),
                modules: objArg('open：涉及模块 {create,modify,delete,api_add,api_remove}'),
                acceptance: arr('open：验收标准（纯字符串数组）'),
                status: strEnum(['proposed', 'in_progress', 'verified', 'abandoned'], 'open/list：状态过滤', false),
                note: str('备注'),
                patch: objArg('update：要更新的字段'),
                repoRoot: str('close：仓库根目录'),
                activate: bool('close：自动激活 planned 模块（默认 true）'),
                render: bool('close：关闭后重新渲染 HTML'),
            }, ['op']),
            execute: async (raw: unknown) => {
                const a = (raw ?? {}) as Record<string, unknown>;
                const base = pick(a, projectKeys);
                switch (a.op) {
                    case 'open':
                        return run('normify_change_open', { ...base, id: a.id, title: a.title, intent: a.intent, modules: a.modules, acceptance: a.acceptance, status: a.status, note: a.note });
                    case 'update':
                        return run('normify_change_update', { ...base, id: a.id, patch: a.patch });
                    case 'list':
                        return run('normify_change_list', { ...base, id: a.id, status: a.status });
                    case 'close':
                        return run('normify_change_close', { ...base, id: a.id, repoRoot: a.repoRoot, activate: a.activate, render: a.render, note: a.note });
                    default:
                        throw new Error('normify_change: 未知 op ' + String(a.op));
                }
            },
        },
    ];
}
