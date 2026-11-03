/** 原子写与路径包含性工具：所有结构数据写盘都必须经过这里（P0-02/P0-06）。 */
import { dirname, isAbsolute, join, relative, resolve, basename, sep } from 'node:path';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';

/** 判断 child 是否位于 parent 之内（含 parent 本身）；不依赖字符串前缀，避免 `normify-a` vs `normify-ab` 误判。 */
export function isInside(parent: string, child: string): boolean {
    const rel = relative(resolve(parent), resolve(child));
    if (rel === '') return true;
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return false;
    return true;
}

/** 解析并断言 target 位于 projectDir 内；越界抛带 code 的错误（由工具层转成可修复诊断）。 */
export function assertInsideProject(projectDir: string, target: string): string {
    const abs = resolve(projectDir, target);
    if (!isInside(projectDir, abs)) {
        const err = new Error('路径越界：' + abs + ' 不在结构数据目录 ' + resolve(projectDir) + ' 内');
        (err as Error & { code?: string }).code = 'security/path-outside-project';
        throw err;
    }
    return abs;
}

/** 输出文件名只允许纯文件名（禁止目录分隔符与 ..），默认 normify.html。 */
export function safeOutName(out: string | undefined, fallback = 'normify.html'): string {
    const raw = out === undefined ? '' : out.trim();
    if (raw === '') return fallback;
    if (raw.includes('/') || raw.includes('\\') || raw === '.' || raw === '..' || basename(raw) !== raw) {
        const err = new Error('输出文件名不合法（只允许纯文件名，禁止路径分隔符与 ..）：' + raw);
        (err as Error & { code?: string }).code = 'args/invalid-out';
        throw err;
    }
    return raw;
}

/**
 * 原子写：同目录临时文件 → fsync → rename 覆盖。进程崩溃时要么是旧文件、要么是新文件，不会出现半截内容。
 * 目录 fsync 在 Windows 上不可用，静默跳过。
 */
export async function writeFileAtomic(filePath: string, data: string | Buffer): Promise<void> {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    const tmp = join(dir, '.' + basename(filePath) + '.tmp-' + process.pid + '-' + Math.random().toString(16).slice(2) + '-' + Date.now().toString(36));
    try {
        const fh = await open(tmp, 'w');
        try {
            await fh.writeFile(data);
            await fh.sync();
        }
        finally {
            await fh.close();
        }
        await rename(tmp, filePath);
    }
    catch (error) {
        await rm(tmp, { force: true }).catch(() => { /* 清理失败不掩盖原错误 */ });
        throw error;
    }
    // 目录 fsync：保证 rename 持久化（POSIX）。Windows 打开目录会失败，忽略。
    try {
        const fh = await open(dir, 'r');
        try {
            await fh.sync();
        }
        finally {
            await fh.close();
        }
    }
    catch {
        /* ignore */
    }
}

export interface FileStatInfo {
    exists: boolean;
    isFile: boolean;
    size: number;
}

/** 读取普通文件的大小信息（不跟随目录）；供 fingerprint 的安全上限使用。 */
export async function fileStatInfo(path: string): Promise<FileStatInfo> {
    try {
        const st = await stat(path);
        return { exists: true, isFile: st.isFile(), size: st.size };
    }
    catch {
        return { exists: false, isFile: false, size: 0 };
    }
}
