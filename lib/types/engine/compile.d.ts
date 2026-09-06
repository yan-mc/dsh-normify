import type { Diagnostic } from './types.js';
import { type ValidateOptions, type ValidateOutput } from './validate.js';
export interface BuildOptions extends ValidateOptions {
}
export interface BuildOutput {
    ok: boolean;
    receipt: Record<string, unknown> | null;
    errors: Diagnostic[];
    warnings: Diagnostic[];
    validate: ValidateOutput | null;
}
/** L3：校验通过后编译 tree.json / outline.md / api-index.json / receipt.json（冻结）。 */
export declare function buildProject(projectDir: string, opts: BuildOptions): Promise<BuildOutput>;
