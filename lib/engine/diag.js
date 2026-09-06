export function diag(severity, code, message, subject, evidence, supportedFixes) {
    const d = { code, severity, message };
    if (subject !== undefined)
        d.subject = subject;
    if (evidence !== undefined)
        d.evidence = evidence;
    if (supportedFixes !== undefined && supportedFixes.length > 0)
        d.supportedFixes = supportedFixes;
    return d;
}
export function fmtDiag(d) {
    const where = d.subject ? ' @ ' + JSON.stringify(d.subject) : '';
    const fix = d.supportedFixes && d.supportedFixes.length > 0 ? ' → 修复: ' + d.supportedFixes.join('; ') : '';
    return '[' + d.severity + '] ' + d.code + ': ' + d.message + where + fix;
}
export function emptyResult() {
    return { ok: true, errors: [], warnings: [] };
}
export function failResult(errors, warnings = []) {
    return { ok: errors.length === 0, errors, warnings };
}
export function summarize(result) {
    if (result.errors.length === 0 && result.warnings.length === 0)
        return '0 error / 0 warning';
    return result.errors.length + ' error / ' + result.warnings.length + ' warning';
}
//# sourceMappingURL=diag.js.map