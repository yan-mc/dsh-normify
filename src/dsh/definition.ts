/**
 * DSH 工具定义构造（与 0.2.x `defineTool()` 的输出契约等价，但不 import dsh-tools 运行时——见 ADR-0010）。
 * 职责：真实 output schema、参数校验、presentCall/presentResult、presentationMeta。
 */
import type { NormifyToolSpec } from '../core/toolset.js';

/** dsh-tools 0.2.x 支持的 JSON Schema 子集（与 core 编译器的产出一致）。 */
type JsonSchema = Record<string, unknown>;

export interface ContentBlock {
    type: string;
    text?: string;
}

export interface ToolCallView {
    card: 'generic' | 'terminal' | 'diff';
    title: string;
    kind?: string;
    rawInput?: unknown;
    content?: ContentBlock[];
    locations?: { path: string; line?: number }[];
}

export interface ToolResultView {
    card: 'generic';
    title?: string;
    content?: ContentBlock[];
}

export interface ToolResultLike {
    content: ContentBlock[];
    isError: boolean;
    meta?: unknown;
}

export interface NormifyToolDefinition {
    name: string;
    description: string;
    parameters?: JsonSchema;
    output: {
        schema: JsonSchema;
        render: (args: unknown, value: unknown) => ContentBlock[];
        presentationMeta?: (args: unknown, value: unknown) => unknown;
    };
    execute: (args: unknown) => Promise<unknown>;
    isConcurrencySafe?: (args: unknown) => boolean;
    presentCall?: (args: unknown) => ToolCallView | undefined;
    presentResult?: (args: unknown, result: ToolResultLike) => ToolResultView | undefined;
}

/** 统一 output schema：所有工具返回 {ok, ...} 对象；具体字段用宽松开放对象承载。 */
const OUTPUT_SCHEMA: JsonSchema = {
    type: 'object',
    additionalProperties: true,
    properties: {
        ok: { type: 'boolean', description: '是否成功' },
        summary: { type: 'string', description: '一行摘要（人类可读）' },
        count: { type: 'number', description: '本次操作涉及的条目数' },
        errors: { type: 'array', items: { type: 'string' }, description: '错误诊断（格式化文本）' },
        warnings: { type: 'array', items: { type: 'string' }, description: '警告（格式化文本）' },
        hint: { type: 'string', description: '下一步建议' },
    },
};

/** 工具中文短标题（presentCall/presentResult 用；保持与工具语义一致）。 */
const TITLES: Record<string, string> = {
    normify_help: 'Normify 速查',
    normify_tree_list: '列出结构项目',
    normify_module_get: '读取模块',
    normify_module_list: '列出模块',
    normify_search: '检索结构',
    normify_deps_find: '反查依赖',
    normify_outline: '生成大纲',
    normify_project_init: '初始化项目',
    normify_module_upsert: '写入模块',
    normify_module_batch: '批量写入模块',
    normify_module_delete: '删除模块',
    normify_module_promote: '晋升容器',
    normify_module_patch: '更新模块',
    normify_module_move: '移动模块',
    normify_module_refresh: '刷新指纹',
    normify_layout_get: '读取渲染数据',
    normify_layout_upsert: '写入渲染数据',
    normify_layout_delete: '删除渲染数据',
    normify_validate: '全项目校验',
    normify_build: '编译结构产物',
    normify_render: '渲染架构图',
    normify_fingerprint: '计算指纹',
    normify_sync: '增量同步规划',
    normify_brief: '开发指引',
    normify_check: '设计预检',
    normify_change_open: '开启变更',
    normify_change_update: '更新变更',
    normify_change_list: '变更列表',
    normify_change_close: '关闭变更',
    normify_policy_get: '读取架构规则',
    normify_policy_upsert: '写入架构规则',
};

const CALL_KIND: Record<string, string> = {
    read: 'read',
    write: 'edit',
    destroy: 'delete',
    idempotent: 'other',
};

function titleOf(spec: NormifyToolSpec): string {
    return TITLES[spec.name] ?? spec.name.replace(/^normify_/, '');
}

/** 提取 call 卡片的 salientInput 与文件位置（不展开全部参数）。 */
function callPresentation(args: unknown): { rawInput?: unknown; locations?: { path: string; line?: number }[] } {
    if (args === null || typeof args !== 'object')
        return {};
    const a = args as Record<string, unknown>;
    const printed: Record<string, unknown> = {};
    for (const key of ['id', 'project', 'dir', 'parent', 'topic', 'query', 'task', 'op', 'mode'])
        if (a[key] !== undefined)
            printed[key] = a[key];
    const locations: { path: string; line?: number }[] = [];
    const source = (a.source ?? (a.frontmatter as Record<string, unknown> | undefined)?.source) as unknown;
    if (Array.isArray(source)) {
        for (const entry of source.slice(0, 8)) {
            if (entry !== null && typeof entry === 'object' && typeof (entry as Record<string, unknown>).path === 'string') {
                const e = entry as Record<string, unknown>;
                locations.push({ path: String(e.path), ...(typeof e.line === 'number' ? { line: e.line } : {}) });
            }
        }
    }
    return {
        ...(Object.keys(printed).length > 0 ? { rawInput: printed } : {}),
        ...(locations.length > 0 ? { locations } : {}),
    };
}

function summarize(value: unknown): { ok: boolean | null; summary: string | null; count: number | null } {
    if (value === null || typeof value !== 'object')
        return { ok: null, summary: null, count: null };
    const v = value as Record<string, unknown>;
    const ok = typeof v.ok === 'boolean' ? v.ok : null;
    let summary: string | null = null;
    if (typeof v.summary === 'string')
        summary = v.summary;
    else if (typeof v.error === 'object' && v.error !== null && typeof (v.error as Record<string, unknown>).message === 'string')
        summary = String((v.error as Record<string, unknown>).message);
    else if (typeof v.hint === 'string')
        summary = v.hint;
    const count = typeof v.count === 'number' ? v.count : null;
    return { ok, summary, count };
}

/** 输出摘要（presentationMeta）：只保留可 JSON 化的标量，供 UI replay。 */
export function presentationMeta(_args: unknown, value: unknown): unknown {
    const { ok, summary, count } = summarize(value);
    const error = (value !== null && typeof value === 'object' ? (value as Record<string, unknown>).error : undefined) as Record<string, unknown> | undefined;
    return {
        ...(ok !== null ? { ok } : {}),
        ...(summary !== null ? { summary: summary.slice(0, 240) } : {}),
        ...(count !== null ? { count } : {}),
        ...(error !== undefined && typeof error.code === 'string' ? { error_code: error.code } : {}),
    };
}

/* ------------------------------------------------------------------ */
/* 参数校验：dsh-tools 0.2.1 JSON Schema 子集（defineTool 等价校验）    */
/* ------------------------------------------------------------------ */

function isValidJsonSchemaValue(schema: JsonSchema, value: unknown, path: string, out: string[]): void {
    if (schema.oneOf !== undefined) {
        const branches = schema.oneOf as JsonSchema[];
        const branchErrors: string[][] = [];
        let pass = 0;
        for (const branch of branches) {
            const errs: string[] = [];
            isValidJsonSchemaValue(branch, value, path, errs);
            branchErrors.push(errs);
            if (errs.length === 0)
                pass++;
        }
        if (pass !== 1) {
            const detail = branchErrors.map((e, i) => '[' + i + '] ' + (e[0] ?? 'ok')).join('; ');
            out.push(`${path} must match exactly one oneOf branch（命中 ${pass} 个）: ${detail}`);
        }
        return;
    }
    if (schema.type !== undefined) {
        const type = schema.type as string;
        const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'number') : typeof value;
        const ok = type === actual || (type === 'number' && actual === 'integer') || (type === 'integer' && actual === 'number' && Number.isInteger(value));
        if (!ok) {
            out.push(`${path} must be ${type} (received ${actual})`);
            return;
        }
    }
    if (schema.enum !== undefined) {
        const allowed = schema.enum as unknown[];
        if (!allowed.some(item => JSON.stringify(item) === JSON.stringify(value)))
            out.push(`${path} must be one of ${allowed.map(a => JSON.stringify(a)).join(' | ')}`);
        return;
    }
    if (schema.const !== undefined) {
        if (JSON.stringify(schema.const) !== JSON.stringify(value))
            out.push(`${path} must equal ${JSON.stringify(schema.const)}`);
        return;
    }
    if (schema.type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
        const required = Array.isArray(schema.required) ? schema.required as string[] : [];
        for (const key of required) {
            if (!(key in record))
                out.push(`${path}.${key} is required`);
        }
        for (const [key, propSchema] of Object.entries(properties)) {
            if (key in record)
                isValidJsonSchemaValue(propSchema, record[key], `${path}.${key}`, out);
        }
        if (schema.additionalProperties === false) {
            for (const key of Object.keys(record)) {
                if (!(key in properties))
                    out.push(`${path}.${key} is not a declared parameter`);
            }
        }
    }
    else if (schema.type === 'array' && Array.isArray(value)) {
        const items = schema.items as JsonSchema | undefined;
        if (items !== undefined)
            value.forEach((item, i) => isValidJsonSchemaValue(items, item, `${path}[${i}]`, out));
    }
}

/** 校验工具实参；返回违规清单（空 = 通过）。 */
export function validateToolArgs(parameters: JsonSchema | undefined, args: unknown): string[] {
    if (parameters === undefined)
        return [];
    const out: string[] = [];
    isValidJsonSchemaValue(parameters, args, '$', out);
    return out;
}

/* ------------------------------------------------------------------ */
/* 工具定义                                                            */
/* ------------------------------------------------------------------ */

export function toToolDefinition(spec: NormifyToolSpec): NormifyToolDefinition {
    const title = titleOf(spec);
    const kind = CALL_KIND[spec.behavior] ?? 'other';
    const definition: NormifyToolDefinition = {
        name: spec.name,
        description: spec.description,
        ...(spec.parameters !== undefined ? { parameters: spec.parameters as unknown as JsonSchema } : {}),
        output: {
            schema: OUTPUT_SCHEMA,
            // model-facing 文本：保持 0.5.x 的 JSON 文本输出语义（结构化值仍在 output.schema 约束下）
            render: (_args, value) => [
                { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
            ],
            presentationMeta,
        },
        async execute(args) {
            // 不在适配层强制 schema 校验：core 工具先用 required 检查（args/missing），
            // 再由 L1/领域校验给出可修复的精确诊断（如 acceptance 第 N 条、label 超长）。
            // 若在此处按 JSON Schema 拦截，会把这类诊断变成通用 "invalid tool arguments"，实测会回退 0.5.3/0.5.4 的体验。
            // 严格 schema 校验保留给 `validateToolArgs()`（测试/CLI --strict 使用）。
            return spec.execute(args);
        },
        ...(spec.behavior === 'read' ? { isConcurrencySafe: (_args: unknown) => true } : {}),
        presentCall(args) {
            const extra = callPresentation(args);
            return {
                card: 'generic',
                title,
                kind,
                ...(extra.rawInput !== undefined ? { rawInput: extra.rawInput } : {}),
                ...(extra.locations !== undefined ? { locations: extra.locations } : {}),
            };
        },
        presentResult(args, result) {
            const meta = (result.meta ?? null) as Record<string, unknown> | null;
            if (meta === null || typeof meta !== 'object')
                return { card: 'generic' };
            const ok = meta.ok !== false;
            const text = typeof meta.summary === 'string' && meta.summary !== ''
                ? meta.summary
                : ok ? '完成' : '失败：' + String(meta.error_code ?? 'unknown');
            return {
                card: 'generic',
                title: title + (ok ? ' · 完成' : ' · 失败'),
                content: [{ type: 'text', text: String(text).slice(0, 400) }],
            };
        },
    };
    return definition;
}
