import { parse as yamlParse, YAMLParseError } from 'yaml';
import { DEP_KINDS, PROTOCOLS } from './types.js';
import { deriveParent, isValidId } from './ids.js';
import { diag } from './diag.js';
const TOP_KEYS = ['uid', 'id', 'parent', 'name', 'description', 'source', 'revision', 'updated_at', 'fingerprint', 'repository', 'apis', 'deps'];
const SOURCE_KEYS = ['path', 'line', 'end_line'];
const API_KEYS = ['protocol', 'method', 'path', 'description'];
const DEP_KEYS = ['kind', 'to', 'from_api', 'to_api', 'label'];
export const MAX_DEPTH = 8;
function isL10n(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v)
        && typeof v.zh === 'string'
        && typeof v.en === 'string';
}
function isPlain(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function checkL10n(value, field, maxLen, where, out) {
    if (!isL10n(value)) {
        out.push(diag('error', 'structure/' + field + '-shape', field + ' 必须为 {zh, en} 字符串对象', { path: where + '/' + field }, { value }, ['补全 {zh, en} 双语字段']));
        return;
    }
    for (const lang of ['zh', 'en']) {
        const s = value[lang].trim();
        if (s.length === 0) {
            out.push(diag('error', 'structure/' + field + '-empty', field + '.' + lang + ' 不能为空', { path: where + '/' + field + '/' + lang }, {}, ['补写' + lang + '文案']));
        }
        else if (s.length > maxLen) {
            out.push(diag('error', 'structure/' + field + '-too-long', field + '.' + lang + ' 超过 ' + maxLen + ' 字符', { path: where + '/' + field + '/' + lang }, { length: s.length, max: maxLen }, ['精简文案到 ' + maxLen + ' 字符以内']));
        }
    }
}
export function checkSourceEntry(v, where, out) {
    if (!isPlain(v)) {
        out.push(diag('error', 'structure/source-entry-shape', 'source 条目必须为对象', { path: where }, {}, []));
        return false;
    }
    for (const k of Object.keys(v)) {
        if (!SOURCE_KEYS.includes(k)) {
            out.push(diag('error', 'structure/unknown-field', 'source 条目不支持字段 ' + k, { path: where }, {}, ['删除字段 ' + k]));
        }
    }
    const p = v.path;
    if (typeof p !== 'string' || p.length === 0 || p.length > 240) {
        out.push(diag('error', 'structure/source-path-invalid', 'source.path 必须为 1-240 字符的 repo 相对路径', { path: where + '/path' }, {}, ['填写仓库内相对路径']));
        return false;
    }
    if (p.startsWith('/') || p.includes('\\') || p.split('/').some(s => s === '..' || s === '.' || s === '')) {
        out.push(diag('error', 'structure/source-path-invalid', 'source.path 必须是正斜杠的 repo 相对路径（无 .. 与空段）', { path: where + '/path' }, { path: p }, ['改为相对路径，如 src/order/payment.ts']));
        return false;
    }
    for (const k of ['line', 'end_line']) {
        const n = v[k];
        if (n !== undefined && (typeof n !== 'number' || !Number.isInteger(n) || n < 1)) {
            out.push(diag('error', 'structure/source-' + k + '-invalid', 'source.' + k + ' 必须为正整数', { path: where + '/' + k }, { value: n }, ['修正行号']));
            return false;
        }
    }
    if (typeof v.line === 'number' && typeof v.end_line === 'number' && v.end_line < v.line) {
        out.push(diag('error', 'structure/source-range-invalid', 'source.end_line 不能小于 line', { path: where }, { line: v.line, end_line: v.end_line }, ['修正行号范围']));
        return false;
    }
    return true;
}
export function checkApiEntry(v, where, out) {
    if (!isPlain(v)) {
        out.push(diag('error', 'api/entry-shape', 'apis 条目必须为对象', { path: where }, {}, []));
        return false;
    }
    for (const k of Object.keys(v)) {
        if (!API_KEYS.includes(k)) {
            out.push(diag('error', 'api/unknown-field', 'apis 条目不支持字段 ' + k, { path: where }, {}, ['删除字段 ' + k]));
        }
    }
    const proto = v.protocol;
    if (typeof proto !== 'string' || !PROTOCOLS.includes(proto)) {
        out.push(diag('error', 'api/protocol-unknown', 'protocol 不在允许枚举内', { path: where + '/protocol' }, { value: proto, allowed: PROTOCOLS }, ['使用枚举值之一：' + PROTOCOLS.join(', ')]));
        return false;
    }
    if (typeof v.path !== 'string' || v.path.trim().length === 0) {
        out.push(diag('error', 'api/path-empty', 'path 不能为空', { path: where + '/path' }, {}, ['填写 URL 路径或 topic/队列名/表名']));
        return false;
    }
    if (proto === 'http') {
        if (typeof v.method !== 'string' || !/^[A-Z]+$/.test(v.method)) {
            out.push(diag('error', 'api/method-required', 'http 类 API 必须有大写 method', { path: where + '/method' }, {}, ['填写 METHOD，如 POST']));
            return false;
        }
    }
    else if (v.method !== undefined) {
        out.push(diag('error', 'api/method-forbidden', '非 http 类 API 不能有 method 字段', { path: where + '/method' }, {}, ['删除 method 字段']));
        return false;
    }
    checkL10n(v.description, 'description', 200, where, out);
    return true;
}
export function checkDepEntry(v, where, out) {
    if (!isPlain(v)) {
        out.push(diag('error', 'dep/entry-shape', 'deps 条目必须为对象', { path: where }, {}, []));
        return false;
    }
    for (const k of Object.keys(v)) {
        if (!DEP_KEYS.includes(k)) {
            out.push(diag('error', 'dep/unknown-field', 'deps 条目不支持字段 ' + k, { path: where }, {}, ['删除字段 ' + k]));
        }
    }
    if (typeof v.kind !== 'string' || !DEP_KINDS.includes(v.kind)) {
        out.push(diag('error', 'dep/kind-unknown', 'kind 不在允许枚举内', { path: where + '/kind' }, { value: v.kind, allowed: DEP_KINDS }, ['使用枚举值之一：' + DEP_KINDS.join(', ')]));
        return false;
    }
    if (typeof v.to !== 'string' || v.to.trim().length === 0) {
        out.push(diag('error', 'dep/to-empty', 'to 必须为目标模块 id', { path: where + '/to' }, {}, ['填写目标模块 id']));
        return false;
    }
    for (const k of ['from_api', 'to_api']) {
        if (v[k] !== undefined && (typeof v[k] !== 'string' || v[k].trim().length === 0)) {
            out.push(diag('error', 'dep/' + k + '-invalid', k + ' 必须为非空字符串', { path: where + '/' + k }, {}, ['填写 API 键或删除该字段']));
            return false;
        }
    }
    if (v.label !== undefined)
        checkL10n(v.label, 'label', 30, where, out);
    return true;
}
/** L1：单文件级字段校验（规范 §5.2 结构/API/边类的格式部分）。 */
export function l1Validate(data, where) {
    const errors = [];
    const warnings = [];
    if (!isPlain(data)) {
        errors.push(diag('error', 'input/not-object', 'frontmatter 解析结果必须为映射', { path: where }, {}, []));
        return { module: null, errors, warnings };
    }
    for (const k of Object.keys(data)) {
        if (!TOP_KEYS.includes(k)) {
            errors.push(diag('error', 'structure/unknown-field', 'frontmatter 不支持字段 ' + k, { path: where }, {}, ['删除字段 ' + k]));
        }
    }
    for (const k of ['uid', 'id', 'parent', 'name', 'description', 'source', 'revision', 'updated_at', 'fingerprint']) {
        if (!(k in data)) {
            errors.push(diag('error', 'structure/missing-field', '缺少必填字段 ' + k, { path: where + '/' + k }, {}, ['补充 ' + k + ' 字段']));
        }
    }
    const uid = data.uid;
    if (typeof uid !== 'string' || !/^[a-f0-9]{8}$/.test(uid)) {
        errors.push(diag('error', 'structure/uid-format', 'uid 必须为 8 位小写 hex', { path: where + '/uid' }, { value: uid }, ['使用 8 位小写十六进制随机串']));
    }
    const id = data.id;
    if (typeof id !== 'string' || !isValidId(id)) {
        errors.push(diag('error', 'structure/id-format', 'id 段格式必须为 [a-z0-9][a-z0-9-]*，点分隔，含树名段 ≤ ' + MAX_DEPTH + ' 段', { path: where + '/id' }, { value: id }, ['修正 id，如 demo.order.checkout.payment']));
    }
    const parent = data.parent;
    if (parent !== null && typeof parent !== 'string') {
        errors.push(diag('error', 'structure/parent-type', 'parent 必须为字符串或 null', { path: where + '/parent' }, { value: parent }, ['填写父模块 id 或 null']));
    }
    else if (typeof id === 'string' && isValidId(id)) {
        const derived = deriveParent(id);
        if (parent === null) {
            if (derived !== null) {
                errors.push(diag('error', 'structure/parent-mismatch', 'parent 必须等于 id 去掉最后一段', { path: where + '/parent' }, { parent: null, derived }, ['将 parent 改为 ' + derived]));
            }
        }
        else if (parent !== derived) {
            errors.push(diag('error', 'structure/parent-mismatch', 'parent 必须等于 id 去掉最后一段', { path: where + '/parent' }, { parent, derived }, ['将 parent 改为 ' + derived]));
        }
    }
    if (data.repository !== undefined) {
        if (typeof data.repository !== 'string' || !/^https?:\/\//.test(data.repository)) {
            errors.push(diag('error', 'structure/repository-invalid', 'repository 必须为 http(s) URL', { path: where + '/repository' }, {}, ['填写仓库 URL']));
        }
        else if (parent !== null) {
            errors.push(diag('error', 'structure/repository-root-only', 'repository 只允许出现在根模块', { path: where + '/repository' }, {}, ['删除该字段']));
        }
    }
    checkL10n(data.name, 'name', 60, where, errors);
    checkL10n(data.description, 'description', 500, where, errors);
    const source = data.source;
    if (!Array.isArray(source)) {
        errors.push(diag('error', 'structure/source-type', 'source 必须为数组', { path: where + '/source' }, {}, []));
    }
    else {
        source.forEach((s, i) => checkSourceEntry(s, where + '/source/' + i, errors));
    }
    if (typeof data.revision !== 'string' || !/^[a-f0-9]{40}$/.test(data.revision)) {
        errors.push(diag('error', 'structure/revision-invalid', 'revision 必须为 40 位 git SHA', { path: where + '/revision' }, { value: data.revision }, ['填写完整 40 位提交 SHA']));
    }
    const updated = data.updated_at;
    if (typeof updated !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(updated) || Number.isNaN(Date.parse(updated))) {
        errors.push(diag('error', 'structure/updated-at-invalid', 'updated_at 必须为 ISO 8601 时间', { path: where + '/updated_at' }, { value: updated }, ['使用 ISO 8601，如 2026-08-30T12:00:00Z']));
    }
    if (typeof data.fingerprint !== 'string' || !/^[a-f0-9]{8,}$/.test(data.fingerprint)) {
        errors.push(diag('error', 'structure/fingerprint-invalid', 'fingerprint 必须为非空十六进制哈希', { path: where + '/fingerprint' }, {}, ['重新计算 source 文件的 SHA-256']));
    }
    if (data.apis !== undefined && !Array.isArray(data.apis)) {
        errors.push(diag('error', 'api/type', 'apis 必须为数组', { path: where + '/apis' }, {}, []));
    }
    if (data.deps !== undefined && !Array.isArray(data.deps)) {
        errors.push(diag('error', 'dep/type', 'deps 必须为数组', { path: where + '/deps' }, {}, []));
    }
    if (errors.length > 0)
        return { module: null, errors, warnings };
    const module = {
        uid: uid,
        id: id,
        parent: parent,
        name: data.name,
        description: data.description,
        source: source,
        revision: data.revision,
        updated_at: data.updated_at,
        fingerprint: data.fingerprint,
    };
    if (typeof data.repository === 'string')
        module.repository = data.repository;
    if (Array.isArray(data.apis)) {
        module.apis = data.apis;
        data.apis.forEach((a, i) => checkApiEntry(a, where + '/apis/' + i, errors));
        if (errors.length > 0)
            return { module: null, errors, warnings };
    }
    if (Array.isArray(data.deps)) {
        module.deps = data.deps;
        data.deps.forEach((d, i) => checkDepEntry(d, where + '/deps/' + i, errors));
        if (errors.length > 0)
            return { module: null, errors, warnings };
    }
    return { module, errors, warnings };
}
/** 解析模块文件文本：frontmatter（严格子集 YAML）+ 正文。 */
export function parseModuleText(text, where) {
    const lines = text.split(/\r?\n/);
    if (lines[0] === undefined || lines[0].trim() !== '---') {
        return {
            module: null,
            body: '',
            errors: [diag('error', 'input/no-frontmatter', '模块文件必须以 --- 开头的 YAML frontmatter 开始', { path: where }, {}, ['以 --- 开始 frontmatter'])],
            warnings: [],
        };
    }
    let close = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            close = i;
            break;
        }
    }
    if (close < 0) {
        return {
            module: null,
            body: '',
            errors: [diag('error', 'input/unclosed-frontmatter', 'frontmatter 缺少结束行 ---', { path: where }, {}, ['在 frontmatter 末尾补 ---'])],
            warnings: [],
        };
    }
    const yamlText = lines.slice(1, close).join('\n');
    const body = lines.slice(close + 1).join('\n').replace(/^\n+/, '');
    let data;
    try {
        data = yamlParse(yamlText, { uniqueKeys: true });
    }
    catch (error) {
        const pos = error instanceof YAMLParseError && Array.isArray(error.linePos) && error.linePos[0] !== undefined ? '（第 ' + error.linePos[0].line + ' 行）' : '';
        return {
            module: null,
            body: '',
            errors: [diag('error', 'input/yaml-parse', 'frontmatter YAML 解析失败' + pos + '：' + (error instanceof Error ? error.message : String(error)), { path: where }, {}, ['修复 YAML 语法（只允许规范 §3.3 的安全子集）'])],
            warnings: [],
        };
    }
    const { module, errors, warnings } = l1Validate(data, where);
    return { module, body, errors, warnings };
}
// ---------- 序列化（确定性输出，diff 友好） ----------
function q(value) {
    return JSON.stringify(value);
}
function plainScalar(value) {
    if (/^[A-Za-z0-9_\-./]+$/.test(value) && !/^[\-?:,\[\]{}#&*!|>'"%@]/.test(value))
        return value;
    return q(value);
}
function l10nInline(v) {
    return '{zh: ' + q(v.zh) + ', en: ' + q(v.en) + '}';
}
/** 折叠块双语：indent 为 zh/en 键所在缩进，内容行再缩进 2。 */
function l10nBlock(indent, v) {
    const inner = indent + '    ';
    const fold = (s) => {
        const ls = s.replace(/\r?\n/g, '\n').split('\n');
        return '>\n' + ls.map(l => inner + l).join('\n');
    };
    return indent + 'zh: ' + fold(v.zh) + '\n' + indent + 'en: ' + fold(v.en);
}
export function serializeModule(module, body) {
    const out = ['---'];
    out.push('uid: ' + plainScalar(module.uid));
    out.push('id: ' + plainScalar(module.id));
    out.push('parent: ' + (module.parent === null ? 'null' : plainScalar(module.parent)));
    if (module.repository !== undefined)
        out.push('repository: ' + plainScalar(module.repository));
    out.push('name: ' + l10nInline(module.name));
    out.push('description:');
    out.push(l10nBlock('  ', module.description));
    out.push('revision: ' + plainScalar(module.revision));
    out.push('updated_at: ' + plainScalar(module.updated_at));
    out.push('fingerprint: ' + plainScalar(module.fingerprint));
    if (module.source.length === 0) {
        out.push('source: []');
    }
    else {
        out.push('source:');
        for (const s of module.source) {
            out.push('  - path: ' + q(s.path));
            if (s.line !== undefined)
                out.push('    line: ' + s.line);
            if (s.end_line !== undefined)
                out.push('    end_line: ' + s.end_line);
        }
    }
    if (module.apis !== undefined) {
        if (module.apis.length === 0) {
            out.push('apis: []');
        }
        else {
            out.push('apis:');
            for (const a of module.apis) {
                out.push('  - protocol: ' + plainScalar(a.protocol));
                if (a.method !== undefined)
                    out.push('    method: ' + plainScalar(a.method));
                out.push('    path: ' + q(a.path));
                out.push('    description:');
                out.push(l10nBlock('      ', a.description));
            }
        }
    }
    if (module.deps !== undefined && module.deps.length > 0) {
        out.push('deps:');
        for (const d of module.deps) {
            out.push('  - kind: ' + plainScalar(d.kind));
            out.push('    to: ' + plainScalar(d.to));
            if (d.from_api !== undefined)
                out.push('    from_api: ' + q(d.from_api));
            if (d.to_api !== undefined)
                out.push('    to_api: ' + q(d.to_api));
            if (d.label !== undefined)
                out.push('    label: ' + l10nInline(d.label));
        }
    }
    out.push('---');
    const text = out.join('\n') + '\n';
    if (body.trim().length === 0)
        return text;
    return text + '\n' + body.trimEnd() + '\n';
}
/** 为 AI 生成器准备的字段速查（与 skills/normify-gen/SKILL.md 同步维护）。 */
export function fieldReference() {
    const proto = PROTOCOLS.join(' | ');
    const kinds = DEP_KINDS.join(' | ');
    return [
        '模块字段（必填）: uid(8位hex) id(路径式,≤8段) parent(id去尾段|根为null) name{zh,en} description{zh,en} source[{path,line?,end_line?}] revision(40位SHA) updated_at(ISO) fingerprint(hex)',
        '可选: repository(仅根,http(s)URL) apis(仅叶子) deps(出向箭头)',
        'apis 条目: protocol(' + proto + ') method(仅http,大写) path description{zh,en}',
        'deps 条目: kind(' + kinds + ') to(目标id,可跨树) from_api?(本模块API,仅叶子) to_api?(目标自身API) label?{zh,en}',
        '叶子 = 无任何模块以其为 parent；叶子必须写 apis（可为 []，记 warning）；非叶子与根禁止 apis',
        '未接箭头的 API 完全合法，不得删除',
    ].join('\n');
}
//# sourceMappingURL=frontmatter.js.map