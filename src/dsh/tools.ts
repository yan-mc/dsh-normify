/**
 * DSH 适配层：把 core 的工具规格注册到 `ctx.tools`。
 * 这里是 src/dsh 中唯一接触 DSH 工具 API 的地方；engine/ops 全部在 src/core。
 * 工具定义构造见 ./definition.ts（与 0.2.x defineTool 输出契约等价，ADR-0010）。
 */
import type { Context } from '@deepseek-ai/cordis';
import { createNormifyTools } from '../core/toolset.js';
import type { NormifyToolSpec, ToolEnv } from '../core/toolset.js';
import { toToolDefinition } from './definition.js';

export type { ToolEnv } from '../core/toolset.js';

interface ToolService {
    register?: (def: unknown) => void;
}

/** 工具名 → 行为（read/write/destroy/idempotent），供审批/护栏使用。 */
export function toolBehaviors(env: ToolEnv): Map<string, string> {
    const map = new Map<string, string>();
    for (const spec of createNormifyTools(env))
        map.set(spec.name, spec.behavior);
    return map;
}

/** 把全部 normify 工具（含真实 output schema / presenters）注册到当前 DSH 上下文。 */
export function registerTools(ctx: Context, env: ToolEnv): void {
    const service = (ctx as unknown as { tools?: ToolService }).tools;
    if (service === undefined || service.register === undefined)
        return;
    for (const spec of createNormifyTools(env))
        service.register(toToolDefinition(spec));
}
