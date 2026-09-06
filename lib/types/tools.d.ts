import type { Context } from '@deepseek-ai/cordis';
export interface ToolEnv {
    rootDir: string;
    requireBilingual: boolean;
}
export declare function registerTools(ctx: Context, env: ToolEnv): void;
