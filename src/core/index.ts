/**
 * Normify Core：纯 Node 的结构引擎（数据模型/校验/编译/渲染/变更/事务写）。
 * 约束：本目录（src/core/**）禁止 import 任何 `@deepseek-ai/*`（DSH 适配层在 src/dsh）。
 * CLI（src/cli）与 DSH 插件（src/dsh）都只通过这个 barrel 使用引擎能力。
 */
export * from './engine/types.js';
export * from './engine/diag.js';
export * from './engine/ids.js';
export * from './engine/frontmatter.js';
export * from './engine/atomic.js';
export * from './engine/store.js';
export * from './engine/layout.js';
export * from './engine/policy.js';
export * from './engine/changes.js';
export * from './engine/edit.js';
export * from './engine/validate.js';
export * from './engine/compile.js';
export * from './engine/diff.js';
export * from './engine/render.js';
export * from './engine/companion.js';
export * from './engine/reference.js';
export * from './primitives.js';
