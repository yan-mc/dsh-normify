/**
 * DSH 适配层：把 core 的工具规格注册到 `ctx.tools`。
 * 这里是 src/dsh 中唯一接触 DSH 工具 API 的地方；engine/ops 全部在 src/core。
 */
import type { Context } from '@deepseek-ai/cordis';
import { createNormifyTools } from '../core/toolset.js';
import type { NormifyToolSpec, ToolEnv } from '../core/toolset.js';

export type { ToolEnv } from '../core/toolset.js';

interface ToolContentPart {
    type: string;
    text?: string;
}

interface ToolRegistration {
    name: string;
    description: string;
    behavior: string;
    parameters?: Record<string, unknown>;
    readOnly: boolean;
    idempotent: boolean;
    destructive: boolean;
    output: {
        schema: Record<string, unknown>;
        render: (args: Record<string, unknown>, value: unknown) => ToolContentPart[];
    };
    execute: (args: Record<string, unknown>) => Promise<unknown>;
    isConcurrencySafe?: () => boolean;
}

interface ToolService {
    register?: (def: ToolRegistration) => void;
}

/** 把一个与 DSH 无关的工具规格映射成 dsh-tools 的注册对象（0.6.x 仍用旧注册面；0.7 迁 defineTool）。 */
export function toDshRegistration(spec: NormifyToolSpec): ToolRegistration {
    const behavior = spec.behavior;
    return {
        name: spec.name,
        description: spec.description,
        behavior,
        ...(spec.parameters !== undefined ? { parameters: spec.parameters as Record<string, unknown> } : {}),
        // 旧版行为标记：0.2.x 运行时已不读取，保留仅为兼容旧文档（P1-05 迁移时删除）。
        readOnly: behavior === 'read',
        idempotent: behavior === 'read' || behavior === 'idempotent' || behavior === 'destroy',
        destructive: behavior === 'destroy',
        output: {
            schema: {},
            render: (_args, value) => [
                { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
            ],
        },
        execute: (args) => spec.execute(args),
        ...(behavior === 'read' ? { isConcurrencySafe: () => true } : {}),
    };
}

/** 把全部 normify 工具注册到当前 DSH 上下文。 */
export function registerTools(ctx: Context, env: ToolEnv): void {
    const service = (ctx as unknown as { tools?: ToolService }).tools;
    if (service === undefined || service.register === undefined)
        return;
    for (const spec of createNormifyTools(env))
        service.register(toDshRegistration(spec));
}
