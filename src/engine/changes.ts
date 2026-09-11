import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CHANGE_STATUSES } from './types.js';
import type { ChangeData, ChangeModules, ChangeStatus, Diagnostic, LocalizedText, ModuleFile } from './types.js';
import { diag } from './diag.js';
import { apiKey, isValidId } from './ids.js';
/**
 * 开发变更日志（changes/<id>.json）：放在结构数据目录内，随工程一起回档。
 * 生命周期：open（proposed/in_progress）→ close（verified，强制 0 error）或 abandoned。
 */
export const CHANGE_SCHEMA_VERSION = 1;
export const CHANGES_DIR = 'changes';
const CHANGE_KEYS = ['schema_version', 'id', 'title', 'status', 'intent', 'modules', 'acceptance', 'note', 'revision', 'created_at', 'updated_at', 'closed_at'];
const MODULE_KEYS = ['create', 'modify', 'delete', 'api_add', 'api_remove'];
export function isValidChangeId(id: string): boolean {
    return /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9][a-z0-9-]{0,63}$/.test(id);
}
export function changeFilePath(projectDir: string, id: string): string {
    return join(projectDir, CHANGES_DIR, id + '.json');
}
function isPlain(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isL10n(v: unknown): v is LocalizedText {
    return isPlain(v) && typeof v.zh === 'string' && typeof v.en === 'string' && v.zh.trim() !== '' && v.en.trim() !== '';
}
function isIso(v: unknown): boolean {
    return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}
/** L1：单个变更文件的形状校验。 */
export function l1ValidateChange(data: unknown, id: string, where: string): {
    change: ChangeData | null;
    errors: Diagnostic[];
    warnings: Diagnostic[];
} {
    const errors: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];
    if (!isPlain(data)) {
        errors.push(diag('error', 'change/shape', '变更文件必须为 JSON 对象', { change: id }, { path: where }, ['用 normify_change_open 创建']));
        return { change: null, errors, warnings };
    }
    for (const k of Object.keys(data)) {
        if (!CHANGE_KEYS.includes(k))
            errors.push(diag('error', 'change/unknown-field', '变更文件不支持字段 ' + k, { change: id }, { path: where + '/' + k }, ['删除该字段']));
    }
    if (!isValidChangeId(id))
        errors.push(diag('error', 'change/id-format', '变更 id 必须为 YYYY-MM-DD-<slug>', { change: id }, {}, ['重命名为形如 2026-09-12-add-feature']));
    if (data.schema_version !== CHANGE_SCHEMA_VERSION)
        errors.push(diag('error', 'change/schema-version', 'schema_version 必须为 ' + CHANGE_SCHEMA_VERSION, { change: id }, { value: data.schema_version }, []));
    if (data.id !== id)
        errors.push(diag('error', 'change/id-mismatch', 'data.id 必须等于文件名', { change: id }, { value: data.id }, []));
    if (!isL10n(data.title))
        errors.push(diag('error', 'change/title', 'title 必须为 {zh,en} 非空双语', { change: id }, {}, []));
    if (!isL10n(data.intent))
        errors.push(diag('error', 'change/intent', 'intent 必须为 {zh,en} 非空双语', { change: id }, {}, []));
    if (typeof data.status !== 'string' || !CHANGE_STATUSES.includes(data.status as ChangeStatus)) {
        errors.push(diag('error', 'change/status', 'status 必须为 ' + CHANGE_STATUSES.join(' | '), { change: id }, { value: data.status }, []));
    }
    if (!isIso(data.created_at))
        errors.push(diag('error', 'change/created-at', 'created_at 必须为 ISO 8601', { change: id }, { value: data.created_at }, []));
    if (!isIso(data.updated_at))
        errors.push(diag('error', 'change/updated-at', 'updated_at 必须为 ISO 8601', { change: id }, { value: data.updated_at }, []));
    if (data.closed_at !== undefined && data.closed_at !== null && !isIso(data.closed_at))
        errors.push(diag('error', 'change/closed-at', 'closed_at 必须为 ISO 8601 或 null', { change: id }, { value: data.closed_at }, []));
    if (data.note !== undefined && typeof data.note !== 'string')
        errors.push(diag('error', 'change/note', 'note 必须为字符串', { change: id }, {}, []));
    if (!Array.isArray(data.acceptance) || data.acceptance.length === 0 || (data.acceptance as unknown[]).some(s => typeof s !== 'string' || s.trim() === '')) {
        errors.push(diag('error', 'change/acceptance', 'acceptance 必须为非空字符串数组（验收清单）', { change: id }, {}, ['至少写一条可验证的验收标准']));
    }
    else if (data.acceptance.length > 20) {
        errors.push(diag('error', 'change/acceptance-too-many', 'acceptance 最多 20 条', { change: id }, { count: data.acceptance.length }, []));
    }
    const rev = data.revision as { before?: string | null; after?: string | null } & Record<string, unknown>;
    if (!isPlain(rev)) {
        errors.push(diag('error', 'change/revision', 'revision 必须为 { before, after }', { change: id }, {}, []));
    }
    else {
        for (const key of ['before', 'after']) {
            const v = rev[key];
            if (v !== null && v !== undefined && (typeof v !== 'string' || !/^[a-f0-9]{7,40}$/.test(v))) {
                errors.push(diag('error', 'change/revision-sha', 'revision.' + key + ' 必须为 git SHA 或 null', { change: id }, { value: v }, []));
            }
        }
    }
    const modules = data.modules;
    if (!isPlain(modules)) {
        errors.push(diag('error', 'change/modules', 'modules 必须为对象（create/modify/delete/api_add/api_remove）', { change: id }, {}, []));
    }
    else {
        for (const k of Object.keys(modules)) {
            if (!MODULE_KEYS.includes(k))
                errors.push(diag('error', 'change/modules-unknown', 'modules 不支持字段 ' + k, { change: id }, {}, []));
        }
        for (const key of ['create', 'modify', 'delete']) {
            const list = modules[key];
            if (list === undefined)
                continue;
            if (!Array.isArray(list) || list.some(x => typeof x !== 'string' || !isValidId(x))) {
                errors.push(diag('error', 'change/module-id', key + ' 必须为合法模块 id 数组', { change: id }, {}, []));
            }
            else if (new Set(list).size !== list.length) {
                errors.push(diag('error', 'change/module-id-duplicate', key + ' 中存在重复模块 id', { change: id }, {}, []));
            }
        }
        for (const key of ['api_add', 'api_remove']) {
            const list = modules[key];
            if (list === undefined)
                continue;
            if (!Array.isArray(list) || list.some(x => !isPlain(x) || typeof x.module !== 'string' || !isValidId(x.module) || typeof x.key !== 'string' || x.key.trim() === '')) {
                errors.push(diag('error', 'change/api-ref', key + ' 必须为 [{ module, key }] 数组', { change: id }, {}, []));
            }
        }
    }
    if (errors.length > 0)
        return { change: null, errors, warnings };
    const change: ChangeData = {
        schema_version: CHANGE_SCHEMA_VERSION,
        id,
        title: data.title as LocalizedText,
        status: data.status as ChangeStatus,
        intent: data.intent as LocalizedText,
        modules: modules as ChangeModules,
        acceptance: data.acceptance as string[],
        ...(typeof data.note === 'string' ? { note: data.note } : {}),
        revision: { before: rev.before ?? null, after: rev.after ?? null },
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
        ...(data.closed_at !== undefined ? { closed_at: data.closed_at === null ? null : String(data.closed_at) } : {}),
    };
    if (change.status === 'verified' && (change.closed_at === undefined || change.closed_at === null)) {
        errors.push(diag('error', 'change/verified-closed-at', 'status=verified 的变更必须有 closed_at', { change: id }, {}, []));
    }
    if ((change.status === 'proposed' || change.status === 'in_progress') && change.closed_at !== undefined && change.closed_at !== null) {
        errors.push(diag('error', 'change/open-closed-at', '未关闭的变更 closed_at 必须为空', { change: id }, { value: change.closed_at }, []));
    }
    return errors.length > 0 ? { change: null, errors, warnings } : { change, errors, warnings };
}
export async function listChangeIds(projectDir: string): Promise<string[]> {
    try {
        const entries = await readdir(join(projectDir, CHANGES_DIR), { withFileTypes: true });
        return entries.filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name.slice(0, -5)).sort();
    }
    catch {
        return [];
    }
}
export async function loadChangeFile(projectDir: string, id: string): Promise<{
    change: ChangeData | null;
    error: Diagnostic | null;
}> {
    let text: string;
    try {
        text = await readFile(changeFilePath(projectDir, id), 'utf8');
    }
    catch {
        return { change: null, error: null };
    }
    let data: unknown;
    try {
        data = JSON.parse(text);
    }
    catch (error) {
        return { change: null, error: diag('error', 'change/json-parse', '变更文件 JSON 解析失败：' + String(error instanceof Error ? error.message : error), { change: id }, {}, ['修复 JSON 或重写变更']) };
    }
    const r = l1ValidateChange(data, id, CHANGES_DIR + '/' + id + '.json');
    if (r.change === null)
        return { change: null, error: r.errors[0] ?? diag('error', 'change/invalid', '变更文件无效', { change: id }, {}, []) };
    return { change: r.change, error: null };
}
export async function writeChangeFile(projectDir: string, change: ChangeData): Promise<string> {
    await mkdir(join(projectDir, CHANGES_DIR), { recursive: true });
    await writeFile(changeFilePath(projectDir, change.id), JSON.stringify(change, null, 2) + '\n', 'utf8');
    return CHANGES_DIR + '/' + change.id + '.json';
}
/** L2：全部变更文件与当前模块集的一致性校验。 */
export async function validateChanges(projectDir: string, byId: Map<string, ModuleFile>): Promise<{
    changes: ChangeData[];
    errors: Diagnostic[];
    warnings: Diagnostic[];
}> {
    const errors: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];
    const changes: ChangeData[] = [];
    const ids = await listChangeIds(projectDir);
    let inProgress = 0;
    for (const id of ids) {
        const { change, error } = await loadChangeFile(projectDir, id);
        if (error !== null) {
            errors.push(error);
            continue;
        }
        if (change === null)
            continue;
        changes.push(change);
        if (change.status === 'in_progress')
            inProgress++;
        const refs = [...(change.modules.create ?? []), ...(change.modules.modify ?? []), ...(change.modules.delete ?? [])];
        for (const ref of refs) {
            if (!byId.has(ref)) {
                errors.push(diag('error', 'change/module-missing', '变更引用的模块不存在', { change: id, module: ref }, {}, ['先创建该模块（计划态允许）或修正变更清单']));
            }
        }
        for (const key of ['api_add', 'api_remove'] as const) {
            for (const ref of change.modules[key] ?? []) {
                const target = byId.get(ref.module);
                if (target === undefined) {
                    errors.push(diag('error', 'change/api-module-missing', '变更引用的 API 所属模块不存在', { change: id, module: ref.module }, {}, []));
                }
                else if (key === 'api_remove' && !(target.module.apis ?? []).some(a => apiKey(a) === ref.key)) {
                    warnings.push(diag('warning', 'change/api-already-removed', '要移除的 API 当前不在模块上（可能已移除）', { change: id, module: ref.module, api: ref.key }, {}, []));
                }
            }
        }
    }
    if (inProgress > 1)
        warnings.push(diag('warning', 'change/multiple-in-progress', '同时存在多个 in_progress 变更', {}, { count: inProgress }, ['建议同一时间只推进一个变更，避免结构数据互相覆盖']));
    return { changes, errors, warnings };
}
