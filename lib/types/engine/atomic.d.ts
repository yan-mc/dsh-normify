/** 判断 child 是否位于 parent 之内（含 parent 本身）；不依赖字符串前缀，避免 `normify-a` vs `normify-ab` 误判。 */
export declare function isInside(parent: string, child: string): boolean;
/** 解析并断言 target 位于 projectDir 内；越界抛带 code 的错误（由工具层转成可修复诊断）。 */
export declare function assertInsideProject(projectDir: string, target: string): string;
/** 输出文件名只允许纯文件名（禁止目录分隔符与 ..），默认 normify.html。 */
export declare function safeOutName(out: string | undefined, fallback?: string): string;
/**
 * 原子写：同目录临时文件 → fsync → rename 覆盖。进程崩溃时要么是旧文件、要么是新文件，不会出现半截内容。
 * 目录 fsync 在 Windows 上不可用，静默跳过。
 */
export declare function writeFileAtomic(filePath: string, data: string | Buffer): Promise<void>;
export interface FileStatInfo {
    exists: boolean;
    isFile: boolean;
    size: number;
}
/** 读取普通文件的大小信息（不跟随目录）；供 fingerprint 的安全上限使用。 */
export declare function fileStatInfo(path: string): Promise<FileStatInfo>;
