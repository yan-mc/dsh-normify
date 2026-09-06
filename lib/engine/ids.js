import { join } from 'node:path';
const SEG = /^[a-z0-9][a-z0-9-]*$/;
export const MAX_DEPTH = 8;
export function splitId(id) {
    if (typeof id !== 'string' || id.length === 0 || id.length > 512)
        return null;
    const segs = id.split('.');
    if (segs.length === 0 || segs.length > MAX_DEPTH)
        return null;
    for (const s of segs)
        if (!SEG.test(s))
            return null;
    return segs;
}
export function isValidId(id) {
    return splitId(id) !== null;
}
/** 父 id = 去掉最后一段；单段（树名/根）的父为 null。 */
export function deriveParent(id) {
    const segs = splitId(id);
    if (segs === null)
        return null;
    return segs.length === 1 ? null : segs.slice(0, -1).join('.');
}
export function treeOf(id) {
    const segs = splitId(id);
    return segs === null ? '' : segs[0];
}
export function depthOf(id) {
    const segs = splitId(id);
    return segs === null ? 0 : segs.length;
}
export function slugify(name) {
    return String(name)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'project';
}
/** API 键：http 类为 "METHOD path"，其余为 "protocol:path"。 */
export function apiKey(api) {
    const proto = String(api.protocol).toLowerCase();
    if (proto === 'http') {
        return String(api.method ?? '').toUpperCase() + ' ' + api.path;
    }
    return proto + ':' + api.path;
}
/** modules/ 相对路径 → 模块 id（根 <tree>/index.md → <tree>）。 */
export function idFromFilePath(relPath) {
    const rel = relPath.replace(/\\/g, '/');
    if (!rel.startsWith('modules/'))
        return null;
    const parts = rel.slice('modules/'.length).split('/');
    const file = parts.pop();
    if (file === undefined || !file.endsWith('.md'))
        return null;
    if (parts.length === 0)
        return null;
    const stem = file.slice(0, -3);
    const segs = stem === 'index' ? parts : [...parts, stem];
    if (segs.length > MAX_DEPTH)
        return null;
    for (const s of segs)
        if (!SEG.test(s))
            return null;
    return segs.join('.');
}
/** 模块文件的绝对路径。容器 = <seg>/index.md，叶子 = <last>.md，根 = modules/<tree>/index.md。 */
export function moduleFilePath(projectDir, id, isContainer) {
    const segs = splitId(id);
    if (segs === null)
        throw new Error('normify: invalid module id: ' + JSON.stringify(id));
    const tree = segs[0];
    if (segs.length === 1)
        return join(projectDir, 'modules', tree, 'index.md');
    const rest = segs.slice(1);
    if (isContainer)
        return join(projectDir, 'modules', tree, ...rest, 'index.md');
    const last = rest[rest.length - 1];
    return join(projectDir, 'modules', tree, ...rest.slice(0, -1), last + '.md');
}
//# sourceMappingURL=ids.js.map