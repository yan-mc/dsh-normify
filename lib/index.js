import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTools } from './tools.js';
// vendored schemastery：相对路径加载（不依赖注入器环境的包名解析）
// @ts-expect-error vendored mjs 无声明文件
const zModule = await import('../vendor/schemastery/lib/index.mjs');
const z = zModule.default;
export const name = '@dsh-external/dsh-normify';
export const inject = ['tools', 'skills'];
export const Config = z.object({
    rootDir: z.string().default('.'),
    requireBilingual: z.boolean().default(true),
    devCompanionReminder: z.boolean().default(false),
    devCompanionReminderAfter: z.number().default(8),
});
export function apply(ctx, config) {
    registerTools(ctx, { rootDir: config.rootDir, requireBilingual: config.requireBilingual });
    installCompanionReminder(ctx, config);
    const skillRegistered = registerSkill(ctx);
    const message = '[normify] dsh-normify 0.5.1 已加载：30 个 normify_* 工具' +
        (skillRegistered ? ' + normify-gen 技能（rootDir=' + config.rootDir + '）' : '（技能未注册）');
    ctx.logger?.info?.(message);
    console.log(message);
}
/**
 * 伴随开发提醒钩子（默认关，config.devCompanionReminder=true 开启）：
 * 连续 N 个"写文件类"工具调用后，在下一次写工具结果里追加一条提醒，
 * 提示运行 normify_sync / normify_change_close 同步结构树。只提醒，不自动改写结构。
 */
function installCompanionReminder(ctx, config) {
    if (!config.devCompanionReminder)
        return;
    const threshold = Math.max(1, Math.floor(config.devCompanionReminderAfter));
    const WRITE_TOOLS = /^(write|edit|str_replace_editor|apply_patch|patch|multi_edit|create_file|insert|fs_write)$/i;
    let writes = 0;
    const anyCtx = ctx;
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
function registerSkill(ctx) {
    const skills = ctx.skills;
    const logger = ctx.logger;
    if (skills === undefined || skills.register === undefined) {
        logger?.warn?.('[normify] skills 服务不可用，normify-gen 技能未注册');
        return false;
    }
    try {
        const dir = dirname(fileURLToPath(import.meta.url));
        const skillDir = join(dir, '..', 'skills', 'normify-gen');
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
function parseSkillMarkdown(raw) {
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
//# sourceMappingURL=index.js.map