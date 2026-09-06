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
});
export function apply(ctx, config) {
    registerTools(ctx, { rootDir: config.rootDir, requireBilingual: config.requireBilingual });
    registerSkill(ctx);
}
function registerSkill(ctx) {
    const skills = ctx.skills;
    const logger = ctx.logger;
    if (skills === undefined || skills.register === undefined) {
        logger?.warn?.('[normify] skills 服务不可用，normify-gen 技能未注册');
        return;
    }
    try {
        const dir = dirname(fileURLToPath(import.meta.url));
        const skillDir = join(dir, '..', 'skills', 'normify-gen');
        const raw = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
        const parsed = parseSkillMarkdown(raw);
        if (parsed === null) {
            logger?.warn?.('[normify] SKILL.md frontmatter 无效，技能未注册');
            return;
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
    }
    catch (error) {
        logger?.warn?.('[normify] 技能注册失败：' + String(error));
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