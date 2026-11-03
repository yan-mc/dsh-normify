#!/usr/bin/env node
/**
 * gen-diagnostics.mjs — 从 src/core 源码生成 docs/DIAGNOSTICS.md
 *
 * 扫描 src/core 下全部 .ts 里的 `diag(...)` 调用：
 *   - 字面量诊断码：diag('error' | 'warning', 'family/code', ...)
 *   - 动态拼接码：diag(sev, 'family/' + field + '-suffix', ...) → family/<field>-suffix
 *
 * 用法：
 *   node scripts/gen-diagnostics.mjs            # 生成/更新 docs/DIAGNOSTICS.md
 *   node scripts/gen-diagnostics.mjs --check    # 只校验，文件与代码不一致时 exit 1
 *   node scripts/gen-diagnostics.mjs --json     # 输出 JSON 摘要到 stdout（不写文件）
 *   node scripts/gen-diagnostics.mjs --stdout   # 输出生成的 Markdown 到 stdout（不写文件）
 *
 * 约束：只读 src/，只写 docs/DIAGNOSTICS.md。发布清单/CI 可用 --check 防漂移。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_CORE = join(ROOT, 'src', 'core');
const OUT = join(ROOT, 'docs', 'DIAGNOSTICS.md');

const argv = new Set(process.argv.slice(2));
const CHECK = argv.has('--check');
const JSON_OUT = argv.has('--json');
const STDOUT = argv.has('--stdout');

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir).sort()) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (p.endsWith('.ts')) out.push(p);
    }
    return out;
}

/** 从 openIdx 处的 '(' 起按顶层逗号切分实参（引号/括号感知）。 */
function splitArgs(text, openIdx) {
    const args = [];
    let start = openIdx + 1;
    let depth = 0;
    let quote = null;
    for (let i = openIdx + 1; i < text.length; i++) {
        const ch = text[i];
        if (quote !== null) {
            if (ch === '\\') { i++; continue; }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
        if (ch === ')' || ch === ']' || ch === '}') {
            if (depth === 0 && ch === ')') { args.push(text.slice(start, i).trim()); return args; }
            depth--;
            if (depth < 0) { args.push(text.slice(start, i).trim()); return args; }
            continue;
        }
        if (ch === ',' && depth === 0) { args.push(text.slice(start, i).trim()); start = i + 1; }
    }
    args.push(text.slice(start).trim());
    return args;
}

function literal(arg) {
    const m = /^'((?:[^'\\]|\\.)*)'$/.exec(arg) ?? /^"((?:[^"\\]|\\.)*)"$/.exec(arg);
    if (m === null) return null;
    return m[1].replace(/\\(['"`\\])/g, '$1');
}

/** 把 `'structure/' + field + '-type'` 归一成 `structure/<field>-type`。 */
function dynamicLabel(expr) {
    return expr.split('+').map((part) => {
        const raw = part.trim();
        const lit = literal(raw);
        if (lit !== null) return lit;
        const tpl = /^`([^`]*)`$/.exec(raw);
        if (tpl !== null) return tpl[1].replace(/\$\{[^}]*\}/g, '<…>');
        const name = raw.replace(/[^A-Za-z0-9_.]/g, '');
        return '<' + (name === '' ? '…' : name) + '>';
    }).join('');
}

const codes = new Map();    // code -> { code, severity:Set, sites:[{file,line}], message }
const dynamic = new Map();  // label -> { label, expr, severity:Set, sites }
const unparsed = [];

for (const file of walk(SRC_CORE)) {
    // 显式枚举码：用于由参数决定前缀（codePrefix）等静态分析展开不了的诊断码。
    {
        const noteRe = /@diag-codes\s+([^*\n]+)/g;
        const text0 = readFileSync(file, 'utf8');
        const lineOf0 = (idx) => text0.slice(0, idx).split('\n').length;
        let nm;
        while ((nm = noteRe.exec(text0)) !== null) {
            for (const code of nm[1].trim().split(/\s+/)) {
                if (!/^[a-z]+\/[a-z0-9-]+$/.test(code)) continue;
                const entry = codes.get(code) ?? { code, severity: new Set(), sites: [], message: null };
                entry.severity.add('error');
                entry.sites.push({ file: relative(ROOT, file).replace(/\\/g, '/'), line: lineOf0(nm.index) });
                if (entry.message === null) entry.message = '（@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning）';
                codes.set(code, entry);
            }
        }
    }
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const text = readFileSync(file, 'utf8');
    const lineAt = (idx) => text.slice(0, idx).split('\n').length;
    const re = /diag\(/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const args = splitArgs(text, m.index + 4);
        if (args.length < 2) continue;
        if (/^severity\s*:/.test(args[0])) continue; // diag.ts 里的函数定义

        const sevArg = args[0];
        const sevLiteral = literal(sevArg);
        const severity = sevLiteral === 'error' || sevLiteral === 'warning' ? sevLiteral : 'dynamic';
        const codeArg = args[1];
        const site = { file: rel, line: lineAt(m.index) };
        const msgRaw = args[2] !== undefined ? literal(args[2]) : null;

        const codeLiteral = literal(codeArg);
        if (codeLiteral !== null) {
            if (!codeLiteral.includes('/') || /[\/-]$/.test(codeLiteral) || /\s/.test(codeLiteral)) continue; // 这是动态前缀，不是完整码
            const entry = codes.get(codeLiteral) ?? { code: codeLiteral, severity: new Set(), sites: [], message: null };
            if (severity !== 'dynamic') entry.severity.add(severity);
            entry.sites.push(site);
            if (entry.message === null && msgRaw !== null && msgRaw !== '') entry.message = msgRaw;
            codes.set(codeLiteral, entry);
            continue;
        }

        if (codeArg.includes('\'') || codeArg.includes('"') || codeArg.includes('`')) {
            const label = dynamicLabel(codeArg);
            const entry = dynamic.get(label) ?? {
                label,
                expr: codeArg.replace(/\s+/g, ' '),
                severity: new Set(),
                sites: [],
            };
            if (severity !== 'dynamic') entry.severity.add(severity);
            entry.sites.push(site);
            dynamic.set(label, entry);
            continue;
        }

        unparsed.push({ file: rel, line: site.line, snippet: `diag(${args.slice(0, 3).join(', ').slice(0, 72)}` });
    }
}

const allCodes = [...codes.values()].sort((a, b) => a.code.localeCompare(b.code));
const dynamicCodes = [...dynamic.values()].sort((a, b) => a.label.localeCompare(b.label));
const conflicts = allCodes.filter((e) => e.severity.size > 1);

const groups = new Map();
for (const e of allCodes) {
    const prefix = e.code.split('/')[0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(e);
}

const escapeCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/`/g, '');
const fmtSites = (sites) => {
    const uniq = [...new Map(sites.map((s) => [`${s.file}:${s.line}`, s])).values()];
    const shown = uniq.slice(0, 3).map((s) => '`' + s.file + ':' + s.line + '`').join('<br>');
    return uniq.length > 3 ? `${shown}<br>… +${uniq.length - 3}` : shown;
};
const fmtSeverity = (set) => (set.size === 0 ? '动态' : [...set].sort().join(' / '));

let md = '';
md += '# 诊断码总表（DIAGNOSTICS）\n\n';
md += '> 本文件由 `scripts/gen-diagnostics.mjs` 从 `src/core` 的 `diag(...)` 调用自动生成，**不要手工编辑**。\n';
md += '> 重新生成：`node scripts/gen-diagnostics.mjs`；发布前防漂移校验：`node scripts/gen-diagnostics.mjs --check`。\n\n';
md += `- 扫描范围：\`src/core\` 下全部 \`.ts\`（共 ${walk(SRC_CORE).length} 个文件）\n`;
md += `- 字面量诊断码：**${allCodes.length}**（error ${allCodes.filter((e) => e.severity.has('error')).length}，`
    + `warning ${allCodes.filter((e) => e.severity.has('warning')).length}，`
    + `error+warning 双级 ${conflicts.length}）\n`;
md += `- 动态码族：**${dynamicCodes.length}**（实际码随字段/规则 id 变化，见「动态诊断码」）\n`;
md += '- 诊断对象形状：`severity / code / message / subject / evidence / supportedFixes`（AI 可据此自修复）\n\n';
md += '## 使用方式\n\n';
md += '- 工具/CLI 返回的每条诊断都带 `code`（形如 `族/具体码`）；先按 `code` 查本表，再看 `evidence` 与 `supportedFixes`。\n';
md += '- `severity=error` 阻断 `build` / `change_close`；`warning` 不阻断，但收尾时应汇报。\n';
md += '- 架构规则违规的码是 `policy/<rule-id>`，级别由该条规则的 `severity` 决定（默认 error）。\n';
md += '- 同一 `code` 在不同上下文含义可能不同；以 `message` + `evidence` 为准。\n\n';

if (conflicts.length > 0) {
    md += '## 级别冲突（同一码既报 error 又报 warning，需人工确认）\n\n';
    for (const e of conflicts) md += `- \`${e.code}\` @ ${fmtSites(e.sites)}\n`;
    md += '\n';
}

md += '## 按族索引\n\n';
md += '| 族 | 码数 | 诊断码 |\n| --- | --- | --- |\n';
for (const [prefix, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `| \`${prefix}/\` | ${list.length} | ${list.map((e) => '`' + e.code + '`').join('、')} |\n`;
}
md += '\n';

md += '## 全量诊断码\n\n';
md += '| 诊断码 | 级别 | 生成点 | 说明（message 首段） |\n| --- | --- | --- | --- |\n';
for (const e of allCodes) {
    md += `| \`${e.code}\` | ${fmtSeverity(e.severity)} | ${fmtSites(e.sites)} | ${escapeCell(e.message ?? '（动态拼接）')} |\n`;
}
md += '\n';

md += '## 动态诊断码\n\n';
md += '> 这些码由字段名 / 规则 id 拼接而成，表里给出**码模板**；实际返回时变量部分会被替换。\n\n';
md += '| 码模板 | 级别 | 生成点 | 表达式（源码） |\n| --- | --- | --- | --- |\n';
for (const e of dynamicCodes) {
    md += `| \`${e.label}\` | ${fmtSeverity(e.severity)} | ${fmtSites(e.sites)} | \`${escapeCell(e.expr)}\` |\n`;
}
md += '\n';

if (unparsed.length > 0) {
    md += '## 附：未解析的 diag( 调用（生成脚本未识别，供人工复核）\n\n';
    for (const u of unparsed.slice(0, 20)) md += `- \`${u.file}:${u.line}\` — \`${escapeCell(u.snippet)}\`\n`;
    if (unparsed.length > 20) md += `- …… 共 ${unparsed.length} 处\n`;
    md += '\n';
}

md += '---\n\n';
md += '*本表的唯一真源是 `src/core` 的 `diag(...)` 调用；如果工具返回了表里没有的码，说明生成脚本需要扩展或代码绕过了统一诊断构造。*\n';

const summary = {
    scannedFiles: walk(SRC_CORE).length,
    totalCodes: allCodes.length,
    errorCodes: allCodes.filter((e) => e.severity.has('error')).length,
    warningCodes: allCodes.filter((e) => e.severity.has('warning')).length,
    dynamicCodes: dynamicCodes.length,
    dynamicLabels: dynamicCodes.map((e) => e.label),
    conflicts: conflicts.map((e) => e.code),
    unparsed: unparsed.length,
};

if (JSON_OUT) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    process.exit(0);
}
if (STDOUT) {
    process.stdout.write(md);
    process.exit(0);
}
if (CHECK) {
    let existing = '';
    try { existing = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
    const normalize = (v) => v.replace(/\r\n/g, String.fromCharCode(10));
    if (normalize(existing) !== normalize(md)) {
        process.stderr.write('docs/DIAGNOSTICS.md 已过期：请运行 node scripts/gen-diagnostics.mjs 重新生成。\n');
        process.exit(1);
    }
    process.stderr.write(`docs/DIAGNOSTICS.md 与源码一致（${allCodes.length} 个码）。\n`);
    process.exit(0);
}

writeFileSync(OUT, md, 'utf8');
process.stdout.write(`wrote docs/DIAGNOSTICS.md：${allCodes.length} 个字面量码 + ${dynamicCodes.length} 个动态码族（error ${summary.errorCodes} / warning ${summary.warningCodes}）\n`);
if (unparsed.length > 0) process.stderr.write(`注意：${unparsed.length} 处 diag( 调用未能静态解析，见文件附录。\n`);
