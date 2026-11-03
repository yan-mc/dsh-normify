#!/usr/bin/env node
/**
 * Normify CLI —— 与 DSH 无关的结构引擎入口（跨 agent / CI 可用）。
 *
 * 用法：
 *   normify <command> [options]
 *   normify call <tool-name> --args-json '{"dir":"..."}'
 *   normify tools [--json]
 *
 * 通用选项：
 *   --project <slug>     项目 slug（结构数据目录 = normify-<slug>）
 *   --dir <path>         结构数据目录绝对路径（与 --project 二选一）
 *   --args-json <json>   直接传工具实参（合并到 flags 之上）
 *   --json               以 JSON 输出（默认就是 JSON；保留兼容）
 *   --quiet              只输出结果，不输出提示
 *   -h, --help           帮助
 *
 * 退出码：0 成功；2 校验/L2 错误；3 漂移；4 参数错误；6 安全拒绝；5 其它失败。
 */
import { createNormifyTools } from '../core/toolset.js';
import type { NormifyToolSpec, ToolEnv } from '../core/toolset.js';

const VERSION = '0.5.5';

interface ParsedArgs {
    command: string;
    positional: string[];
    flags: Record<string, string | boolean>;
}

const COMMANDS: Record<string, { tool: string; help: string }> = {
    init: { tool: 'normify_project_init', help: '初始化项目（可用 --root-id/--name-zh/--name-en 一步建计划态根模块）' },
    status: { tool: 'normify_module_list', help: '项目概览（模块清单与统计）' },
    list: { tool: 'normify_module_list', help: '按父级列模块（--parent <id>、--direct-only）' },
    get: { tool: 'normify_module_get', help: '读单个模块（--id <id>）' },
    search: { tool: 'normify_search', help: '检索模块/API（--query <text>）' },
    brief: { tool: 'normify_brief', help: '开发指引（--task/--id/--files）' },
    validate: { tool: 'normify_validate', help: 'L2 全项目校验（--repo-root 启用证据校验）' },
    check: { tool: 'normify_check', help: '设计预检（--args-json 传拟建模块）' },
    build: { tool: 'normify_build', help: '编译产物（tree/outline/api-index/receipt）' },
    render: { tool: 'normify_render', help: '渲染单文件 HTML（--out 纯文件名）' },
    sync: { tool: 'normify_sync', help: '增量同步规划（--repo-root、--diff）' },
    'change-open': { tool: 'normify_change_open', help: '开启变更（--args-json 传 modules/acceptance 等）' },
    'change-list': { tool: 'normify_change_list', help: '列出变更' },
    'change-close': { tool: 'normify_change_close', help: '关闭变更（--id）' },
    'project-list': { tool: 'normify_tree_list', help: '列出结构数据项目' },
    policy: { tool: 'normify_policy_get', help: '读取架构规则（policy.yml）' },
    help: { tool: 'normify_help', help: '工具/主题速查' },
    call: { tool: '', help: '直接调用任意工具：call <tool-name> --args-json <json>' },
};

const FLAG_TO_ARG: Record<string, string> = {
    project: 'project',
    dir: 'dir',
    id: 'id',
    parent: 'parent',
    root: 'root',
    'repo-root': 'repoRoot',
    out: 'out',
    topic: 'topic',
    query: 'query',
    task: 'task',
    status: 'status',
    diff: 'diff',
    body: 'body',
    'dry-run': 'dry_run',
    'direct-only': 'direct_only',
    'expect-updated-at': 'expect_updated_at',
    lang: 'lang',
    theme: 'theme',
};

function parseArgs(argv: string[]): ParsedArgs {
    const out: ParsedArgs = { command: '', positional: [], flags: {} };
    let i = 0;
    while (i < argv.length) {
        const token = argv[i]!;
        if (token === '-h' || token === '--help') {
            out.flags.help = true;
            i++;
            continue;
        }
        if (token.startsWith('--')) {
            const eq = token.indexOf('=');
            const key = eq >= 0 ? token.slice(2, eq) : token.slice(2);
            if (eq >= 0) {
                out.flags[key] = token.slice(eq + 1);
                i++;
                continue;
            }
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                out.flags[key] = next;
                i += 2;
            }
            else {
                out.flags[key] = true;
                i++;
            }
            continue;
        }
        if (out.command === '')
            out.command = token;
        else
            out.positional.push(token);
        i++;
    }
    return out;
}

function printHelp(): void {
    process.stdout.write([
        'Normify CLI v' + VERSION + ' —— 结构编译器（人机共读的模块树源数据）',
        '',
        '用法：',
        '  normify <command> [options]',
        '  normify call <tool-name> --args-json \'{"dir":"F:/repo/normify-demo"}\'',
        '  normify tools',
        '',
        '命令：',
        ...Object.entries(COMMANDS).map(([name, meta]) => '  ' + name.padEnd(14) + meta.help),
        '',
        '通用选项：--project/--dir/--id/--parent/--repo-root/--out/--args-json/--json/--quiet',
        '退出码：0 成功；2 校验错误；4 参数错误；6 安全拒绝；5 其它失败',
    ].join('\n') + '\n');
}

function buildToolArgs(parsed: ParsedArgs): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    if (typeof parsed.flags['args-json'] === 'string') {
        try {
            const extra = JSON.parse(parsed.flags['args-json']) as Record<string, unknown>;
            Object.assign(args, extra);
        }
        catch (error) {
            throw Object.assign(new Error('--args-json 不是合法 JSON：' + String(error)), { code: 'args/invalid-json' });
        }
    }
    for (const [flag, argName] of Object.entries(FLAG_TO_ARG)) {
        const value = parsed.flags[flag];
        if (value === undefined)
            continue;
        if (typeof value === 'boolean')
            args[argName] = value;
        else
            args[argName] = value;
    }
    if (parsed.command === 'init' && (parsed.flags['root-id'] !== undefined || parsed.flags['name-zh'] !== undefined)) {
        const rootId = typeof parsed.flags['root-id'] === 'string' ? parsed.flags['root-id'] : 'root';
        const zh = typeof parsed.flags['name-zh'] === 'string' ? parsed.flags['name-zh'] : rootId;
        const en = typeof parsed.flags['name-en'] === 'string' ? parsed.flags['name-en'] : rootId;
        args.root = { id: rootId, name: { zh, en }, description: { zh, en } };
    }
    return args;
}

function toolByName(specs: NormifyToolSpec[], name: string): NormifyToolSpec | undefined {
    return specs.find(spec => spec.name === name);
}

function exitCodeFor(result: unknown): number {
    const r = result as { ok?: boolean; errors?: unknown[]; error?: { code?: string } };
    if (r.ok === true)
        return 0;
    const code = r.error?.code ?? '';
    if (/security\//.test(code))
        return 6;
    if (/args\/|project\/required/.test(code) || (r.errors ?? []).some(e => /args\//.test(String(e))))
        return 4;
    if (Array.isArray(r.errors) && r.errors.length > 0)
        return 2;
    return 5;
}

async function main(): Promise<void> {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.flags.help === true || parsed.command === '' || parsed.command === 'help') {
        printHelp();
        process.exit(0);
    }
    const env: ToolEnv = {
        rootDir: typeof parsed.flags.root === 'string' ? parsed.flags.root : process.cwd(),
        requireBilingual: parsed.flags['allow-loose-bilingual'] !== true,
    };
    const specs = createNormifyTools(env);
    if (parsed.command === 'tools') {
        process.stdout.write(JSON.stringify(specs.map(spec => ({ name: spec.name, description: spec.description, behavior: spec.behavior })), null, 2) + '\n');
        process.exit(0);
    }
    const meta = COMMANDS[parsed.command];
    const isRawCall = parsed.command === 'call';
    const toolName = isRawCall ? parsed.positional[0] : meta?.tool;
    if (isRawCall && toolName === undefined) {
        process.stderr.write('call 需要工具名：normify call <tool-name> --args-json <json>\n');
        process.exit(4);
    }
    if (toolName === undefined) {
        process.stderr.write('未知命令：' + parsed.command + '（用 --help 查看命令列表）\n');
        process.exit(4);
    }
    const spec = toolByName(specs, toolName);
    if (spec === undefined) {
        process.stderr.write('未知工具：' + toolName + '\n');
        process.exit(4);
    }
    let args: Record<string, unknown>;
    try {
        args = buildToolArgs(parsed);
    }
    catch (error) {
        process.stderr.write(String((error as Error).message) + '\n');
        process.exit(4);
    }
    // 位置参数作为 --id/--query 的简写（get/node 等）
    if (parsed.positional.length > 0 && args.id === undefined && !isRawCall)
        args.id = parsed.positional[0];
    try {
        const result = await spec.execute(args);
        if (parsed.flags.quiet === true && result !== null && typeof result === 'object' && 'ok' in (result as Record<string, unknown>))
            process.stdout.write(JSON.stringify(result) + '\n');
        else
            process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        process.exit(exitCodeFor(result));
    }
    catch (error) {
        const e = error as Error & { code?: string };
        process.stderr.write(JSON.stringify({ ok: false, error: { code: e.code ?? 'internal', message: e.message } }, null, 2) + '\n');
        process.exit(/security\//.test(e.code ?? '') ? 6 : 5);
    }
}

await main();
