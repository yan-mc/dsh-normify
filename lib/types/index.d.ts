import type { Context } from '@deepseek-ai/cordis';
export declare const name = "@dsh-external/dsh-normify";
export declare const inject: string[];
export interface Config {
    rootDir: string;
    requireBilingual: boolean;
}
export declare const Config: any;
export declare function apply(ctx: Context, config: Config): void;
