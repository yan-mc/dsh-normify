import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify, YAMLParseError } from 'yaml';
import { DEP_KINDS, MODULE_STATES, POLICY_RULE_TYPES } from './types.js';
import { diag } from './diag.js';
import { depthOf, treeOf } from './ids.js';
/**
 * 架构规则（policy.yml）：项目设计阶段安装，`normify_validate` 强制执行。
 * 规则类型：forbid-dependency / dependency-direction / acyclic / max-depth / cross-tree / naming。
 * 缺失 policy.yml 的项目记 warning（policy/missing），不影响旧数据兼容。
 */
export const POLICY_SCHEMA_VERSION = 1;
const RULE_KEYS = ['id', 'type', 'severity', 'enabled', 'message', 'from', 'to', 'kind', 'fromState', 'toState', 'layers', 'allowSameLayer', 'allowBackward', 'scope', 'includeCrossTree', 'maxDepth', 'mode', 'pattern'];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PATTERN_CHARS = /^[a-z0-9.*-]+$/;
export function policyFilePath(projectDir) {
    return join(projectDir, 'policy.yml');
}
/** id 模式匹配：`*` 恰一段、`**` 任意段（含零段），其余精确匹配。 */
export function matchIdPattern(pattern, id) {
    const p = pattern.split('.');
    const s = id.split('.');
    const memo = new Map();
    const walk = (pi, si) => {
        const key = pi + ':' + si;
        const hit = memo.get(key);
        if (hit !== undefined)
            return hit;
        let result;
        if (pi === p.length)
            result = si === s.length;
        else if (p[pi] === '**')
            result = walk(pi + 1, si) || (si < s.length && walk(pi, si + 1));
        else if (si >= s.length)
            result = false;
        else if (p[pi] === '*')
            result = walk(pi + 1, si + 1);
        else
            result = p[pi] === s[si] && walk(pi + 1, si + 1);
        memo.set(key, result);
        return result;
    };
    return walk(0, 0);
}
function anyMatch(patterns, id) {
    if (patterns === undefined || patterns.length === 0)
        return true;
    for (const p of patterns)
        if (matchIdPattern(p, id))
            return true;
    return false;
}
function effectiveState(m) {
    return m.state ?? 'active';
}
/** 默认规则模板（项目创建时写入；含两条启用的基础规则与全部类型的注释示例）。 */
export function defaultPolicyTemplate() {
    return `# Normify 架构规则（policy.yml）
# 在项目设计阶段安装，normify_validate 强制执行；severity: error（默认，阻断）| warning（提示）。
# 规则类型：forbid-dependency | dependency-direction | acyclic | max-depth | cross-tree | naming
# id 模式：* 单段、** 任意段；例如 dsh-normify.engine.** 匹配引擎下全部模块。
schema_version: 1
updated_at: "${new Date().toISOString()}"
rules:
  # 基础规则 1：依赖图禁止环（含跨树，自环由核心校验拦截）
  - id: core-acyclic
    type: acyclic
    severity: error
    includeCrossTree: true
  # 基础规则 2：不新增指向已废弃模块的依赖（存量记 warning，便于迁移）
  - id: core-no-deprecated-target
    type: forbid-dependency
    from: ["**"]
    to: ["**"]
    toState: deprecated
    severity: warning

  # ---- 以下为完整规则集的示例，按项目需要取消注释/改写 ----
  # 依赖方向：层顺序 = 允许方向（前 → 后），同层是否允许由 allowSameLayer 控制
  # - id: layer-order
  #   type: dependency-direction
  #   severity: error
  #   allowSameLayer: true
  #   layers:
  #     - { name: engine,  match: ["<tree>.engine.**", "<tree>.engine"] }
  #     - { name: surface, match: ["<tree>.tools.**", "<tree>.tools", "<tree>.skill.**"] }
  #     - { name: boot,    match: ["<tree>.bootstrap.**", "<tree>.build"] }
  # 禁止/只允许某些依赖
  # - id: no-ui-to-core
  #   type: forbid-dependency
  #   from: ["<tree>.ui.**"]
  #   to: ["<tree>.engine.**"]
  #   kind: [call, reference]
  # 跨树依赖策略：forbid 禁止 / require-to-api 必须写 to_api / allow 允许
  # - id: cross-tree-api
  #   type: cross-tree
  #   mode: require-to-api
  # 深度上限（含树名段）
  # - id: depth-limit
  #   type: max-depth
  #   maxDepth: 10
  #   scope: ["<tree>.ui.**"]
  # 命名约束：作用域内每个 id 段必须匹配该正则
  # - id: naming-no-underscore
  #   type: naming
  #   pattern: "^[a-z][a-z0-9-]*$"
  #   scope: ["<tree>.**"]
`;
}
function isPlain(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isL10n(v) {
    return isPlain(v) && typeof v.zh === 'string' && typeof v.en === 'string' && v.zh.trim() !== '' && v.en.trim() !== '';
}
function validPatternList(v) {
    return Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string' && x.length > 0 && PATTERN_CHARS.test(x));
}
/** L1：policy.yml 结构与规则字段校验。 */
export function l1ValidatePolicy(data, where) {
    const errors = [];
    const warnings = [];
    if (!isPlain(data)) {
        errors.push(diag('error', 'policy/shape', 'policy.yml 必须为映射对象', { path: where }, {}, ['参照默认模板重写']));
        return { policy: null, errors, warnings };
    }
    for (const k of Object.keys(data)) {
        if (!['schema_version', 'updated_at', 'rules'].includes(k))
            errors.push(diag('error', 'policy/unknown-field', 'policy.yml 不支持字段 ' + k, { path: where + '/' + k }, {}, ['删除该字段']));
    }
    if (data.schema_version !== POLICY_SCHEMA_VERSION)
        errors.push(diag('error', 'policy/schema-version', 'schema_version 必须为 ' + POLICY_SCHEMA_VERSION, { path: where }, { value: data.schema_version }, []));
    if (typeof data.updated_at !== 'string' || Number.isNaN(Date.parse(data.updated_at)))
        errors.push(diag('error', 'policy/updated-at', 'updated_at 必须为 ISO 8601 时间', { path: where }, { value: data.updated_at }, []));
    if (!Array.isArray(data.rules)) {
        errors.push(diag('error', 'policy/rules-shape', 'rules 必须为数组', { path: where }, {}, []));
        return { policy: null, errors, warnings };
    }
    const rules = [];
    const seen = new Set();
    let i = 0;
    for (const raw of data.rules) {
        const at = where + '/rules/' + i;
        const errorsBefore = errors.length;
        i++;
        if (!isPlain(raw)) {
            errors.push(diag('error', 'policy/rule-shape', 'rule 必须为对象', { path: at }, {}, []));
            continue;
        }
        for (const k of Object.keys(raw)) {
            if (!RULE_KEYS.includes(k))
                errors.push(diag('error', 'policy/rule-unknown-field', 'rule 不支持字段 ' + k, { path: at }, {}, []));
        }
        const id = raw.id;
        if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
            errors.push(diag('error', 'policy/rule-id', 'rule.id 必须为 kebab-case 字符串', { path: at + '/id' }, { value: id }, []));
            continue;
        }
        if (seen.has(id)) {
            errors.push(diag('error', 'policy/rule-id-duplicate', 'rule.id 重复', { path: at + '/id' }, { value: id }, []));
            continue;
        }
        seen.add(id);
        const type = raw.type;
        if (typeof type !== 'string' || !POLICY_RULE_TYPES.includes(type)) {
            errors.push(diag('error', 'policy/rule-type', 'rule.type 必须为 ' + POLICY_RULE_TYPES.join(' | '), { path: at + '/type' }, { value: type }, []));
            continue;
        }
        if (raw.severity !== undefined && raw.severity !== 'error' && raw.severity !== 'warning')
            errors.push(diag('error', 'policy/rule-severity', "severity 必须为 'error' | 'warning'", { path: at + '/severity' }, { value: raw.severity }, []));
        if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean')
            errors.push(diag('error', 'policy/rule-enabled', 'enabled 必须为布尔值', { path: at + '/enabled' }, {}, []));
        if (raw.message !== undefined && !isL10n(raw.message))
            errors.push(diag('error', 'policy/rule-message', 'message 必须为 {zh,en} 非空双语', { path: at + '/message' }, {}, []));
        const ruleType = type;
        if ((raw.from !== undefined && !validPatternList(raw.from)) || (raw.to !== undefined && !validPatternList(raw.to)) || (raw.scope !== undefined && !validPatternList(raw.scope))) {
            errors.push(diag('error', 'policy/rule-patterns', 'from/to/scope 必须为非空 id 模式数组（字符集 a-z0-9.*-）', { path: at }, {}, []));
        }
        if (raw.kind !== undefined && (!Array.isArray(raw.kind) || raw.kind.some(k => typeof k !== 'string' || !DEP_KINDS.includes(k)))) {
            errors.push(diag('error', 'policy/rule-kind', 'kind 必须为 ' + DEP_KINDS.join(' | ') + ' 数组', { path: at }, {}, []));
        }
        for (const key of ['fromState', 'toState']) {
            if (raw[key] !== undefined && (typeof raw[key] !== 'string' || !MODULE_STATES.includes(raw[key]))) {
                errors.push(diag('error', 'policy/rule-state', key + ' 必须为 ' + MODULE_STATES.join(' | '), { path: at + '/' + key }, {}, []));
            }
        }
        if (ruleType === 'forbid-dependency') {
            if (raw.from === undefined && raw.to === undefined && raw.fromState === undefined && raw.toState === undefined) {
                errors.push(diag('error', 'policy/rule-forbid-empty', 'forbid-dependency 至少需要 from/to/fromState/toState 之一', { path: at }, {}, []));
            }
        }
        else if (ruleType === 'dependency-direction') {
            const layers = raw.layers;
            if (!Array.isArray(layers) || layers.length < 2) {
                errors.push(diag('error', 'policy/rule-layers', 'dependency-direction 需要 ≥2 个 layer', { path: at + '/layers' }, {}, []));
            }
            else {
                let li = 0;
                for (const layer of layers) {
                    const lat = at + '/layers/' + li;
                    li++;
                    if (!isPlain(layer) || typeof layer.name !== 'string' || layer.name.trim() === '' || !validPatternList(layer.match)) {
                        errors.push(diag('error', 'policy/rule-layer-shape', 'layer 需要 { name, match[] }', { path: lat }, {}, []));
                    }
                }
            }
            for (const key of ['allowSameLayer', 'allowBackward']) {
                if (raw[key] !== undefined && typeof raw[key] !== 'boolean')
                    errors.push(diag('error', 'policy/rule-boolean', key + ' 必须为布尔值', { path: at + '/' + key }, {}, []));
            }
        }
        else if (ruleType === 'acyclic') {
            if (raw.includeCrossTree !== undefined && typeof raw.includeCrossTree !== 'boolean')
                errors.push(diag('error', 'policy/rule-boolean', 'includeCrossTree 必须为布尔值', { path: at + '/includeCrossTree' }, {}, []));
        }
        else if (ruleType === 'max-depth') {
            if (raw.maxDepth !== undefined && (!Number.isInteger(raw.maxDepth) || raw.maxDepth < 1 || raw.maxDepth > 12))
                errors.push(diag('error', 'policy/rule-max-depth', 'maxDepth 必须为 1..12 整数', { path: at + '/maxDepth' }, { value: raw.maxDepth }, []));
            if (raw.maxDepth === undefined)
                errors.push(diag('error', 'policy/rule-max-depth-missing', 'max-depth 规则必须提供 maxDepth', { path: at }, {}, []));
        }
        else if (ruleType === 'cross-tree') {
            if (raw.mode !== 'forbid' && raw.mode !== 'allow' && raw.mode !== 'require-to-api')
                errors.push(diag('error', 'policy/rule-mode', "cross-tree 的 mode 必须为 'forbid' | 'allow' | 'require-to-api'", { path: at + '/mode' }, { value: raw.mode }, []));
        }
        else if (ruleType === 'naming') {
            if (typeof raw.pattern !== 'string' || raw.pattern === '') {
                errors.push(diag('error', 'policy/rule-pattern', 'naming 规则必须提供 pattern 正则', { path: at + '/pattern' }, {}, []));
            }
            else {
                try {
                    new RegExp(raw.pattern);
                }
                catch {
                    errors.push(diag('error', 'policy/rule-pattern-invalid', 'pattern 不是合法正则', { path: at + '/pattern' }, { value: raw.pattern }, []));
                }
            }
        }
        if (errors.length === errorsBefore)
            rules.push(raw);
    }
    if (errors.length > 0)
        return { policy: null, errors, warnings };
    return {
        policy: { schema_version: POLICY_SCHEMA_VERSION, updated_at: String(data.updated_at), rules },
        errors,
        warnings,
    };
}
/** 读取 policy.yml；不存在返回 null（不报错）。 */
export async function loadPolicyFile(projectDir) {
    let text;
    try {
        text = await readFile(policyFilePath(projectDir), 'utf8');
    }
    catch {
        return { policy: null, exists: false, errors: [] };
    }
    let data;
    try {
        data = yamlParse(text, { uniqueKeys: true });
    }
    catch (error) {
        const pos = error instanceof YAMLParseError && Array.isArray(error.linePos) && error.linePos[0] !== undefined ? '（第 ' + error.linePos[0].line + ' 行）' : '';
        return { policy: null, exists: true, errors: [diag('error', 'policy/yaml-parse', 'policy.yml 解析失败' + pos + '：' + (error instanceof Error ? error.message : String(error)), {}, {}, ['修复 YAML 语法'])] };
    }
    const r = l1ValidatePolicy(data, 'policy.yml');
    return { policy: r.policy, exists: true, errors: r.errors };
}
export async function writePolicyFile(projectDir, policy) {
    const body = yamlStringify({ schema_version: POLICY_SCHEMA_VERSION, updated_at: policy.updated_at, rules: policy.rules }, { lineWidth: 0 });
    const text = '# Normify 架构规则（policy.yml）：normify_validate 强制执行；规则类型与示例见 normify_policy_get。\n' + body;
    await mkdir(projectDir, { recursive: true });
    await writeFile(policyFilePath(projectDir), text, 'utf8');
    return 'policy.yml';
}
/** 项目创建时安装默认规则（已存在则不覆盖）。 */
export async function installDefaultPolicy(projectDir) {
    const { exists } = await loadPolicyFile(projectDir);
    if (exists)
        return;
    await mkdir(projectDir, { recursive: true });
    await writeFile(policyFilePath(projectDir), defaultPolicyTemplate(), 'utf8');
}
/** L2：执行全部启用的规则。 */
export function evaluatePolicy(policy, ctx) {
    const out = [];
    for (const rule of policy.rules) {
        if (rule.enabled === false)
            continue;
        const severity = rule.severity ?? 'error';
        const push = (message, subject, evidence, fixes) => {
            out.push(diag(severity, 'policy/' + rule.id, message, subject, { ...evidence, rule: rule.id, type: rule.type }, fixes));
        };
        if (rule.type === 'forbid-dependency') {
            for (const f of ctx.files) {
                const m = f.module;
                if (rule.fromState !== undefined && effectiveState(m) !== rule.fromState)
                    continue;
                if (!anyMatch(rule.from, m.id))
                    continue;
                for (const d of m.deps ?? []) {
                    if (rule.kind !== undefined && !rule.kind.includes(d.kind))
                        continue;
                    const target = ctx.byId.get(d.to);
                    if (rule.toState !== undefined && (target === undefined || effectiveState(target.module) !== rule.toState))
                        continue;
                    if (!anyMatch(rule.to, d.to))
                        continue;
                    push(rule.message?.zh ?? ('禁止的依赖：' + m.id + ' → ' + d.to + '（规则 ' + rule.id + '）'), { module: m.id, to: d.to, kind: d.kind }, {}, ['删除该依赖、改走允许的路径，或与维护者确认后调整 policy.yml']);
                }
            }
        }
        else if (rule.type === 'dependency-direction') {
            const layers = rule.layers ?? [];
            const layerOf = (id) => {
                for (let i = 0; i < layers.length; i++)
                    if (anyMatch(layers[i].match, id))
                        return i;
                return -1;
            };
            for (const f of ctx.files) {
                const m = f.module;
                const fromLayer = layerOf(m.id);
                if (fromLayer < 0)
                    continue;
                for (const d of m.deps ?? []) {
                    const toLayer = layerOf(d.to);
                    if (toLayer < 0)
                        continue;
                    const same = fromLayer === toLayer;
                    const forward = fromLayer < toLayer;
                    const allowed = forward || (same && rule.allowSameLayer !== false);
                    if (!allowed && !(rule.allowBackward === true)) {
                        push(rule.message?.zh ?? ('依赖方向违规：' + m.id + '（' + layers[fromLayer].name + '）→ ' + d.to + '（' + layers[toLayer].name + '）'), { module: m.id, to: d.to }, { from_layer: layers[fromLayer].name, to_layer: layers[toLayer].name }, ['改为从后层指向前层，或调整 policy.yml 的层定义']);
                    }
                }
            }
        }
        else if (rule.type === 'acyclic') {
            const nodes = new Set();
            for (const f of ctx.files)
                if (anyMatch(rule.scope, f.module.id))
                    nodes.add(f.module.id);
            const adjacency = new Map();
            for (const f of ctx.files) {
                if (!nodes.has(f.module.id))
                    continue;
                for (const d of f.module.deps ?? []) {
                    if (!nodes.has(d.to))
                        continue;
                    if (rule.includeCrossTree === false && treeOf(f.module.id) !== treeOf(d.to))
                        continue;
                    const list = adjacency.get(f.module.id) ?? [];
                    list.push(d.to);
                    adjacency.set(f.module.id, list);
                }
            }
            const color = new Map();
            const stack = [];
            const reported = new Set();
            const dfs = (id) => {
                color.set(id, 1);
                stack.push(id);
                for (const next of adjacency.get(id) ?? []) {
                    if (next === id)
                        continue;
                    const c = color.get(next) ?? 0;
                    if (c === 1) {
                        const start = stack.indexOf(next);
                        const cycle = [...stack.slice(start), next];
                        const key = [...cycle].sort().join('|');
                        if (!reported.has(key)) {
                            reported.add(key);
                            push(rule.message?.zh ?? ('依赖环：' + cycle.join(' → ')), { module: next }, { cycle }, ['打断环中的一条边或调整模块边界']);
                        }
                    }
                    else if (c === 0) {
                        dfs(next);
                    }
                }
                stack.pop();
                color.set(id, 2);
            };
            for (const id of nodes)
                if ((color.get(id) ?? 0) === 0)
                    dfs(id);
        }
        else if (rule.type === 'max-depth') {
            const limit = rule.maxDepth ?? 12;
            for (const f of ctx.files) {
                if (!anyMatch(rule.scope, f.module.id))
                    continue;
                const depth = depthOf(f.module.id);
                if (depth > limit)
                    push(rule.message?.zh ?? ('模块 id 深度 ' + depth + ' 超过上限 ' + limit + '：' + f.module.id), { module: f.module.id }, { depth, limit }, ['合并/上移模块或调整 policy.yml']);
            }
        }
        else if (rule.type === 'cross-tree') {
            if (rule.mode === 'allow')
                continue;
            for (const f of ctx.files) {
                for (const d of f.module.deps ?? []) {
                    if (treeOf(f.module.id) === treeOf(d.to))
                        continue;
                    if (rule.mode === 'forbid') {
                        push(rule.message?.zh ?? ('禁止跨树依赖：' + f.module.id + ' → ' + d.to), { module: f.module.id, to: d.to }, {}, ['删除该依赖或调整 policy.yml']);
                    }
                    else if (rule.mode === 'require-to-api' && d.to_api === undefined) {
                        push(rule.message?.zh ?? ('跨树依赖必须写 to_api：' + f.module.id + ' → ' + d.to), { module: f.module.id, to: d.to }, {}, ['补充目标模块自身的 API 键']);
                    }
                }
            }
        }
        else if (rule.type === 'naming') {
            let re = null;
            try {
                re = new RegExp(rule.pattern ?? '');
            }
            catch {
                continue;
            }
            for (const f of ctx.files) {
                if (!anyMatch(rule.scope, f.module.id))
                    continue;
                for (const seg of f.module.id.split('.')) {
                    if (!re.test(seg)) {
                        push(rule.message?.zh ?? ('命名违规：' + f.module.id + ' 的段 "' + seg + '" 不匹配 ' + rule.pattern), { module: f.module.id }, { segment: seg, pattern: rule.pattern }, ['重命名该段（用 normify_module_move）或调整 policy.yml']);
                        break;
                    }
                }
            }
        }
    }
    return out;
}
/** 供工具/诊断展示的规则类型说明。 */
export function policyReference() {
    return [
        'policy.yml 规则类型：',
        '1) forbid-dependency: from[]/to[](id 模式，** 任意段)、kind?、fromState?/toState?，命中记违规',
        '2) dependency-direction: layers[{name,match[]}] 顺序即允许方向；allowSameLayer(默认true)/allowBackward(默认false)',
        '3) acyclic: scope?、includeCrossTree?(默认true) 检测依赖环',
        '4) max-depth: maxDepth(1..12)、scope? 限制 id 段数',
        '5) cross-tree: mode=forbid|allow|require-to-api（require 时跨树必须写 to_api）',
        '6) naming: pattern(正则)、scope? 限制 id 段的命名',
        'severity 默认 error（阻断 build），可设 warning；规则可用 enabled:false 临时停用。',
        '项目创建时会自动写入默认模板（policy.yml）；用 normify_policy_get / normify_policy_upsert 读取与更新。',
    ].join('\n');
}
//# sourceMappingURL=policy.js.map