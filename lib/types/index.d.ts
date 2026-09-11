import type { Context } from '@deepseek-ai/cordis';
export declare const name = "@dsh-external/dsh-normify";
export declare const inject: string[];
export interface Config {
    rootDir: string;
    requireBilingual: boolean;
    /** 伴随开发提醒钩子（默认关）：连续修改 N 个文件后提醒同步结构树。 */
    devCompanionReminder: boolean;
    devCompanionReminderAfter: number;
}
export declare const Config: any;
export declare function apply(ctx: Context, config: Config): void;
