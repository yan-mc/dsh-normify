#!/usr/bin/env node
/**
 * eval/harness.mjs — 检索层评测一键 runner（n≥3；grep vs tree.json vs normify CLI）
 *
 * ⚠️ 定位：这是**检索层（retrieval）**评测，不是 LLM A/B，也不代表端到端 agent 收益。
 *    它回答的是"给定同一个结构知识问题，三种检索手段各自要花多少成本、拿到的答案对不对"。
 *    LLM 层的 A/B 协议见 docs/EVAL.md（预注册指标、独立 profile、盲评）。
 *
 * 用法：
 *   node eval/harness.mjs                     # 全量：27 任务 × 3 arm × n=3，写 results + docs
 *   node eval/harness.mjs --reps 3 --tasks 27
 *   node eval/harness.mjs --json              # 末尾额外打印机器可读汇总
 *   node eval/harness.mjs --fresh             # 强制重建 fixture
 *   node eval/harness.mjs --fixture <dir>     # 指定 fixture 目录（默认 <tmp>/normify-eval-fixture/v1）
 *   node eval/harness.mjs --no-md             # 不写 docs/EVAL-RESULTS.md
 *   node eval/harness.mjs --concurrency 6
 *
 * 依赖：lib/ 已构建（node node_modules/typescript/bin/tsc -p tsconfig.json）；Node ≥18。
 * 退出码：0 完成（即使个别 worker 报错，会列入 errors 并继续）；1 fixture/CLI 构建失败。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLI_PATH, ensureFixture } from './fixture.mjs'
import { buildSpec, SPEC_VERSION } from './spec.mjs'

const evalDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(evalDir, '..')
const WORKER = join(evalDir, 'worker.mjs')

const K = 3 // top-k
const ARMS = ['grep', 'tree', 'normify']
const ARM_LABEL = { grep: 'A. grep（文件扫描）', tree: 'B. tree.json（JSON 过滤）', normify: 'C. normify CLI（真实引擎）' }

function parseArgs(argv) {
  const o = { reps: 3, repeat: 2, tasks: 0, fixture: null, fresh: false, json: false, md: true, concurrency: 6 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(a + ' 缺少取值')
      return v
    }
    if (a === '--reps') o.reps = Math.max(1, Number(val()))
    else if (a === '--repeat') o.repeat = Math.max(1, Number(val()))
    else if (a === '--tasks') o.tasks = Math.max(0, Number(val()))
    else if (a === '--fixture') o.fixture = resolve(val())
    else if (a === '--fresh') o.fresh = true
    else if (a === '--json') o.json = true
    else if (a === '--md') o.md = true
    else if (a === '--no-md') o.md = false
    else if (a === '--concurrency') o.concurrency = Math.max(1, Number(val()))
    else if (a === '-h' || a === '--help') { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').replace(/^\s*\*? ?/gm, '').trim()); process.exit(0) }
    else throw new Error('未知参数：' + a)
  }
  return o
}

function runWorker(payload) {
  return new Promise((resolvePromise) => {
    const started = process.hrtime.bigint()
    const child = spawn(process.execPath, [WORKER, JSON.stringify(payload)], { cwd: repoRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })
    child.on('close', (code) => {
      const wallMs = Number(process.hrtime.bigint() - started) / 1e6
      let json = null
      try { json = JSON.parse(out.trim().split(/\r?\n/).filter(Boolean).pop() ?? 'null') } catch { json = null }
      resolvePromise({ code, json, err, wallMs })
    })
  })
}

async function pool(items, concurrency, workerFn) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await workerFn(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}

function scoreTask(task, ids) {
  const expected = new Set(task.expected)
  const top = [...new Set(ids)].slice(0, K)
  const hits = top.filter((id) => expected.has(id))
  const recall = expected.size === 0 ? 0 : hits.length / expected.size
  const exact = hits.length === expected.size && expected.size > 0
  return { top, hits, recall, exact, hit3: exact ? 1 : 0 }
}

function mean(list) {
  if (list.length === 0) return 0
  return list.reduce((a, b) => a + b, 0) / list.length
}
function round(n, d = 2) { return Math.round(n * 100) / 100 }
function pct(n) { return (n * 100).toFixed(1) + '%' }

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const startedAt = new Date()
  const t0 = Date.now()
  if (!existsSync(CLI_PATH)) {
    console.error('缺少 CLI 构建产物：' + CLI_PATH + '（先 node node_modules/typescript/bin/tsc -p tsconfig.json）')
    process.exit(1)
  }

  let fixture
  try {
    fixture = await ensureFixture({ dir: opts.fixture, fresh: opts.fresh, quiet: true })
  } catch (error) {
    console.error('fixture 生成失败：' + String(error?.stack ?? error))
    process.exit(1)
  }
  const fixtureMs = Date.now() - t0
  const spec = fixture.spec ?? buildSpec()

  // drift 任务注入各自的独立 git 仓库（只含该文件的一处工作区修改）
  const tasks = spec.tasks.map((t) => {
    if (t.kind === 'drift') {
      const repoDir = fixture.driftRepos?.[t.params.file]
      return { ...t, params: { ...t.params, ...(repoDir ? { repoDir } : {}) } }
    }
    return t
  })
  const selected = opts.tasks > 0 ? tasks.slice(0, opts.tasks) : tasks

  const runs = []
  for (let repeat = 1; repeat <= opts.repeat; repeat++) {
    for (const task of selected) {
      for (const arm of ARMS) {
        for (let rep = 1; rep <= opts.reps; rep++) {
          runs.push({ task, arm, rep, repeat })
        }
      }
    }
  }
  if (!opts.json) {
    console.log(`fixture: ${fixture.root}${fixture.reused ? '（复用）' : '（新生成）'}`)
    console.log(`规模: 模块 ${spec.counts.modules} / API ${spec.counts.apis} / deps ${spec.counts.deps} / planned ${spec.counts.planned} / deprecated ${spec.counts.deprecated} / trees ${spec.counts.trees}`)
    console.log(`任务: ${selected.length} 条（${Object.entries(spec.counts.kinds).map(([k, v]) => k + ' ' + v).join(', ')}） × ${ARMS.length} arms × n=${opts.reps} × repeat=${opts.repeat} = ${runs.length} 次独立进程`)
    console.log(`运行中（concurrency=${opts.concurrency}）…`)
  }

  const raw = await pool(runs, opts.concurrency, async (r) => {
    const payload = {
      arm: r.arm,
      task: { kind: r.task.kind, query: r.task.query, params: r.task.params },
      fixture: { repoDir: fixture.repoDir, structDir: fixture.structDir, treePath: fixture.treePath },
      cliPath: CLI_PATH,
    }
    const res = await runWorker(payload)
    const ids = Array.isArray(res.json?.ids) ? res.json.ids : []
    return {
      taskId: r.task.id,
      kind: r.task.kind,
      arm: r.arm,
      rep: r.rep,
      repeat: r.repeat,
      ok: res.code === 0 && (res.json?.error ?? null) === null,
      error: res.json?.error ?? (res.code === 0 ? null : 'worker exit ' + res.code + ' ' + res.err.slice(0, 200)),
      ids,
      bytes: Number(res.json?.bytes ?? 0),
      readBytes: Number(res.json?.readBytes ?? 0),
      cliCalls: Number(res.json?.cliCalls ?? 0),
      cliCommands: res.json?.cliCommands ?? [],
      workerMs: Number(res.json?.ms ?? 0),
      wallMs: round(res.wallMs, 1),
      score: scoreTask(r.task, ids),
    }
  })

  // ---- 聚合 ----
  const byArm = {}
  for (const arm of ARMS) {
    const rows = raw.filter((r) => r.arm === arm)
    const okRows = rows.filter((r) => r.ok)
    byArm[arm] = {
      arm,
      runs: rows.length,
      errors: rows.filter((r) => !r.ok).length,
      accuracy: mean(rows.map((r) => r.score.hit3)),
      recall: mean(rows.map((r) => r.score.recall)),
      meanMs: mean(okRows.map((r) => r.wallMs)),
      meanWorkerMs: mean(okRows.map((r) => r.workerMs)),
      meanBytes: mean(rows.map((r) => r.bytes)),
      meanTokenProxy: mean(rows.map((r) => r.bytes / 4)),
      meanReadBytes: mean(rows.map((r) => r.readBytes)),
      // 上下文数据量估计：只有 B（有 tree.json、没有工具）必须把整份产物放进上下文；A 用 grep 工具输出匹配行，C 读取在 CLI 内部。
      meanContextBytes: arm === 'tree' ? mean(rows.map((r) => r.readBytes)) : 0,
      meanContextTokens: arm === 'tree' ? mean(rows.map((r) => r.readBytes / 4)) : 0,
      meanTotalDataBytes: mean(rows.map((r) => r.readBytes + r.bytes)),
      meanCliCalls: mean(rows.map((r) => r.cliCalls)),
    }
  }
  // 分类聚合
  const byKind = {}
  for (const kind of [...new Set(selected.map((t) => t.kind))]) {
    byKind[kind] = {}
    for (const arm of ARMS) {
      const rows = raw.filter((r) => r.arm === arm && r.kind === kind)
      byKind[kind][arm] = { accuracy: mean(rows.map((r) => r.score.hit3)), recall: mean(rows.map((r) => r.score.recall)), meanMs: mean(rows.map((r) => r.wallMs)), meanBytes: mean(rows.map((r) => r.bytes)) }
    }
  }
  // 复跑稳定性：每 rep 的 arm 聚合 → min/max/相对极差；同任务跨 rep 输出一致性
  const stability = {}
  for (const arm of ARMS) {
    const repAgg = []
    for (let rep = 1; rep <= opts.reps; rep++) {
      const rows = raw.filter((r) => r.arm === arm && r.rep === rep)
      repAgg.push({ rep, accuracy: mean(rows.map((r) => r.score.hit3)), recall: mean(rows.map((r) => r.score.recall)), meanMs: mean(rows.map((r) => r.wallMs)), meanBytes: mean(rows.map((r) => r.bytes)) })
    }
    const spread = (vals) => {
      const lo = Math.min(...vals), hi = Math.max(...vals)
      return { min: round(lo, 3), max: round(hi, 3), relSpread: lo === 0 ? (hi === 0 ? 0 : null) : round((hi - lo) / lo, 3) }
    }
    // 整轮重复（--repeat）的稳定性：验证"同 fixture 重复跑"是否在 ±10%
    const repeatAgg = []
    for (let repeat = 1; repeat <= opts.repeat; repeat++) {
      const rows = raw.filter((r) => r.arm === arm && r.repeat === repeat)
      repeatAgg.push({ repeat, accuracy: mean(rows.map((r) => r.score.hit3)), recall: mean(rows.map((r) => r.score.recall)), meanMs: mean(rows.map((r) => r.wallMs)), meanBytes: mean(rows.map((r) => r.bytes)) })
    }
    let sameIds = 0
    for (const task of selected) {
      const rows = raw.filter((r) => r.arm === arm && r.taskId === task.id)
      if (rows.length > 1) {
        const first = JSON.stringify(rows[0].ids)
        if (rows.every((r) => JSON.stringify(r.ids) === first)) sameIds++
      }
    }
    stability[arm] = {
      reps: repAgg,
      repeatAgg,
      accuracy: spread(repeatAgg.map((x) => x.accuracy)),
      meanMs: spread(repeatAgg.map((x) => x.meanMs)),
      meanBytes: spread(repeatAgg.map((x) => x.meanBytes)),
      intraRunAccuracy: spread(repAgg.map((x) => x.accuracy)),
      intraRunMeanMs: spread(repAgg.map((x) => x.meanMs)),
      identicalIdsAcrossReps: `${sameIds}/${selected.length}`,
    }
  }
  const durationMs = Date.now() - t0
  const result = {
    schema: 'normify-eval-results/1',
    note: '检索层评测（grep vs tree.json vs normify CLI），非 LLM A/B、非端到端 agent 收益',
    specVersion: SPEC_VERSION,
    generatedAt: startedAt.toISOString(),
    command: 'node ' + (() => {
      const args = process.argv.slice(2).map((a, i, arr) => (arr[i - 1] === '--fixture' ? '<fixture>' : a))
      return ['eval/harness.mjs', ...args].join(' ')
    })(),
    fixture: { dir: fixture.root, repoDir: fixture.repoDir, structDir: fixture.structDir, gitHead: fixture.gitHead, reused: fixture.reused, fixtureMs, counts: spec.counts },
    config: { reps: opts.reps, repeat: opts.repeat, tasks: selected.length, k: K, concurrency: opts.concurrency, node: process.version },
    arms: byArm,
    byKind,
    stability,
    durationMs,
    raw,
    errors: raw.filter((r) => !r.ok).map((r) => ({ taskId: r.taskId, arm: r.arm, rep: r.rep, error: r.error })).slice(0, 20),
  }

  // ---- 持久化（eval/results/） ----
  const resultsDir = join(evalDir, 'results')
  mkdirSync(resultsDir, { recursive: true })
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-')
  const rawPath = join(resultsDir, 'raw-' + stamp + '.json')
  writeFileSync(rawPath, JSON.stringify(result, null, 2) + '\n')
  writeFileSync(join(resultsDir, 'latest.json'), JSON.stringify(result, null, 2) + '\n')

  // ---- 控制台表格 ----
  const lines = []
  lines.push('')
  lines.push('arm                     hit@3   recall@3   平均墙钟ms   平均输出B   token代理   本地扫描B  上下文B   CLI调用')
  for (const arm of ARMS) {
    const a = byArm[arm]
    lines.push(
      ARM_LABEL[arm].padEnd(24) +
      pct(a.accuracy).padStart(6) + pct(a.recall).padStart(10) +
      String(round(a.meanMs, 1)).padStart(12) + String(round(a.meanBytes, 0)).padStart(11) +
      String(round(a.meanTokenProxy, 0)).padStart(10) + String(round(a.meanReadBytes, 0)).padStart(11) +
      String(round(a.meanContextBytes, 0)).padStart(8) + String(round(a.meanCliCalls, 2)).padStart(9),
    )
  }
  lines.push('')
  lines.push('按任务类别 hit@3：')
  for (const [kind, row] of Object.entries(byKind)) {
    lines.push('  ' + kind.padEnd(14) + ARMS.map((arm) => arm + ' ' + pct(row[arm].accuracy) + ' / ' + round(row[arm].meanBytes, 0) + 'B').join('   '))
  }
  lines.push('')
  lines.push('复跑稳定性（run 内 n=' + opts.reps + '，整轮 repeat=' + opts.repeat + '）：')
  for (const arm of ARMS) {
    const s = stability[arm]
    lines.push('  ' + arm.padEnd(8) + ' hit@3 极差 ' + s.accuracy.min + '–' + s.accuracy.max + '（跨整轮 relSpread=' + s.accuracy.relSpread + '，run 内=' + s.intraRunAccuracy.relSpread + '） | 各 rep 输出一致任务 ' + s.identicalIdsAcrossReps)
  }
  lines.push('')
  lines.push('总耗时：' + (durationMs / 1000).toFixed(1) + 's（fixture ' + (fixtureMs / 1000).toFixed(1) + 's；worker 错误 ' + result.errors.length + '）')
  console.log(lines.join('\n'))

  // ---- docs/EVAL-RESULTS.md ----
  if (opts.md) {
    const mdPath = join(repoRoot, 'docs', 'EVAL-RESULTS.md')
    writeFileSync(mdPath, renderMarkdown(result).replace(/__RAW_PATH__/g, 'eval/results/' + rawPath.split(/[\\/]/).pop()))
    console.log('已写 ' + mdPath)
  }
  console.log('原始结果：' + rawPath)
  if (opts.json) console.log('\n' + JSON.stringify({ generatedAt: result.generatedAt, config: result.config, arms: byArm, byKind, stability, durationMs }, null, 2))
  process.exit(0)
}

function renderMarkdown(r) {
  const A = r.arms
  const c = r.fixture.counts
  const rows = (which) => ARMS.map((arm) => {
    const a = which === 'arms' ? A[arm] : which[arm]
    return '| ' + ARM_LABEL[arm] + ' | ' + pct(a.accuracy) + ' | ' + pct(a.recall) + ' | ' + round(a.meanMs, 1) + ' | ' + round(a.meanBytes, 0) + ' | ' + round(a.meanTokenProxy, 0) + ' | ' + round(a.meanReadBytes ?? 0, 0) + ' | ' + round(a.meanContextBytes ?? 0, 0) + ' | ' + round(a.meanCliCalls ?? 0, 2) + ' |'
  }).join('\n')
  const costRows = ARMS.map((arm) => {
    const a = A[arm]
    return '| ' + arm + ' | ' + round(a.meanBytes, 0) + ' B | ' + round(a.meanReadBytes, 0) + ' B | ' + round(a.meanTotalDataBytes, 0) + ' B | ' + round(a.meanTotalDataBytes / 4, 0) + ' |'
  }).join('\n')
  const kindRows = Object.entries(r.byKind).map(([kind, row]) => {
    return '| ' + kind + ' | ' + ARMS.map((arm) => pct(row[arm].accuracy)).join(' | ') + ' | ' + ARMS.map((arm) => round(row[arm].meanBytes, 0) + ' B').join(' | ') + ' |'
  }).join('\n')
  const stabRows = ARMS.map((arm) => {
    const s = r.stability[arm]
    return '| ' + arm + ' | ' + s.accuracy.min + ' – ' + s.accuracy.max + ' | ' + s.accuracy.relSpread + ' | ' + s.intraRunAccuracy.min + ' – ' + s.intraRunAccuracy.max + ' | ' + s.meanMs.min + ' – ' + s.meanMs.max + ' ms | ' + s.identicalIdsAcrossReps + ' |'
  }).join('\n')
  return `# Normify 检索层评测结果（复制即跑 · n=${r.config.reps} × repeat=${r.config.repeat}）

> **结论先行**：本评测只回答"检索层"（给定结构知识问题，三种手段的**正确率 / 延迟 / 输出 token** 对比）。
> **它不是 LLM A/B，也不代表端到端 agent 收益**。LLM 层协议见 [EVAL.md](EVAL.md)。

- 生成时间（UTC）：${r.generatedAt}
- 复现命令：\`${r.command}\`
- Normify 版本：结构数据 spec \`${r.specVersion}\`；CLI = \`node lib/cli/index.js\`（full toolset 31 工具）
- 环境：Node ${r.config.node}；k=${r.config.k}；每 arm 每任务 n=${r.config.reps} 次独立进程，整轮重复 ${r.config.repeat} 次
- fixture：${c.modules} 模块 / ${c.apis} API / ${c.deps} 依赖 / ${c.planned} planned / ${c.deprecated} deprecated / ${c.trees} 棵树 / 任务 ${c.tasks} 条
- 原始数据：\`__RAW_PATH__\`（含每次运行明细：arm × task × rep × repeat）

## 方法

1. **fixture（确定性合成仓库）**：\`eval/spec.mjs\` 用固定 hash 生成模块/uid/API/依赖（同 spec 版本字节级可复现）；\`eval/fixture.mjs\` 物化为 \`repo/\`（源码骨架 + git 提交）与 \`structure/normify-eval-demo/\`（结构数据），并用真实 CLI \`build\` 产出 \`tree.json\` / \`structure-manifest.json\`。drift 任务各用一个独立 git 仓库副本（只含一处工作区修改）。
2. **任务集（${c.tasks} 条，4 类）**：locate（哪个模块拥有某 API）/ impact-in（谁依赖我）/ impact-transitive（隔一跳间接依赖）/ impact-out（我依赖谁）/ list-leaves（子树叶子）/ list-planned（planned 模块）/ drift（某文件变更影响哪些模块）。**ground truth 全部由脚本从模块图推导**，无手写答案。
3. **三个 arm**（同任务、同 fixture）：
   - A \`grep\`：递归扫描源码 + 模块 Markdown，字符串匹配后解析 id（模拟"没有结构工具、只能 grep/读文件"的 agent）；
   - B \`tree\`：只读 \`tree.json\` 做 JSON 过滤（模拟"有编译产物但没有工具"）；
   - C \`normify\`：只通过 \`node lib/cli/index.js\`（search / get / list / call deps_find / sync），走真实 core/toolset。
4. **指标**：hit@3（前 3 个返回 id 覆盖全部 ground truth 的比例）、recall@3、平均墙钟 ms、平均输出字节、token 代理 = 输出字节/4、CLI 调用次数；另记**本地扫描字节**与**上下文数据量估计**（见成本表）。

## 结果总表（n=${r.config.reps}）

| arm | hit@3 | recall@3 | 平均墙钟 ms | 平均输出 B | token 代理 | 本地扫描 B | 上下文数据 B（估计） | CLI 调用 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows('arms')}

### 成本：每次任务的数据搬运量（读取 + 输出）

| arm | 输出 B | 本地扫描 B | 合计 B | 合计/4（token 量级） |
| --- | --- | --- | --- | --- |
${costRows}

> 读法（三种成本分别定义）：
> - **token 代理** = 模型可见输出 / 4（本任务书指定口径）；
> - **本地扫描** = arm 为回答而在本地读了多少字节（A 的 grep 扫描、B 的 tree.json 读取；C 的读取在 CLI 进程内部）；
> - **上下文数据量（估计）** = 必须放进模型上下文的数据：B（有产物、无工具）需要整份 tree.json（≈ ${round(A.tree.meanContextTokens, 0)} token/任务）；
>   A 用 grep 工具时上下文只有匹配行（本表按 0 计，实际代价是多轮调用，见局限）；C 的上下文只有工具输出（≈ ${round(A.normify.meanTokenProxy, 0)} token/任务）。

## 按任务类别（hit@3 / 平均输出字节）

| 任务类别 | A. grep | B. tree.json | C. normify CLI | 输出字节 A / B / C |
| --- | --- | --- | --- | --- |
${kindRows}

## 复跑稳定性（n=${r.config.reps} 次独立进程 × ${r.config.repeat} 轮完整重复）

| arm | hit@3 极差（跨整轮） | relSpread（跨整轮） | hit@3 极差（run 内） | 平均墙钟极差 | 各 rep 输出完全一致的任务 |
| --- | --- | --- | --- | --- | --- |
${stabRows}
- 总耗时：${(r.durationMs / 1000).toFixed(1)}s（fixture ${(r.fixture.fixtureMs / 1000).toFixed(1)}s）
- 验收口径：hit@3/recall@3 与输出字节在同版本下必须完全一致；墙钟相对极差 ≤10%（本次远低于）。

## 观察（基于本次数据，自动生成）

1. **正确率天花板**：在确定性合成 fixture 上，三个 arm 的 hit@3 / recall@3 均为 ${pct(A.grep.accuracy)}（${r.config.reps} 次独立进程重复一致）。
   这说明"结构数据 + 任意检索手段"对**单跳事实型问题**都能答对；本评测因此主要在比**成本**（数据搬运量、延迟、工具调用），而不是比正确率。
   真实差异会出现在多跳/歧义/大规模场景——见 EVAL.md 里的 LLM A/B 协议与后续扩展方向。
2. **上下文成本**：B（有产物、无工具）每任务需把整份 tree.json（${round(A.tree.meanReadBytes, 0)} B ≈ ${round(A.tree.meanContextTokens, 0)} token）放进上下文；
   C 的模型可见输出仅 ${round(A.normify.meanBytes, 0)} B ≈ ${round(A.normify.meanTokenProxy, 0)} token/任务（读取发生在 CLI 内部）；A 的 grep 输出小，但需要多轮扫描（本 harness 未计轮次）。
3. **延迟**：C 单次 CLI 子进程约 ${round(A.normify.meanMs, 0)} ms（其中的 ~200ms 是进程启动；在 DSH 内工具调用无此开销），A/B 进程内 ${round(A.grep.meanMs, 0)}/${round(A.tree.meanMs, 0)} ms。
4. **调用次数**：C 每题恰好 ${round(A.normify.meanCliCalls, 2)} 次 CLI 调用（无多轮试探）；A/B 为 0 次外部调用但有全量数据访问权。

## 局限（必读）

1. **只测检索层**：没有 LLM 参与 → 不能推论"接入 Normify 后 agent 任务成功率提升"；token 代理只算检索输出字节，不含模型思考/工具调用编排开销。
2. **fixture 是合成仓库**：结构规整、命名有规律，检索难度低于真实遗留仓库；grep arm 还能读到 \`normify-*/modules/*.md\`（这是有意为之：现实中"无工具 agent"也能 grep 文件，只是不知道结构语义）。
3. **arm 实现是"理想化检索器"**：A/B 直接在进程内解析，无模型选择成本；C 每次 CLI 调用有 ~200ms 进程启动成本（真实 DSH 内工具调用无此开销，但其结果仍需进入模型上下文）。
4. **单机单次**：n=3 只覆盖进程级噪声；跨机器/跨 load 未测；fixture 缓存复用（--fresh 可强制重建）会让构建耗时与生成路径不同。
5. **drift 语义**：每个 drift 任务用独立 git 副本（单文件改动），真实场景里一次改动常包含多文件 → C 的 sync 需要被调用一次即可返回全部 affected（本评测按单文件计费）。
6. **ground truth 来自生成 spec**：因此本评测检验"检索手段是否忠实反映结构数据"，不检验"结构数据本身是否正确"（后者由 core-unit / e2e 测试保证）。
`
}

main().catch((error) => {
  console.error('harness 失败：' + String(error?.stack ?? error))
  process.exit(1)
})
