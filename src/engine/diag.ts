import type { Diagnostic, ValidateResult } from './types.js'

export function diag(
  severity: 'error' | 'warning',
  code: string,
  message: string,
  subject?: Record<string, unknown>,
  evidence?: Record<string, unknown>,
  supportedFixes?: string[],
): Diagnostic {
  const d: Diagnostic = { code, severity, message }
  if (subject !== undefined) d.subject = subject
  if (evidence !== undefined) d.evidence = evidence
  if (supportedFixes !== undefined && supportedFixes.length > 0) d.supportedFixes = supportedFixes
  return d
}

export function fmtDiag(d: Diagnostic): string {
  const where = d.subject ? ' @ ' + JSON.stringify(d.subject) : ''
  const fix = d.supportedFixes && d.supportedFixes.length > 0 ? ' → 修复: ' + d.supportedFixes.join('; ') : ''
  return '[' + d.severity + '] ' + d.code + ': ' + d.message + where + fix
}

export function emptyResult(): ValidateResult {
  return { ok: true, errors: [], warnings: [] }
}

export function failResult(errors: Diagnostic[], warnings: Diagnostic[] = []): ValidateResult {
  return { ok: errors.length === 0, errors, warnings }
}

export function summarize(result: ValidateResult): string {
  if (result.errors.length === 0 && result.warnings.length === 0) return '0 error / 0 warning'
  return result.errors.length + ' error / ' + result.warnings.length + ' warning'
}
