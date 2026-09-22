import type { Api } from './types.js';
export declare function splitId(id: string): string[] | null;
export declare function isValidId(id: string): boolean;
/** 保留末段名：与「父容器的模块文件」解析到同一路径（如 demo.order（容器）与 demo.order.index（叶子）同为 demo/order/index.md）。 */
export declare const RESERVED_LAST_SEGMENTS: Set<string>;
export declare function hasReservedLastSegment(id: string): boolean;
/** 父 id = 去掉最后一段；单段（树名/根）的父为 null。 */
export declare function deriveParent(id: string): string | null;
export declare function treeOf(id: string): string;
export declare function depthOf(id: string): number;
export declare function slugify(name: string): string;
/** API 键：http 类为 "METHOD path"，其余为 "protocol:path"。 */
export declare function apiKey(api: Api): string;
/** modules/ 相对路径 → 模块 id（根 <tree>/index.md → <tree>）。 */
export declare function idFromFilePath(relPath: string): string | null;
/** 模块文件的绝对路径。容器 = <seg>/index.md，叶子 = <last>.md，根 = modules/<tree>/index.md。 */
export declare function moduleFilePath(projectDir: string, id: string, isContainer: boolean): string;
