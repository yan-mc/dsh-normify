import type { Diagnostic, ValidateResult } from './types.js';
export declare function diag(severity: 'error' | 'warning', code: string, message: string, subject?: Record<string, unknown>, evidence?: Record<string, unknown>, supportedFixes?: string[]): Diagnostic;
export declare function fmtDiag(d: Diagnostic): string;
export declare function emptyResult(): ValidateResult;
export declare function failResult(errors: Diagnostic[], warnings?: Diagnostic[]): ValidateResult;
export declare function summarize(result: ValidateResult): string;
