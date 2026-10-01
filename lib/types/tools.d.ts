import type { Context } from '@deepseek-ai/cordis';
export interface ToolEnv {
    rootDir: string;
    requireBilingual: boolean;
}
/** JSON Schema 节点（作者态：属性级内联 required: true；编译后对象级为 required: string[]）。 */
interface SchemaNode {
    type?: string | string[];
    description?: string;
    required?: boolean | string[];
    properties?: Record<string, SchemaNode>;
    items?: SchemaNode;
    additionalProperties?: boolean;
    [key: string]: unknown;
}
/** params() 编译出的对象级 JSON Schema。 */
type ObjectSchema = SchemaNode & {
    required?: string[];
};
/** 工具行为标记：read=只读；write=写入；destroy=破坏性；idempotent=幂等。 */
type ToolBehavior = 'read' | 'write' | 'destroy' | 'idempotent';
/** dsh-tools 服务的注册面（可选外部服务）。 */
interface ToolService {
    register?: (def: ToolRegistration) => void;
}
/** 交给 tools.register 的注册对象。 */
export interface ToolRegistration {
    name: string;
    description: string;
    behavior: ToolBehavior;
    parameters?: ObjectSchema;
    readOnly: boolean;
    idempotent: boolean;
    destructive: boolean;
    output: {
        schema: Record<string, unknown>;
        render: (args: Record<string, unknown>, value: unknown) => {
            type: string;
            text: string | undefined;
        }[];
    };
    execute: (args: Record<string, unknown>) => Promise<unknown>;
    isConcurrencySafe?: () => boolean;
}
export declare function registerTools(ctx: Context | {
    tools?: ToolService;
}, env: ToolEnv): void;
export {};
