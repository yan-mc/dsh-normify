import type { Diagnostic, ModuleFile, PolicyData } from './types.js';
/**
 * 架构规则（policy.yml）：项目设计阶段安装，`normify_validate` 强制执行。
 * 规则类型：forbid-dependency / dependency-direction / acyclic / max-depth / cross-tree / naming。
 * 缺失 policy.yml 的项目记 warning（policy/missing），不影响旧数据兼容。
 */
export declare const POLICY_SCHEMA_VERSION = 1;
export declare function policyFilePath(projectDir: string): string;
/** id 模式匹配：`*` 恰一段、`**` 任意段（含零段），其余精确匹配。 */
export declare function matchIdPattern(pattern: string, id: string): boolean;
/** 默认规则模板（项目创建时写入；含两条启用的基础规则与全部类型的注释示例）。 */
export declare function defaultPolicyTemplate(): string;
/** L1：policy.yml 结构与规则字段校验。 */
export declare function l1ValidatePolicy(data: unknown, where: string): {
    policy: PolicyData | null;
    errors: Diagnostic[];
    warnings: Diagnostic[];
};
/** 读取 policy.yml；不存在返回 null（不报错）。 */
export declare function loadPolicyFile(projectDir: string): Promise<{
    policy: PolicyData | null;
    exists: boolean;
    errors: Diagnostic[];
}>;
export declare function writePolicyFile(projectDir: string, policy: PolicyData): Promise<string>;
/** 项目创建时安装默认规则（已存在则不覆盖）。 */
export declare function installDefaultPolicy(projectDir: string): Promise<void>;
interface EvalContext {
    files: ModuleFile[];
    byId: Map<string, ModuleFile>;
}
/** L2：执行全部启用的规则。 */
export declare function evaluatePolicy(policy: PolicyData, ctx: EvalContext): Diagnostic[];
/** 供工具/诊断展示的规则类型说明。 */
export declare function policyReference(): string;
export {};
