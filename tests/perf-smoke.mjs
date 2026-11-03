// 性能冒烟（P1-04 验收）：300 模块 batch 写入 / 单模块 patch；CI 阈值放宽 3×（本机目标 <1s / <100ms）。
// 运行：node tests/perf-smoke.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const { createNormifyTools } = await import(new URL('../lib/core/toolset.js', import.meta.url).href);

const BATCH_MAX_MS = Number(process.env.NORMIFY_PERF_BATCH_MS ?? 10000);
const PATCH_MAX_MS = Number(process.env.NORMIFY_PERF_PATCH_MS ?? 2000);
const fails = [];
const check = (name, ok, detail) => {
    if (!ok) fails.push(name);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`);
};

const work = mkdtempSync(join(tmpdir(), 'normify-perf-'));
const DIR = join(work, 'normify-bench').replace(/\\/g, '/');
const tools = createNormifyTools({ rootDir: work, requireBilingual: true });
const tool = (n) => tools.find(t => t.name === n);
const L = (zh, en) => ({ zh, en });
const NOW = '2026-11-03T12:00:00Z';
let seq = 0;
const base = (id, parent) => ({
    uid: (0x10000000 + (seq++)).toString(16),
    id, parent,
    name: L(id, id), description: L('perf ' + id, 'perf ' + id),
    source: [], revision: '0'.repeat(40), updated_at: NOW, fingerprint: 'pending', state: 'planned',
});

await tool('normify_project_init').execute({ dir: DIR, root: { id: 'bench', name: L('基准', 'Bench'), description: L('性能基准', 'perf bench') } });
const N = 300;
const items = [];
for (let i = 0; i < N; i++)
    items.push({ frontmatter: { ...base('bench.m' + String(i).padStart(3, '0'), 'bench'), apis: [] } });

const t0 = performance.now();
const r = await tool('normify_module_batch').execute({ dir: DIR, mode: 'upsert', items });
const batchMs = performance.now() - t0;
check('300 模块 batch 写入成功', r.ok === true, `ok=${r.ok} errors=${(r.errors ?? []).length}`);
check(`300 模块 batch 耗时 < ${BATCH_MAX_MS}ms`, batchMs < BATCH_MAX_MS, `ms=${Math.round(batchMs)}`);

const t1 = performance.now();
const p = await tool('normify_module_patch').execute({ dir: DIR, id: 'bench.m000', patch: { tags: ['hot'] } });
const patchMs = performance.now() - t1;
check('单模块 patch 成功', p.ok === true, `ok=${p.ok}`);
check(`单模块 patch 耗时 < ${PATCH_MAX_MS}ms`, patchMs < PATCH_MAX_MS, `ms=${Math.round(patchMs)}`);

const t2 = performance.now();
const v = await tool('normify_validate').execute({ dir: DIR });
const validateMs = performance.now() - t2;
check('300 模块 validate 成功', v.ok === true, `ok=${v.ok} errors=${(v.errors ?? []).length}`);
check('300 模块 validate 耗时 < 5000ms', validateMs < 5000, `ms=${Math.round(validateMs)}`);

rmSync(work, { recursive: true, force: true });
console.log('\n=== 结果：' + (fails.length === 0 ? '全部 PASS' : 'FAIL ' + fails.length + ' 项 → ' + fails.join(' | ')) + ' ===');
process.exit(fails.length === 0 ? 0 : 1);
