import type { Diagnostic } from './types.js';
import { type ValidateOptions, type ValidateOutput } from './validate.js';
export interface BuildOptions extends ValidateOptions {
}
export interface BuildOutput {
    ok: boolean;
    receipt: Record<string, unknown> | null;
    /** receipt.json 自身的 SHA-256（写入 receipt.sha256 sidecar；receipt 内部不含自身哈希，见 P0-03）。 */
    receiptSha256: string | null;
    errors: Diagnostic[];
    warnings: Diagnostic[];
    validate: ValidateOutput | null;
}
/** L3：校验通过后编译 tree.json / outline.md / api-index.json / receipt.json（冻结）。 */
export declare function buildProject(projectDir: string, opts: BuildOptions): Promise<BuildOutput>;
