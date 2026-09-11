import { readdir, readFile, writeFile, rename, rm, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { deriveParent, isValidId, moduleFilePath, slugify } from './ids.js';
import { parseModuleText, serializeModule } from './frontmatter.js';
import { deleteLayoutFile } from './layout.js';
import { installDefaultPolicy } from './policy.js';
import { diag } from './diag.js';
export const PROJECT_PREFIX = 'normify-';
export class NormifyError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'NormifyError';
    }
}
/** 解析结构数据目录：dir 显式给出，或 normify-<project> 落在 rootDir 下。create=true 时自动创建空项目目录（仅写工具使用）。 */
export async function resolveProject(rootDir, args, opts = {}) {
    const root = resolve(rootDir);
    const ensureModules = async (p) => {
        if (!existsSync(join(p, 'modules'))) {
            if (opts.create) {
                await mkdir(join(p, 'modules'), { recursive: true });
                // 项目创建时自动安装默认架构规则（acyclic 等），让后续设计模块即受约束
                await installDefaultPolicy(p);
            }
            else {
                throw new NormifyError('project/no-modules', '目录不存在或缺少 modules/：' + p);
            }
        }
    };
    if (args.dir !== undefined && args.dir.trim() !== '') {
        const p = resolve(root, args.dir);
        const base = p.split(sep).pop() ?? '';
        if (!base.startsWith(PROJECT_PREFIX)) {
            throw new NormifyError('project/dir-name', '结构数据目录名必须以 ' + PROJECT_PREFIX + ' 开头，如 normify-demo-repo（实际: ' + base + '）');
        }
        await ensureModules(p);
        return { dir: p, slug: base.slice(PROJECT_PREFIX.length) };
    }
    if (args.project !== undefined && args.project.trim() !== '') {
        // 兼容误传：project 含路径特征（斜杠/盘符）时按目录处理
        if (/[\/\\:]/.test(args.project)) {
            const p = resolve(root, args.project);
            const base = p.split(sep).pop() ?? '';
            if (!base.startsWith(PROJECT_PREFIX)) {
                throw new NormifyError('project/dir-name', '结构数据目录名必须以 ' + PROJECT_PREFIX + ' 开头，如 normify-demo-repo（实际: ' + base + '）');
            }
            await ensureModules(p);
            return { dir: p, slug: base.slice(PROJECT_PREFIX.length) };
        }
        const slug = slugify(args.project);
        const p = resolve(root, PROJECT_PREFIX + slug);
        await ensureModules(p);
        return { dir: p, slug };
    }
    throw new NormifyError('project/required', '必须提供 project（项目 slug）或 dir（结构数据目录绝对路径）');
}
export function listProjects(rootDir) {
    const root = resolve(rootDir);
    let entries = [];
    try {
        entries = readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
    }
    catch {
        return [];
    }
    return entries
        .filter(n => n.startsWith(PROJECT_PREFIX))
        .map(n => ({ slug: n.slice(PROJECT_PREFIX.length), dir: join(root, n) }))
        .sort((a, b) => a.slug.localeCompare(b.slug));
}
async function walk(dir, base, out) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const e of entries) {
        const rel = base === '' ? e.name : base + '/' + e.name;
        if (e.isDirectory())
            await walk(join(dir, e.name), rel, out);
        else if (e.name.endsWith('.md'))
            out.push(rel);
    }
}
export async function listModuleFiles(projectDir) {
    const out = [];
    await walk(join(projectDir, 'modules'), '', out);
    return out.sort();
}
/** 找模块现有文件（容器 index.md 优先，其次叶子 x.md）。 */
export function findModuleFile(projectDir, id) {
    if (!isValidId(id))
        return null;
    const container = moduleFilePath(projectDir, id, true);
    if (existsSync(container))
        return container;
    const leaf = moduleFilePath(projectDir, id, false);
    if (existsSync(leaf))
        return leaf;
    return null;
}
export async function loadAllModules(projectDir) {
    const errors = [];
    const warnings = [];
    const files = [];
    for (const rel of await listModuleFiles(projectDir)) {
        const abs = join(projectDir, 'modules', rel.replace(/\//g, sep));
        let text;
        try {
            text = await readFile(abs, 'utf8');
        }
        catch (error) {
            errors.push(diag('error', 'input/read', '无法读取模块文件', { path: rel }, { reason: String(error) }, []));
            continue;
        }
        const parsed = parseModuleText(text, rel);
        errors.push(...parsed.errors);
        warnings.push(...parsed.warnings);
        if (parsed.module !== null) {
            files.push({ module: parsed.module, body: parsed.body, file: rel });
        }
    }
    return { files, errors, warnings };
}
/** 判断某模块当前是否为容器（有子模块或是根）。 */
export function isContainer(module, all) {
    if (module.parent === null)
        return true;
    return all.some(m => m.parent === module.id);
}
/** 写入模块文件；自动晋升父模块（leaf 文件 → index.md）。 */
export async function writeModuleFile(projectDir, module, body) {
    const promoted = [];
    const warnings = [];
    const all = (await loadAllModules(projectDir)).files.map(f => f.module);
    const container = isContainer(module, all);
    const target = moduleFilePath(projectDir, module.id, container);
    const existing = findModuleFile(projectDir, module.id);
    if (existing !== null && existing !== target) {
        await rename(existing, target);
        promoted.push(module.id);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, serializeModule(module, body), 'utf8');
    const parentId = deriveParent(module.id);
    if (parentId !== null) {
        const parentLeaf = moduleFilePath(projectDir, parentId, false);
        if (existsSync(parentLeaf)) {
            const parentContainer = moduleFilePath(projectDir, parentId, true);
            await mkdir(dirname(parentContainer), { recursive: true });
            await rename(parentLeaf, parentContainer);
            promoted.push(parentId);
        }
    }
    return { file: relative(projectDir, target).replace(/\\/g, '/'), promoted, warnings };
}
/** 删除模块及其子树（含空目录清理与父模块降级）。 */
export async function deleteModuleTree(projectDir, id) {
    const warnings = [];
    const { files } = await loadAllModules(projectDir);
    const all = files.map(f => f.module);
    if (!all.some(m => m.id === id)) {
        throw new NormifyError('module/not-found', '模块不存在：' + id);
    }
    const toDelete = new Set([id]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const m of all) {
            if (!toDelete.has(m.id) && m.parent !== null && toDelete.has(m.parent)) {
                toDelete.add(m.id);
                grew = true;
            }
        }
    }
    const order = all.filter(m => toDelete.has(m.id)).sort((a, b) => b.id.length - a.id.length);
    const deleted = [];
    for (const m of order) {
        const file = findModuleFile(projectDir, m.id);
        if (file !== null) {
            await rm(file, { force: true });
            deleted.push(m.id);
        }
    }
    await pruneEmptyDirs(join(projectDir, 'modules'), deleted);
    // 结构删除时同步清理对应的渲染数据（避免孤儿 layout 阻断校验）
    for (const deletedId of deleted)
        await deleteLayoutFile(projectDir, deletedId);
    const parentId = deriveParent(id);
    let demoted = null;
    if (parentId !== null) {
        const remaining = all.filter(m => !toDelete.has(m.id));
        const parentStill = remaining.find(m => m.id === parentId);
        if (parentStill !== undefined && parentStill.parent !== null && !remaining.some(m => m.parent === parentId)) {
            const container = moduleFilePath(projectDir, parentId, true);
            if (existsSync(container)) {
                const leaf = moduleFilePath(projectDir, parentId, false);
                await mkdir(dirname(leaf), { recursive: true });
                await rename(container, leaf);
                await deleteLayoutFile(projectDir, parentId);
                demoted = parentId;
            }
        }
    }
    return { deleted, demoted, warnings };
}
async function pruneEmptyDirs(base, deletedIds) {
    const dirs = new Set();
    for (const id of deletedIds) {
        const segs = id.split('.');
        for (let i = 1; i <= segs.length; i++) {
            dirs.add(join(base, ...segs.slice(0, i)));
        }
    }
    const sorted = [...dirs].sort((a, b) => b.length - a.length);
    for (const d of sorted) {
        try {
            const entries = await readdir(d);
            if (entries.length === 0)
                await rm(d, { force: true });
        }
        catch {
            /* 非空或不存在则跳过 */
        }
    }
}
/** 叶子晋升容器：x.md → x/index.md。 */
export async function promoteModule(projectDir, id) {
    const warnings = [];
    const container = moduleFilePath(projectDir, id, true);
    const leaf = moduleFilePath(projectDir, id, false);
    if (existsSync(container)) {
        return { file: relative(projectDir, container).replace(/\\/g, '/'), warnings };
    }
    if (!existsSync(leaf)) {
        throw new NormifyError('module/not-found', '模块不存在：' + id);
    }
    await mkdir(dirname(container), { recursive: true });
    await rename(leaf, container);
    return { file: relative(projectDir, container).replace(/\\/g, '/'), warnings };
}
/** 仓库当前 HEAD（40 位 SHA）。 */
export function gitHead(repoRoot) {
    const result = spawnSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    if (result.error !== undefined)
        return { sha: null, error: 'git 不可用：' + result.error.message };
    if (result.status !== 0)
        return { sha: null, error: 'git rev-parse 失败：' + String(result.stderr ?? '').slice(0, 200) };
    const sha = String(result.stdout).trim();
    if (!/^[a-f0-9]{40}$/.test(sha))
        return { sha: null, error: 'git HEAD 不是 40 位 SHA：' + sha };
    return { sha, error: null };
}
/** git 变更文件清单（增量再生成的输入）。 */
export function gitChangedFiles(repoRoot, diffSpec) {
    const spec = diffSpec.trim() === '' ? 'HEAD' : diffSpec.trim();
    const result = spawnSync('git', ['-C', repoRoot, 'diff', '--name-only', spec], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (result.error !== undefined) {
        return { files: null, error: 'git 不可用：' + result.error.message };
    }
    if (result.status !== 0) {
        return { files: null, error: 'git diff 失败（exit ' + result.status + '）：' + String(result.stderr ?? '').slice(0, 300) };
    }
    const changed = String(result.stdout).split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
    // 新增但未 add 的文件（AI 开发中最常见的“新文件”形态）也纳入同步建议
    const untracked = spawnSync('git', ['-C', repoRoot, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (untracked.error === undefined && untracked.status === 0) {
        for (const f of String(untracked.stdout).split(/\r?\n/).map(s => s.trim())) {
            if (f.length > 0 && !changed.includes(f))
                changed.push(f);
        }
    }
    return { files: changed, error: null };
}
/** source 文件集合的 SHA-256 指纹（全量哈希，v1 不做采样）。 */
export async function fingerprintOf(repoRoot, sources) {
    const paths = [...new Set(sources.map(s => s.path))].sort();
    const missing = [];
    const hash = createHash('sha256');
    for (const p of paths) {
        try {
            const buf = await readFile(join(repoRoot, p));
            hash.update(p);
            hash.update('\0');
            hash.update(buf);
        }
        catch {
            missing.push(p);
        }
    }
    return { hash: missing.length > 0 ? null : hash.digest('hex'), missing };
}
export function sha256Text(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}
//# sourceMappingURL=store.js.map