import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTools, toolBehaviors } from './tools.js';
import type { Context } from '@deepseek-ai/cordis';
// vendored schemastery：相对路径加载（不依赖注入器环境的包名解析）
// @ts-expect-error vendored mjs 无声明文件
const zModule = await import('../../vendor/schemastery/lib/index.mjs');
const z = zModule.default;
export const name = '@dsh-external/dsh-normify';
export const inject = ['tools', 'skills'];
export interface Config {
    rootDir: string;
    requireBilingual: boolean;
    /** 伴随开发提醒钩子（默认关）：连续修改 N 个文件后提醒同步结构树。 */
    devCompanionReminder: boolean;
    devCompanionReminderAfter: number;
    /** destroy 类工具（module_delete / layout_delete）是否走一次性审批（默认开，防误删）。 */
    approveDestructive: boolean;
    /** 工具面：full=31 个旧工具（默认，0.6 兼容）；core=7 个原语（0.7 目标面，0.6 起 opt-in）。 */
    toolset: 'full' | 'core';
}
export const Config = z.object({
    rootDir: z.string().default('.'),
    requireBilingual: z.boolean().default(true),
    devCompanionReminder: z.boolean().default(false),
    devCompanionReminderAfter: z.number().default(8),
    approveDestructive: z.boolean().default(true),
    toolset: z.string().default('full'),
});
function readPluginVersion(): string {
    try {
        const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8');
        return String((JSON.parse(raw) as { version?: unknown }).version ?? '0');
    }
    catch {
        return '0';
    }
}
export function apply(ctx: Context, config: Config): void {
    const toolset: 'full' | 'core' = config.toolset === 'core' ? 'core' : 'full';
    registerTools(ctx, { rootDir: config.rootDir, requireBilingual: config.requireBilingual, version: readPluginVersion(), toolset });
    installCompanionReminder(ctx, config);
    installDestructiveApproval(ctx, config);
    const skillRegistered = registerSkill(ctx);
    const message = '[normify] dsh-normify 已加载：31 个 normify_* 工具' +
        (skillRegistered ? ' + normify-gen 技能（rootDir=' + config.rootDir + '）' : '（技能未注册）');
    ctx.logger?.info?.(message);
}
interface ToolContentPart {
    type: string;
    text?: string;
}
interface ToolExecInfo {
    name?: string;
}
interface ToolExecResult {
    content?: ToolContentPart[];
}
interface ToolDecision {
    kind: string;
    content?: ToolContentPart[];
}
type ToolExecuteNext = () => Promise<ToolDecision | undefined>;
type PostExecuteListener = (exec: ToolExecInfo | undefined, result: ToolExecResult | undefined, next: ToolExecuteNext) => Promise<ToolDecision | undefined>;
interface CompanionContext {
    on?: (name: string, listener: PostExecuteListener) => void;
}
/**
 * 伴随开发提醒钩子（默认关，config.devCompanionReminder=true 开启）：
 * 连续 N 个"写文件类"工具调用后，在下一次写工具结果里追加一条提醒，
 * 提示运行 normify_sync / normify_change_close 同步结构树。只提醒，不自动改写结构。
 */
function installCompanionReminder(ctx: Context, config: Config): void {
    if (!config.devCompanionReminder)
        return;
    const threshold = Math.max(1, Math.floor(config.devCompanionReminderAfter));
    const WRITE_TOOLS = /^(write|edit|str_replace_editor|apply_patch|patch|multi_edit|create_file|insert|fs_write)$/i;
    let writes = 0;
    const anyCtx = ctx as unknown as CompanionContext;
    anyCtx.on?.('tools/post-execute', async (exec, result, next) => {
        const nextFn = next;
        const execInfo = exec;
        if (typeof execInfo?.name !== 'string' || !WRITE_TOOLS.test(execInfo.name))
            return nextFn();
        writes++;
        if (writes < threshold)
            return nextFn();
        writes = 0;
        const reminder = '[normify] 已连续修改 ' + threshold + ' 个文件：结构树可能已漂移。建议运行 normify_sync（v2：脏模块/新增文件建议/破坏性 API 变更），收尾用 normify_change_close（0 error 强制）同步模块与渲染数据。';
        const res = result;
        const decision = await nextFn();
        if (decision?.kind !== 'accept' || !Array.isArray(res?.content))
            return decision;
        return { ...decision, content: [...res.content, { type: 'text', text: reminder }] };
    });
}
interface PreExecuteInfo {
    name?: string;
    arguments?: unknown;
}
type PreExecuteNext = () => Promise<{ kind: string }>;
type PreExecuteListener = (exec: PreExecuteInfo | undefined, next: PreExecuteNext) => Promise<unknown>;
interface ApprovalContext {
    on?: (name: string, listener: PreExecuteListener) => void;
}
/**
 * destroy 类工具的一次性审批（0.2.x `tools/pre-execute` 返回 ask）：
 * 第三方工具不被 sandbox 约束，删除结构数据的动作必须由人确认（config.approveDestructive=false 可关）。
 */
function installDestructiveApproval(ctx: Context, config: Config): void {
    if (!config.approveDestructive)
        return;
    const behaviors = toolBehaviors({ rootDir: config.rootDir, requireBilingual: config.requireBilingual, toolset: config.toolset === 'core' ? 'core' : 'full' });
    const anyCtx = ctx as unknown as ApprovalContext;
    const DESTRUCTIVE_OPS = new Set(['delete', 'layout_delete']);
    anyCtx.on?.('tools/pre-execute', async (exec, next) => {
        const toolName = exec?.name;
        if (typeof toolName !== 'string')
            return next();
        const isDestroy = behaviors.get(toolName) === 'destroy';
        const args = (exec?.arguments ?? {}) as Record<string, unknown>;
        const isPrimitiveDelete = toolName === 'normify_write' && typeof args.op === 'string' && DESTRUCTIVE_OPS.has(args.op);
        if (!isDestroy && !isPrimitiveDelete)
            return next();
        return {
            kind: 'ask',
            reason: 'normify 破坏性操作：' + toolName,
            displayReason: {
                en: 'Normify will delete structure data (' + toolName + '). Allow this once?',
                'zh-CN': 'Normify 将删除结构数据（' + toolName + '），是否允许本次操作？',
                zh: 'Normify 将删除结构数据（' + toolName + '），是否允许本次操作？',
            },
        };
    });
}
interface SkillSpec {
    name: string;
    description: string;
    content: string;
    provider: string;
    source: string;
    resourceBase: { kind: 'directory'; path: string };
    invocation: { modelInvocable: boolean; userInvocable: boolean };
}
interface SkillsService {
    register?: (spec: SkillSpec) => () => void;
}
interface ContextWithSkills {
    skills?: SkillsService;
}
function registerSkill(ctx: Context): boolean {
    const skills = (ctx as ContextWithSkills).skills;
    const logger = ctx.logger;
    if (skills === undefined || skills.register === undefined) {
        logger?.warn?.('[normify] skills 服务不可用，normify-gen 技能未注册');
        return false;
    }
    try {
        const dir = dirname(fileURLToPath(import.meta.url));
        const skillDir = join(dir, '..', '..', 'skills', 'normify-gen');
        const raw = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
        const parsed = parseSkillMarkdown(raw);
        if (parsed === null) {
            logger?.warn?.('[normify] SKILL.md frontmatter 无效，技能未注册');
            return false;
        }
        const disposer = skills.register({
            name: 'normify-gen',
            description: parsed.description,
            content: parsed.body,
            provider: 'normify-plugin',
            source: 'bundled',
            resourceBase: { kind: 'directory', path: skillDir },
            invocation: { modelInvocable: true, userInvocable: true },
        });
        ctx.effect(() => disposer, '[normify] skill normify-gen');
        return true;
    }
    catch (error) {
        logger?.warn?.('[normify] 技能注册失败：' + String(error));
        return false;
    }
}
function parseSkillMarkdown(raw: string) {
    const lines = raw.split(/\r?\n/);
    if (lines[0] === undefined || lines[0].trim() !== '---')
        return null;
    let close = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            close = i;
            break;
        }
    }
    if (close < 0)
        return null;
    const fm = lines.slice(1, close).join('\n');
    const m = /^description:\s*(.+)$/m.exec(fm);
    if (m === null)
        return null;
    const description = m[1].trim();
    if (description.length === 0)
        return null;
    const body = lines.slice(close + 1).join('\n').replace(/^\n+/, '');
    return { description, body };
}
