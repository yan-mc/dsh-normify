import type { Diagnostic, ModuleFile } from './types.js';
import { depthOf, deriveParent, treeOf } from './ids.js';
export interface ValidateOptions {
    repoRoot?: string;
    requireBilingual: boolean;
}
export interface ValidateOutput {
    ok: boolean;
    errors: Diagnostic[];
    warnings: Diagnostic[];
    files: ModuleFile[];
    childrenOf: Map<string, string[]>;
    byId: Map<string, ModuleFile>;
}
/** L2：全项目校验（规范 §5.2 规则全集）。零容忍：任何 error 阻断构建。 */
export declare function validateProject(projectDir: string, opts: ValidateOptions): Promise<ValidateOutput>;
export { depthOf, deriveParent, treeOf };
