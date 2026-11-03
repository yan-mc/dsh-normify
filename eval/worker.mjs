/**
 * eval/worker.mjs — 单个 (arm, task, repetition) 的独立进程执行体（保证 n=3 是三次独立进程）
 *
 * 用法（由 harness.mjs 调用）：
 *   node eval/worker.mjs '<json>'
 *   json = { arm: 'grep'|'tree'|'normify', task: {kind, query, params},
 *            fixture: {repoDir, structDir, treePath}, cliPath }
 * 输出：stdout 一行 JSON { ids, bytes, readBytes, cliCalls, ms, error? }
 *
 * 三个 arm 的语义（刻意保持"同任务、不同检索手段"）：
 *   grep    —— 只做文件递归 + 字符串匹配（模拟无结构工具、只能 grep/读文件的 agent）
 *   tree    —— 只读 tree.json 做 JSON 过滤（模拟"有编译产物但没有工具"）
 *   normify —— 只通过 `node lib/cli/index.js <cmd>`（真实 CLI/core）取答案
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const payload = JSON.parse(process.argv[2] ?? '{}')
const { arm, task, fixture, cliPath } = payload
const started = process.hrtime.bigint()
const ms = () => Number(process.hrtime.bigint() - started) / 1e6
const out = (r) => {
  process.stdout.write(JSON.stringify({ ...r, ms: Math.round(ms() * 100) / 100 }) + '\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 公共：递归列文件（跳过 .git/node_modules）
// ---------------------------------------------------------------------------
function walkFiles(root, filter) {
  const files = []
  const walk = (dir, rel) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === 'dist') continue
      const abs = join(dir, e.name)
      const r = rel === '' ? e.name : rel + '/' + e.name
      if (e.isDirectory()) walk(abs, r)
      else if (!filter || filter(r)) files.push({ abs, rel: r })
    }
  }
  walk(root, '')
  return files.sort((a, b) => a.rel.localeCompare(b.rel))
}

/** 从模块 Markdown 文件 frontmatter 中抽取 id / parent / state / source paths / api paths / deps */
function parseModuleFile(text) {
  const fm = text.split('---')[1] ?? ''
  const id = /^id:\s*([a-z0-9.-]+)\s*$/m.exec(fm)?.[1] ?? null
  const parentRaw = /^parent:\s*(.+)$/m.exec(fm)?.[1]?.trim() ?? ''
  const parent = parentRaw === 'null' || parentRaw === '' ? null : parentRaw
  const state = /^state:\s*([a-z]+)/m.exec(fm)?.[1] ?? 'active'
  const sourcePaths = [...fm.matchAll(/^\s*-\s*path:\s*"([^"]+)"/gm)].map((m) => m[1])
  const apis = []
  const apiBlocks = fm.split(/^\s*-\s*protocol:\s*/m).slice(1)
  for (const block of apiBlocks) {
    const protocol = block.split('\n')[0].trim()
    const method = /^\s*method:\s*(\S+)/m.exec(block)?.[1]
    const path = /^\s*path:\s*(?:"([^"]+)"|(\S+))/m.exec(block)?.[1] ?? /^\s*path:\s*(?:"([^"]+)"|(\S+))/m.exec(block)?.[2]
    if (path) apis.push(protocol === 'http' ? { key: (method ?? '') + ' ' + path, path } : { key: protocol + ':' + path, path })
  }
  const depTargets = [...fm.matchAll(/^\s*-\s*kind:.*\n(?:.*\n)*?\s*to:\s*(\S+)/gm)].map((m) => m[1])
  return { id, parent, state, sourcePaths, apis, depTargets }
}

/** 递归解析全部模块文件（只扫 structure/<proj>/modules） */
function readAllModules(structDir) {
  const modulesDir = join(structDir, 'modules')
  const files = walkFiles(modulesDir, (rel) => rel.endsWith('.md'))
  let readBytes = 0
  const mods = []
  for (const f of files) {
    const text = readFileSync(f.abs, 'utf8')
    readBytes += Buffer.byteLength(text)
    const parsed = parseModuleFile(text)
    if (parsed.id) mods.push(parsed)
  }
  return { mods, readBytes }
}

// ---------------------------------------------------------------------------
// Arm A：grep（递归文件扫描 + 字符串匹配）
// ---------------------------------------------------------------------------
function armGrep() {
  const { kind, query, params } = task
  const targets = [fixture.repoDir, join(fixture.structDir)]
  const all = []
  for (const root of targets) all.push(...walkFiles(root))
  let readBytes = 0
  const texts = new Map()
  for (const f of all) {
    if (!/\.(md|ts|js|json)$/.test(f.rel)) continue
    if (f.rel.includes('/node_modules/') || f.rel === 'tree.json' || f.rel.endsWith('.map')) continue
    const text = readFileSync(f.abs, 'utf8')
    texts.set(f.abs, { text, rel: f.rel })
    readBytes += Buffer.byteLength(text)
  }
  const moduleFiles = [...texts.entries()].filter(([abs]) => abs.includes(join('structure')) && abs.endsWith('.md'))
  const ids = []

  if (kind === 'locate') {
    // 直接命中模块文件里的 API path；或命中源码文件后再用该文件路径反查模块文件
    const needle = query
    for (const [abs, t] of moduleFiles) {
      if (t.text.includes(needle)) {
        const id = parseModuleFile(t.text).id
        if (id) ids.push(id)
      }
    }
    if (ids.length === 0) {
      const srcHits = [...texts.entries()].filter(([abs]) => abs.includes(join('repo')) && texts.get(abs).text.includes(needle))
      for (const [abs, t] of srcHits) {
        const rel = t.rel
        for (const [mAbs, mt] of moduleFiles) {
          if (mt.text.includes('path: "' + rel + '"')) {
            const id = parseModuleFile(mt.text).id
            if (id && !ids.includes(id)) ids.push(id)
          }
        }
      }
    }
  } else if (kind === 'impact-in') {
    const patterns = ['to: ' + query, 'to: "' + query + '"']
    for (const [abs, t] of moduleFiles) {
      if (patterns.some((p) => t.text.includes(p))) {
        const id = parseModuleFile(t.text).id
        if (id && id !== query) ids.push(id)
      }
    }
  } else if (kind === 'impact-transitive') {
    const target = params.target
    const reverse = new Map()
    for (const [abs, t] of moduleFiles) {
      const p = parseModuleFile(t.text)
      for (const to of p.depTargets) {
        const list = reverse.get(to) ?? []
        list.push(p.id)
        reverse.set(to, list)
      }
    }
    const d1 = reverse.get(target) ?? []
    const d2 = new Set()
    for (const mid of d1) for (const up of reverse.get(mid) ?? []) if (up !== target && !d1.includes(up)) d2.add(up)
    ids.push(...[...d2].sort())
  } else if (kind === 'impact-out') {
    for (const [abs, t] of moduleFiles) {
      const parsed = parseModuleFile(t.text)
      if (parsed.id === query) { ids.push(...parsed.depTargets); break }
    }
  } else if (kind === 'list-leaves') {
    const scope = params.scope
    const scopeIds = new Set([scope])
    for (const [abs, t] of moduleFiles) {
      const p = parseModuleFile(t.text)
      if (p.parent && p.parent.startsWith(scope)) scopeIds.add(p.id)
    }
    const childrenOf = new Set()
    for (const [abs, t] of moduleFiles) {
      const p = parseModuleFile(t.text)
      if (p.parent) childrenOf.add(p.parent)
    }
    for (const [abs, t] of moduleFiles) {
      const p = parseModuleFile(t.text)
      if (scopeIds.has(p.id) && p.id !== scope && !childrenOf.has(p.id)) ids.push(p.id)
    }
  } else if (kind === 'list-planned') {
    const scope = params.scope
    for (const [abs, t] of moduleFiles) {
      const p = parseModuleFile(t.text)
      if (p.state === 'planned' && p.id.startsWith(scope + '.')) ids.push(p.id)
    }
  } else if (kind === 'drift') {
    const needle = 'path: "' + params.file + '"'
    for (const [abs, t] of moduleFiles) {
      if (t.text.includes(needle)) {
        const id = parseModuleFile(t.text).id
        if (id) ids.push(id)
      }
    }
  } else {
    return out({ ids: [], bytes: 0, readBytes, cliCalls: 0, error: 'unknown task kind ' + kind })
  }
  const unique = [...new Set(ids)]
  return out({ ids: unique, bytes: Buffer.byteLength(JSON.stringify(unique)), readBytes, cliCalls: 0 })
}

// ---------------------------------------------------------------------------
// Arm B：tree.json（只读编译产物做 JSON 过滤）
// ---------------------------------------------------------------------------
function armTree() {
  const raw = readFileSync(fixture.treePath, 'utf8')
  const readBytes = Buffer.byteLength(raw)
  const tree = JSON.parse(raw)
  const mods = tree.modules ?? {}
  const ids = []
  const { kind, query, params } = task
  if (kind === 'locate') {
    for (const [id, m] of Object.entries(mods))
      if ((m.apis ?? []).some((a) => String(a.key ?? '').toLowerCase().includes(query.toLowerCase()) || String(a.path ?? '').includes(query))) ids.push(id)
  } else if (kind === 'impact-in') {
    for (const e of tree.edges ?? []) if (e.to === query) ids.push(e.from)
  } else if (kind === 'impact-transitive') {
    const target = params.target
    const reverse = new Map()
    for (const e of tree.edges ?? []) {
      const list = reverse.get(e.to) ?? []
      list.push(e.from)
      reverse.set(e.to, list)
    }
    const d1 = reverse.get(target) ?? []
    const d2 = new Set()
    for (const mid of d1) for (const up of reverse.get(mid) ?? []) if (up !== target && !d1.includes(up)) d2.add(up)
    ids.push(...[...d2].sort())
  } else if (kind === 'impact-out') {
    for (const d of mods[query]?.deps ?? []) ids.push(d.to)
  } else if (kind === 'list-leaves') {
    const scope = params.scope
    const hasChild = new Set(Object.values(mods).map((m) => m.parent).filter(Boolean))
    const inScope = (id) => id === scope || id.startsWith(scope + '.')
    for (const [id, m] of Object.entries(mods)) if (inScope(id) && id !== scope && !hasChild.has(id)) ids.push(id)
  } else if (kind === 'list-planned') {
    const scope = params.scope
    for (const [id, m] of Object.entries(mods)) if ((m.state ?? 'active') === 'planned' && (id === scope || id.startsWith(scope + '.'))) ids.push(id)
  } else if (kind === 'drift') {
    const needle = params.file
    for (const [id, m] of Object.entries(mods)) if ((m.source ?? []).some((s) => s.path === needle)) ids.push(id)
  } else {
    return out({ ids: [], bytes: 0, readBytes, cliCalls: 0, error: 'unknown task kind ' + kind })
  }
  const unique = [...new Set(ids)]
  return out({ ids: unique, bytes: Buffer.byteLength(JSON.stringify(unique)), readBytes, cliCalls: 0 })
}

// ---------------------------------------------------------------------------
// Arm C：normify CLI（真实 CLI → core/toolset）
// ---------------------------------------------------------------------------
function armNormify() {
  const { kind, query, params } = task
  const cliCalls = []
  const runCli = (args) => {
    cliCalls.push(args[0] + (args.includes('call') ? ':' + args[1] : ''))
    const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 })
    return { code: r.status ?? -1, out: String(r.stdout ?? ''), err: String(r.stderr ?? '') }
  }
  const structDir = fixture.structDir
  const parse = (r) => {
    try { return JSON.parse(r.out) } catch { return null }
  }
  let ids = []
  let bytes = 0
  let readBytes = 0
  let error = null
  if (kind === 'locate') {
    const r = runCli(['search', '--dir', structDir, '--query', query])
    bytes = Buffer.byteLength(r.out)
    const j = parse(r)
    if (j?.ok) {
      // 命中 API 的结果优先（有 api 字段）
      const apiHits = (j.results ?? []).filter((x) => x.api)
      const rest = (j.results ?? []).filter((x) => !x.api)
      ids = [...apiHits, ...rest].map((x) => x.id)
    } else error = 'search exit=' + r.code
  } else if (kind === 'impact-in') {
    const r = runCli(['call', 'normify_deps_find', '--args-json', JSON.stringify({ dir: structDir, to: query })])
    bytes = Buffer.byteLength(r.out)
    const j = parse(r)
    if (j?.ok) ids = (j.references ?? []).map((x) => x.from)
    else error = 'deps_find exit=' + r.code
  } else if (kind === 'impact-transitive') {
    const r = runCli(['brief', '--dir', structDir, '--id', params.target])
    bytes = Buffer.byteLength(r.out)
    const j = parse(r)
    if (j?.ok) ids = (j.impact?.transitive ?? [])
    else error = 'brief exit=' + r.code
  } else if (kind === 'impact-out') {
    const r = runCli(['get', '--dir', structDir, '--id', query])
    bytes = Buffer.byteLength(r.out)
    const j = parse(r)
    if (j?.ok) ids = (j.module?.deps ?? []).map((d) => d.to)
    else error = 'get exit=' + r.code
  } else if (kind === 'list-leaves') {
    const r = runCli(['list', '--dir', structDir, '--parent', params.scope])
    bytes = Buffer.byteLength(r.out)
    const j = parse(r)
    if (j?.ok) ids = (j.modules ?? []).filter((m) => m.is_leaf === true).map((m) => m.id)
    else error = 'list exit=' + r.code
  } else if (kind === 'list-planned' || kind === 'drift') {
    const repoRoot = (typeof params.repoDir === 'string' && params.repoDir !== '') ? params.repoDir : fixture.repoDir
    const r = runCli(['sync', '--dir', structDir, '--repo-root', repoRoot])
    bytes = Buffer.byteLength(r.out)
    const j = parse(r)
    if (j?.ok) ids = kind === 'drift'
      ? (j.affected ?? [])
      : (j.planned_remaining ?? []).filter((id) => id.startsWith(params.scope + '.'))
    else error = 'sync exit=' + r.code
  } else {
    error = 'unknown task kind ' + kind
  }
  return out({ ids: [...new Set(ids)], bytes, readBytes, cliCalls: cliCalls.length, cliCommands: cliCalls, error })
}

// ---------------------------------------------------------------------------
const runner = arm === 'grep' ? armGrep : arm === 'tree' ? armTree : arm === 'normify' ? armNormify : null
if (runner === null) out({ ids: [], bytes: 0, readBytes: 0, cliCalls: 0, error: 'unknown arm' })
try {
  runner()
} catch (error) {
  out({ ids: [], bytes: 0, readBytes: 0, cliCalls: 0, error: String(error?.message ?? error) })
}
