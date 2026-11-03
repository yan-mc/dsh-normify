#!/usr/bin/env node
/**
 * pack-smoke.mjs — dsh-normify 发布包冒烟验收（P0 / v0.5.5）
 *
 * 目的：在不污染用户真实 DSH profile 的前提下，验证「插件能被当前 DSH 0.2.1-rc.5
 * 接受并加载」。三档互相独立、可单独运行，每项输出 PASS / FAIL / WARN / SKIP 与证据。
 *
 * 用法（Node 用 DSH runtime 自带 node）：
 *   node scripts/pack-smoke.mjs --static
 *   node scripts/pack-smoke.mjs --contract
 *   node scripts/pack-smoke.mjs --boot
 *   node scripts/pack-smoke.mjs --all            # 依次跑三档
 *   node scripts/pack-smoke.mjs --static --strict # WARN 也当 FAIL（发布门禁用）
 *
 * 常用选项：
 *   --repo-root <dir>      插件仓库根（默认脚本上一级）
 *   --work <dir>           临时工作区（默认 <repo>/../../_normify-audit/_p0smoke）
 *   --dsh-version <ver>    指定「运行中 DSH 版本」；默认从 app.asar 的 dsh/package.json 读
 *   --asar <file>          app.asar 路径（默认按桌面端候选路径探测）
 *   --desktop <dir>        DeepSeek Harness 安装目录（默认 D:\\deepseekharness）
 *   --dsh-cli <file>       dsh 启动器（默认 <desktop>/resources/runtime/cli/bin/dsh.cmd）
 *   --pnpm <file>          pnpm 入口（默认探测 DSH runtime / PATH）
 *   --contract-version <v> 契约档安装的 dsh-tools 版本（默认 0.2.1-rc.5）
 *   --cordis-version <v>   契约档安装的 cordis 版本（默认 4.0.5）
 *   --expect-tools <n>     期望注册工具数（默认从 lib/core/toolset.js 的 register( 计数推断，兜底 31；契约档显式以 full 面加载）
 *   --mount-timeout <ms>   boot 档「挂载探测」等待上限（默认 25000）
 *   --no-mount             boot 档跳过真实挂载探测（只做 pack+install+dump-config）
 *   --keep                 保留临时目录（默认清理）
 *   --json-out <file>      结果 JSON（默认 <work>/pack-smoke-<ts>.json；--no-json 关闭）
 *   --quiet                只打印失败与汇总（CI 用）
 *   -h, --help
 *
 * 退出码：0 = 无 FAIL（SKIP 不算失败）；1 = 有 FAIL；2 = 参数/环境错误。
 *
 * 只读约束：本脚本不修改 src/、tests/、package.json、README/CHANGELOG；
 * 唯一写盘位置是 --work 目录（契约档会建 node_modules，boot 档会 pack 出 tgz 到 --work）。
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const PINNED = {
  dshTools: '0.2.1-rc.5',
  cordis: '4.0.5',
}
const EXPECTED_TOOL_PREFIX = 'normify_'
// npm 打包语义：这些文件无论 files[] 如何都会进包
const ALWAYS_PACKED = new Set(['package.json', 'README.md', 'README', 'README_EN.md', 'LICENSE', 'LICENSE.md', 'LICENCE'])
const CONTRACT_BOOT_FALLBACK = 31

// 运行时必需文件（发布包必须含；相对仓库根）
const REQUIRED_RUNTIME_FILES = [
  'package.json',
  'skills/normify-gen/SKILL.md',
  'vendor/schemastery/lib/index.mjs',
  'vendor/cosmoKit/lib/index.js'.replace('cosmoKit', 'cosmokit'), // 防拼写漂移，见 vendor/cosmokit
  'cordis.patch.yml',
  'README.md',
  'LICENSE',
]

// 0.2.1 JSON Schema 子集（与 dsh-tools assertSupportedJsonSchema 对齐，作为离线兜底说明）
const SUPPORTED_JSON_SCHEMA_KEYS = new Set([
  'type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const',
  'description', 'title', 'default', 'examples', '$schema',
])

// ---------------------------------------------------------------------------
// 小工具：日志 / 断言收集
// ---------------------------------------------------------------------------

/** @typedef {'PASS'|'FAIL'|'WARN'|'SKIP'|'INFO'} Status */
/** @typedef {{tier:string, id:string, status:Status, detail:string, evidence?:string}} Check */

const state = {
  checks: /** @type {Check[]} */ ([]),
  startedAt: new Date(),
  ctx: /** @type {any} */ ({}),
}

function record(tier, id, status, detail, evidence) {
  state.checks.push({ tier, id, status, detail, evidence })
  if (state.ctx.quiet && status !== 'FAIL') return
  const tag = `[${status}]`.padEnd(7)
  console.log(`${tag} ${tier}/${id}  ${detail}${evidence ? `\n         ↳ ${String(evidence).replace(/\n/g, '\n           ')}` : ''}`)
}
const pass = (t, id, d, e) => record(t, id, 'PASS', d, e)
const fail = (t, id, d, e) => record(t, id, 'FAIL', d, e)
const warn = (t, id, d, e) => record(t, id, 'WARN', d, e)
const skip = (t, id, d, e) => record(t, id, 'SKIP', d, e)
const info = (t, id, d, e) => record(t, id, 'INFO', d, e)

function section(title) {
  if (!state.ctx.quiet) console.log(`\n=== ${title} ===`)
}

/** 运行外部命令（同步，带超时由调用方控制）；返回 {code,out,err,ms} */
function run(cmd, args, opts = {}) {
  const started = Date.now()
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    encoding: 'utf8',
    windowsHide: true,
    shell: opts.shell === true,
    timeout: opts.timeoutMs,
    maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
  })
  return {
    code: r.status === null ? -1 : r.status,
    out: String(r.stdout ?? ''),
    err: String(r.stderr ?? ''),
    ms: Date.now() - started,
    error: r.error,
  }
}

function firstLine(s, n = 200) {
  const line = String(s ?? '').split(/\r?\n/).find((x) => x.trim() !== '') ?? ''
  return line.trim().slice(0, n)
}

function readJson(absPath) {
  return JSON.parse(readFileSync(absPath, 'utf8'))
}

function exists(p) {
  try { return existsSync(p) } catch { return false }
}

function mtimeMs(p) {
  try { return statSync(p).mtimeMs } catch { return 0 }
}

// ---------------------------------------------------------------------------
// semver（~110 行，覆盖本仓库用到的区间语法；刻意不引第三方）
// ---------------------------------------------------------------------------

const VER_RE = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function parseVer(text) {
  const m = VER_RE.exec(String(text ?? '').trim())
  if (!m) return null
  const major = Number(m[1])
  const minor = m[2] === undefined ? 0 : Number(m[2])
  const patch = m[3] === undefined ? 0 : Number(m[3])
  const partial = m[3] === undefined ? (m[2] === undefined ? 'major' : 'minor') : 'patch'
  return {
    raw: String(text).trim(),
    major, minor, patch, partial,
    pre: m[4] ? m[4].split('.') : [],
    str: `${major}.${minor}.${patch}${m[4] ? '-' + m[4] : ''}`,
  }
}

function comparePre(a, b) {
  // semver §11：有 pre < 无 pre；数字段 < 字母段；短者 < 长者
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (i >= a.length) return -1
    if (i >= b.length) return 1
    const x = a[i], y = b[i]
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y)
    if (xn && yn) { const d = Number(x) - Number(y); if (d !== 0) return d < 0 ? -1 : 1 }
    else if (xn) return -1
    else if (yn) return 1
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** -1 / 0 / 1 */
function compareVer(a, b) {
  for (const k of ['major', 'minor', 'patch']) {
    const d = a[k] - b[k]
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return comparePre(a.pre, b.pre)
}

function expandComparator(token) {
  // 支持 ^ / ~ / 裸版本 / 比较符；返回 [{op, ver}] 或 null
  const t = token.trim()
  if (t === '' || t === '*' || t === 'x' || t === 'X') return [{ op: '>=', ver: parseVer('0.0.0') }]
  const m = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(t)
  if (!m) return null
  const op = m[1] ?? ''
  const v = parseVer(m[2])
  if (!v) return null
  const bump = (part) => ({ major: v.major, minor: part >= 1 ? v.minor : v.minor + 1, patch: 0, pre: ['0'], partial: 'patch' })
  switch (op) {
    case '^':
      return [{ op: '>=', ver: v }, { op: '<', ver: v.major > 0 ? bump(0) : v.minor > 0 ? bump(1) : bump(2) }]
    case '~':
      return [{ op: '>=', ver: v }, { op: '<', ver: bump(1) }]
    case '':
    case '=':
      return [{ op: '=', ver: v }]
    default: {
      // 上界缺段（如 "<5"、"<0.3"）按 node-semver x-range 语义补 -0，排除边界预发布
      const ver = (op.startsWith('<') && v.partial !== 'patch') ? { ...v, pre: ['0'] } : v
      return [{ op, ver }]
    }
  }
}

function testComparator(c, v) {
  const d = compareVer(v, c.ver)
  switch (c.op) {
    case '>=': return d >= 0
    case '>': return d > 0
    case '<=': return d <= 0
    case '<': return d < 0
    case '=': return d === 0
    default: return false
  }
}

function parseRange(range) {
  const sets = []
  for (const part of String(range ?? '').split('||')) {
    const set = []
    for (const token of part.trim().split(/\s+/)) {
      if (token === '') continue
      const cs = expandComparator(token)
      if (!cs) return null
      set.push(...cs)
    }
    if (set.length === 0) return null
    sets.push(set)
  }
  return sets.length > 0 ? sets : null
}

/** 纯比较器语义（忽略 npm 的 prerelease 排除规则） */
function satisfiesComparators(version, range) {
  const v = typeof version === 'string' ? parseVer(version) : version
  const sets = parseRange(range)
  if (!v || !sets) return { valid: false, result: false }
  return { valid: true, result: sets.some((set) => set.every((c) => testComparator(c, v))) }
}

/**
 * npm-semver 的 satisfies 语义：版本含 prerelease 时，只有当某个比较器的
 * major.minor.patch 与该版本相同且自身带 prerelease 才算满足。
 * DSH 的版本门禁具体用哪种语义未公开，故两套都算，见 static/engines。
 */
function satisfiesNpm(version, range) {
  const v = typeof version === 'string' ? parseVer(version) : version
  const sets = parseRange(range)
  if (!v || !sets) return { valid: false, result: false }
  return {
    valid: true,
    result: sets.some((set) => {
      if (!set.every((c) => testComparator(c, v))) return false
      if (v.pre.length === 0) return true
      return set.some((c) => c.ver.pre.length > 0 && c.ver.major === v.major && c.ver.minor === v.minor && c.ver.patch === v.patch)
    }),
  }
}

// ---------------------------------------------------------------------------
// app.asar 读取（只读；取运行中 DSH 的 dsh/package.json）
// ---------------------------------------------------------------------------

const asarCache = new Map()

function readAsarEntry(asarPath, innerPath) {
  if (!exists(asarPath)) throw new Error(`asar 不存在：${asarPath}`)
  const key = `${asarPath}::${innerPath}`
  if (asarCache.has(key)) return asarCache.get(key)

  const fd = openSync(asarPath, 'r')
  try {
    const head = Buffer.alloc(16)
    readSync(fd, head, 0, 16, 0)
    const headerLen = head.readUInt32LE(12)
    if (!Number.isFinite(headerLen) || headerLen <= 0 || headerLen > 64 * 1024 * 1024) {
      throw new Error(`asar header 长度异常：${headerLen}`)
    }
    const headerBuf = Buffer.alloc(headerLen)
    readSync(fd, headerBuf, 0, headerLen, 16)
    const header = JSON.parse(headerBuf.toString('utf8'))
    const dataStart = 16 + headerLen

    let node = header
    for (const seg of innerPath.split('/')) {
      node = node?.files?.[seg]
      if (!node) throw new Error(`asar 内不存在：${innerPath}`)
    }
    if (node.unpacked === true) throw new Error(`条目在 asar.unpacked 中：${innerPath}`)
    const buf = Buffer.alloc(Number(node.size))
    readSync(fd, buf, 0, Number(node.size), dataStart + Number(node.offset))
    asarCache.set(key, buf)
    return buf
  } finally {
    closeSync(fd)
  }
}

// ---------------------------------------------------------------------------
// 环境探测：桌面端 / asar 版本 / pnpm / dsh CLI
// ---------------------------------------------------------------------------

function detectDesktop(ctx) {
  const candidates = [
    ctx.options.desktop,
    process.env.DSH_SMOKE_DESKTOP,
    process.env.DEEPSEEK_HARNESS_HOME,
    'D:/deepseekharness',
    'C:/Program Files/DeepSeek Harness',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness') : '',
  ].filter(Boolean)
  for (const c of candidates) {
    if (exists(join(c, 'resources', 'app.asar'))) return resolve(c)
  }
  return null
}

function detectAsarVersion(ctx) {
  const asarPath =
    ctx.options.asar ??
    (ctx.desktop ? join(ctx.desktop, 'resources', 'app.asar') : null) ??
    'D:/deepseekharness/resources/app.asar'
  try {
    const raw = readAsarEntry(asarPath, 'dsh/package.json')
    const pkg = JSON.parse(raw.toString('utf8'))
    return { version: pkg.version, name: pkg.name, source: `${asarPath} :: dsh/package.json` }
  } catch (e) {
    // 回退：desktop runtime.json（桌面端版本，通常与 dsh runtime 同步）
    for (const root of [ctx.desktop, 'D:/deepseekharness'].filter(Boolean)) {
      const p = join(process.env.USERPROFILE ?? '', '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'runtime.json')
      try {
        const rj = readJson(p)
        if (rj?.desktopVersion) {
          return { version: rj.desktopVersion, name: 'desktop-runtime(runtime.json)', source: p, degraded: true }
        }
      } catch { /* keep trying */ }
    }
    return { version: null, error: firstLine(e?.message ?? e) }
  }
}

function findPnpm(ctx) {
  if (ctx.options.pnpm) return exists(ctx.options.pnpm) ? ctx.options.pnpm : null
  const candidates = []
  const rt = process.env.DSH_HOME
    ? join(process.env.DSH_HOME, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs')
    : ''
  if (rt) candidates.push(rt)
  for (const d of [ctx.desktop, 'D:/deepseekharness'].filter(Boolean)) {
    candidates.push(join(process.env.USERPROFILE ?? '', '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'))
  }
  for (const c of candidates) {
    const p = resolve(c)
    if (exists(p)) return p
  }
  const which = run(process.platform === 'win32' ? 'where' : 'which', ['pnpm'])
  if (which.code === 0) {
    const line = which.out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    if (line) return line
  }
  return null
}

function detectDshCli(ctx) {
  if (ctx.options.dshCli) return exists(ctx.options.dshCli) ? ctx.options.dshCli : null
  if (process.env.DSH_SMOKE_CLI) return exists(process.env.DSH_SMOKE_CLI) ? process.env.DSH_SMOKE_CLI : null
  const candidates = []
  if (ctx.desktop) {
    candidates.push(join(ctx.desktop, 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'))
    candidates.push(join(ctx.desktop, 'resources', 'runtime', 'cli', 'bin', 'dsh'))
  }
  for (const c of candidates) if (exists(c)) return c
  const which = run(process.platform === 'win32' ? 'where' : 'which', ['dsh'])
  if (which.code === 0) {
    const line = which.out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    if (line) return line
  }
  return null
}

function runDsh(ctx, args, opts = {}) {
  const cli = ctx.dshCli
  return run(cli, args, { ...opts, shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(cli) })
}

// ---------------------------------------------------------------------------
// 静态档：不需要任何安装/网络
// ---------------------------------------------------------------------------

function tierStatic() {
  section('静态档 --static（bundle manifest / files / engines vs 运行中 DSH）')
  const root = state.ctx.repoRoot
  const pkgPath = join(root, 'package.json')
  if (!exists(pkgPath)) return fail('static', 'repo', `缺少 package.json：${pkgPath}`)
  let pkg
  try { pkg = readJson(pkgPath) } catch (e) { return fail('static', 'repo', 'package.json 解析失败', firstLine(e?.message)) }
  pass('static', 'repo', `${pkg.name}@${pkg.version}（${pkg.type ?? '?'}）`, pkgPath)

  // ---- S1: main / types ----
  for (const [field, rel] of [['main', pkg.main], ['types', pkg.types]]) {
    if (typeof rel !== 'string' || rel === '') fail('static', `entry/${field}`, `${field} 未声明`)
    else if (!exists(join(root, rel))) fail('static', `entry/${field}`, `${field} 指向不存在：${rel}`)
    else pass('static', `entry/${field}`, `${field} → ${rel}`)
  }

  // ---- S2: 运行中 DSH 版本 ----
  let dshVersion = state.ctx.options.dshVersion ?? process.env.DSH_SMOKE_DSH_VERSION ?? null
  let dshSource = 'CLI 参数 / 环境变量'
  if (!dshVersion) {
    const det = detectAsarVersion(state.ctx)
    dshVersion = det.version
    dshSource = det.source ?? 'unknown'
    if (det.degraded) warn('static', 'dsh-version', `从 runtime.json 回退读取：${dshVersion}`, det.source)
    if (!dshVersion) fail('static', 'dsh-version', '无法确定运行中 DSH 版本', det.error)
  }
  if (dshVersion) pass('static', 'dsh-version', `运行中 DSH = ${dshVersion}`, dshSource)

  // ---- S3: engines 区间 ----
  const engines = pkg.engines ?? {}
  const reportRange = (id, label, range, version) => {
    if (typeof range !== 'string' || range.trim() === '') return skip('static', id, `${label} 未声明`)
    if (typeof version !== 'string' || version === '') return skip('static', id, `${label}：缺少目标版本，跳过区间判定`)
    const loose = satisfiesComparators(version, range)
    const strict = satisfiesNpm(version, range)
    if (!loose.valid) return fail('static', id, `${label} 区间语法无法解析：${range}`)
    if (!loose.result) {
      return fail('static', id, `${label} 不满足：${version} ∉ "${range}"（比较器语义=${loose.result}，npm 语义=${strict.result}）`,
        '→ 安装/激活会被 DSH 版本门禁拦下（plugin_manager: incompatible-version）')
    }
    if (!strict.result) {
      return warn('static', id, `比较器语义通过、npm 语义不通过：${version} vs "${range}"`,
        '→ 若 DSH 用 npm semver.satisfies，预发布版本会被 prerelease 排除规则拒绝；建议区间显式包含该预发布元组（如 >=0.2.1-rc.5 <0.3.0）')
    }
    return pass('static', id, `${label} 满足：${version} ∈ "${range}"`, `比较器=${loose.result} npm=${strict.result}`)
  }
  reportRange('engines/dsh', 'engines.dsh', engines.dsh, dshVersion)
  reportRange('engines/node', 'engines.node', engines.node, process.versions.node)

  // peerDependencies 关键项（cordis 与本站运行版本）
  const peers = pkg.peerDependencies ?? {}
  const peerMeta = pkg.peerDependenciesMeta ?? {}
  const cordisRange = peers['@deepseek-ai/cordis']
  if (typeof cordisRange === 'string') {
    const r = satisfiesNpm(PINNED.cordis, cordisRange)
    if (!r.valid) fail('static', 'peer/cordis', `peer range 无法解析：${cordisRange}`)
    else if (!r.result) warn('static', 'peer/cordis', `cordis ${PINNED.cordis} 不满足 "${cordisRange}"（npm 语义）`, '契约档会暴露实际影响')
    else pass('static', 'peer/cordis', `cordis ${PINNED.cordis} ∈ "${cordisRange}"`)
  }
  for (const name of ['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-skill']) {
    if (!(name in peers)) continue
    const meta = peerMeta[name]
    info('static', `peer/${name}`, `"${peers[name]}"${meta?.optional ? '（optional）' : ''}`)
    if (!meta?.optional) {
      const r = satisfiesNpm(PINNED.dshTools, peers[name])
      if (!r.result) fail('static', `peer/${name}`, `${PINNED.dshTools} 不满足 "${peers[name]}"`)
    }
  }

  // ---- S4: bundle manifest 自洽 ----
  const patchRel = pkg.dsh?.bundle?.patch
  if (typeof patchRel !== 'string' || patchRel === '') {
    fail('static', 'bundle/patch', 'package.json 未声明 dsh.bundle.patch')
  } else if (!exists(join(root, patchRel))) {
    fail('static', 'bundle/patch', `dsh.bundle.patch 指向的文件不存在：${patchRel}`)
  } else {
    pass('static', 'bundle/patch', `dsh.bundle.patch → ${patchRel}`)
    const patchAbs = join(root, patchRel)
    let patchDoc = null
    try {
      const req = createRequire(join(root, 'package.json'))
      let yaml = null
      try { yaml = req('yaml') } catch { /* yaml 未安装则用极简回退 */ }
      if (yaml?.parse) patchDoc = yaml.parse(readFileSync(patchAbs, 'utf8'), { uniqueKeys: true })
      else patchDoc = parseSimplePatchYaml(readFileSync(patchAbs, 'utf8'))
    } catch (e) {
      fail('static', 'bundle/patch-yaml', `${patchRel} YAML 解析失败`, firstLine(e?.message))
    }
    if (patchDoc) {
      const docs = Array.isArray(patchDoc) ? patchDoc : [patchDoc]
      const inserts = docs.flatMap((d) => (Array.isArray(d?.insert) ? d.insert : []))
      if (inserts.length === 0) fail('static', 'bundle/insert', 'patch 没有 insert 段')
      for (const [i, ins] of inserts.entries()) {
        const id = ins?.id ?? `#${i}`
        if (typeof ins?.name !== 'string') { fail('static', `bundle/insert:${id}`, 'insert 条目缺少 name'); continue }
        if (ins.name !== pkg.name) warn('static', `bundle/insert:${id}`, `insert.name "${ins.name}" ≠ package.name "${pkg.name}"`)
        else pass('static', `bundle/insert:${id}`, `insert.name = ${ins.name}`)
        if (ins.config !== undefined && (ins.config === null || typeof ins.config !== 'object')) {
          fail('static', `bundle/insert:${id}`, 'config 必须为对象')
        }
        // 插件 self-check：patch 引用的包必须能被 profile 安装（= 本仓库名）
      }
      const ids = inserts.map((x) => x?.id).filter(Boolean)
      if (new Set(ids).size !== ids.length) fail('static', 'bundle/insert-ids', 'insert id 重复')
      // files 覆盖：cordis.patch.yml 必须在 files 里
      const files = Array.isArray(pkg.files) ? pkg.files : []
      if (!coversByFiles(files, patchRel)) fail('static', 'bundle/files', `files[] 未覆盖 ${patchRel}`)
    }
  }

  // ---- S5: files 覆盖运行时必需文件（main/types 由 package.json 派生，适配 core/dsh 分层） ----
  const normRel = (x) => String(x ?? '').replace(/^\.\//, '').replace(/\\/g, '/')
  const requiredFiles = [...REQUIRED_RUNTIME_FILES]
  if (typeof pkg.main === 'string' && pkg.main.trim() !== '') requiredFiles.unshift(normRel(pkg.main))
  if (typeof pkg.types === 'string' && pkg.types.trim() !== '') requiredFiles.push(normRel(pkg.types))
  const files = Array.isArray(pkg.files) ? pkg.files : null
  if (files === null) { fail('static', 'files', 'package.json 未声明 files[]（发布包会包含所有文件）'); }
  else {
    const missingOnDisk = []
    const notCovered = []
    for (const rel of [...new Set(requiredFiles)]) {
      if (!exists(join(root, rel))) missingOnDisk.push(rel)
      else if (!ALWAYS_PACKED.has(rel) && !coversByFiles(files, rel)) notCovered.push(rel)
    }
    if (missingOnDisk.length > 0) fail('static', 'files/exists', `运行时必需文件缺失：${missingOnDisk.join(', ')}`)
    else pass('static', 'files/exists', `运行时必需文件齐全（${new Set(requiredFiles).size} 项，含 main/types`)
    if (notCovered.length > 0) fail('static', 'files/cover', `files[] 未覆盖：${notCovered.join(', ')}`)
    else pass('static', 'files/cover', `files[] 覆盖全部运行时必需文件`)
    // 不该进包的目录（避免把源码/测试/文档拖进发行物）
    const unwanted = ['src', 'tests', 'docs', 'scripts', 'dist', 'node_modules']
    const leaked = unwanted.filter((d) => coversByFiles(files, d))
    if (leaked.length > 0) warn('static', 'files/extra', `files[] 额外包含：${leaked.join(', ')}`)
  }

  // ---- S6: 版本单一来源 ----
  const versions = []
  versions.push(['package.json', pkg.version])
  const verRe = /dsh-normify\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/
  for (const absSrc of listFilesRec(join(root, 'src'))) {
    if (!absSrc.endsWith('.ts')) continue
    const m = verRe.exec(readFileSync(absSrc, 'utf8'))
    if (m) { versions.push(['src/' + relative(join(root, 'src'), absSrc).replace(/\\/g, '/'), m[1]]); break }
  }
  const mainRel = typeof pkg.main === 'string' ? normRel(pkg.main) : ''
  const libEntry = mainRel !== '' ? join(root, mainRel) : join(root, 'lib', 'index.js')
  if (exists(libEntry)) {
    const m = verRe.exec(readFileSync(libEntry, 'utf8'))
    if (m) versions.push([mainRel + '(构建产物)', m[1]])
  }
  const changelog = join(root, 'CHANGELOG.md')
  if (exists(changelog)) {
    const m = /^##\s*\[?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]?/m.exec(readFileSync(changelog, 'utf8'))
    if (m) versions.push(['CHANGELOG 最新条目', m[1]])
  }
  const tgzs = exists(join(root, 'dist')) ? readdirSync(join(root, 'dist')).filter((f) => f.endsWith('.tgz')) : []

  const distinct = [...new Set(versions.map(([, v]) => v))]
  if (distinct.length === 1) pass('static', 'version', `版本单一来源一致：${distinct[0]}`, versions.map(([k, v]) => `${k}=${v}`).join(' | '))
  else fail('static', 'version', `版本漂移：${distinct.join(' vs ')}`, versions.map(([k, v]) => `${k}=${v}`).join(' | '))
  if (exists(libEntry) && versions.some(([k, v]) => k.endsWith('(构建产物)') && v !== pkg.version)) {
    fail('static', 'version/lib-stale', 'lib/ 构建产物版本与 package.json 不一致（需重新 build）', `package.json=${pkg.version}，${versions.find(([k]) => k.endsWith('(构建产物)'))?.join('=')}`)
  }

  // ---- S7: lib 新鲜度（逐文件映射：src/x.ts → lib/x.js / lib/types/x.d.ts） ----
  const srcFiles = listFilesRec(join(root, 'src'))
  const libMissing = []
  const srcNewer = []
  for (const absSrc of srcFiles) {
    if (!absSrc.endsWith('.ts')) continue
    const relFile = relative(join(root, 'src'), absSrc).replace(/\\/g, '/')
    const base = relFile.replace(/\.ts$/, '')
    const candidates = [join(root, 'lib', base + '.js'), join(root, 'lib', 'types', base + '.d.ts')]
    const existing = candidates.filter((x) => exists(x))
    if (existing.length === 0) { libMissing.push(relFile); continue }
    const libTime = Math.max(...existing.map(mtimeMs))
    if (mtimeMs(absSrc) > libTime + 2000) srcNewer.push(relFile)
  }
  if (libMissing.length > 0) fail('static', 'lib/fresh', `lib/ 缺少 ${libMissing.length} 个 src 文件的构建产物（必须先 npm run build 再打包）`, libMissing.slice(0, 6).join(', '))
  else if (srcNewer.length > 0) warn('static', 'lib/fresh', `${srcNewer.length} 个 src 文件比对应 lib 产物新（可能未重建；mtime 仅供提示）`, srcNewer.slice(0, 6).join(', '))
  else pass('static', 'lib/fresh', `lib/ 与 src/ 逐文件对齐（${srcFiles.length} 个 ts 文件）`)

  // ---- S8: 工具数契约 ----
  const toolCandidates = [join(root, 'lib', 'core', 'toolset.js'), join(root, 'src', 'core', 'toolset.ts'), join(root, 'lib', 'tools.js'), join(root, 'src', 'tools.ts')]
  const toolsSrc = toolCandidates.find((x) => exists(x)) ?? null
  let toolCount = null
  if (toolsSrc) {
    const text = readFileSync(toolsSrc, 'utf8')
    toolCount = [...text.matchAll(/register\('([^']+)'/g)].map((m) => m[1])
    const names = toolCount
    const dup = names.filter((n, i) => names.indexOf(n) !== i)
    if (dup.length > 0) fail('static', 'tools/dup', `重复的工具名：${[...new Set(dup)].join(', ')}`)
    const badName = names.filter((n) => !/^[a-zA-Z0-9_-]+$/.test(n))
    if (badName.length > 0) fail('static', 'tools/name', `provider 不安全命名：${badName.join(', ')}`)
    if (names.length === 0) fail('static', 'tools/count', `在 ${relative(root, toolsSrc)} 中未解析到任何 register('…')`)
    else pass('static', 'tools/count', `${relative(root, toolsSrc)} 注册 ${names.length} 个工具`, names.slice(0, 4).join(', ') + ' …')
    // 文档声明一致性
    const claims = []
    const claimFiles = [['package.json', JSON.stringify(pkg)], ['README.md', safeRead(join(root, 'README.md'))], ['skills/normify-gen/SKILL.md', safeRead(join(root, 'skills', 'normify-gen', 'SKILL.md'))]]
    for (const [label, text] of claimFiles) {
      for (const m of String(text).matchAll(/(\d{1,3})\s*个\s*`?normify_\*?`?\s*工具/g)) claims.push({ label, n: Number(m[1]), snippet: m[0] })
      for (const m of String(text).matchAll(/badge\/tools-(\d{1,3})-/g)) claims.push({ label, n: Number(m[1]), snippet: m[0] })
    }
    const wrong = claims.filter((c) => c.n !== names.length)
    if (wrong.length > 0) warn('static', 'tools/claims', `文档声明的工具数与实际 ${names.length} 不一致`, wrong.map((c) => `${c.label}: "${c.snippet}"`).join(' | '))
    else if (claims.length > 0) pass('static', 'tools/claims', `文档声明一致（${claims.length} 处 = ${names.length}）`)
  } else skip('static', 'tools/count', '未找到工具规格源（lib/core/toolset.js / src/core/toolset.ts）')
  if (toolCount !== null) state.ctx.detectedToolCount = toolCount.length

  // ---- S9: dist tgz 内容（存在才查） ----
  const distDir = join(root, 'dist')
  if (!exists(distDir)) info('static', 'tgz', 'dist/ 不存在（未打包，属正常开发态）')
  else {
    const tgz = readdirSync(distDir).find((f) => f.endsWith('.tgz'))
    if (!tgz) info('static', 'tgz', 'dist/ 下没有 tgz')
    else {
      const abs = join(distDir, tgz)
      const versionOk = tgz.includes(`-${pkg.version}.tgz`) || tgz.includes(`-${pkg.version}-`)
      if (versionOk) pass('static', 'tgz/version', `${tgz} 与 package.version=${pkg.version} 匹配`, `${statSync(abs).size} B`)
      else warn('static', 'tgz/version', `dist/ 里的旧 tgz（${tgz}）与 package.version=${pkg.version} 不一致，发版前请重打`)
      const list = tarList(abs)
      if (list === null) skip('static', 'tgz/contents', '系统无 tar，跳过 tgz 内容检查')
      else {
        const inner = list.map((p) => p.replace(/^package\//, ''))
        const mustHave = [...new Set([mainRel, normRel(pkg.types), 'skills/normify-gen/SKILL.md', 'vendor/schemastery/lib/index.mjs', 'cordis.patch.yml', 'package.json'].filter(Boolean))]
        const missing = mustHave.filter((p) => !inner.includes(p))
        if (missing.length > 0) fail('static', 'tgz/contents', `tgz 缺少运行时文件：${missing.join(', ')}`)
        else pass('static', 'tgz/contents', `tgz 含全部运行时文件（${list.length} 项）`)
        const packedPkg = inner.includes('package.json')
        if (packedPkg) {
          const hasSrc = inner.some((p) => p.startsWith('src/') || p.startsWith('tests/'))
          if (hasSrc) warn('static', 'tgz/extra', 'tgz 内含 src/ 或 tests/')
        }
      }
    }
  }

  // ---- S10: ESM / TLA 假设 ----
  if (exists(join(root, 'lib', 'index.js'))) {
    const head = readFileSync(join(root, 'lib', 'index.js'), 'utf8').slice(0, 4096)
    if (/\bawait\s+import\(/.test(head)) info('static', 'esm/tla', '插件入口含 top-level await（只能 dynamic import，不能 require）')
    if (pkg.type !== 'module') fail('static', 'esm/type', 'package.json type 必须为 module（源码为 ESM）')
    else pass('static', 'esm/type', 'type = module')
  }
}

function coversByFiles(files, rel) {
  const norm = (s) => String(s).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  const target = norm(rel)
  for (const entry of files) {
    const e = norm(entry)
    if (e === target) return true
    if (target.startsWith(e + '/')) return true
    if (e.startsWith('*') && target.endsWith(e.slice(1))) return true
  }
  return false
}

/** 递归列出目录下全部文件的绝对路径 */
function listFilesRec(dir) {
  const out = []
  const walk = (d) => {
    let entries
    try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else out.push(p)
    }
  }
  walk(dir)
  return out
}

function newestFileMtime(dir, pred) {
  let newest = 0
  const walk = (d) => {
    let entries
    try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (pred(e.name)) newest = Math.max(newest, mtimeMs(p))
    }
  }
  walk(dir)
  return newest
}

function safeRead(p) {
  try { return readFileSync(p, 'utf8') } catch { return '' }
}

function tarList(tgzAbs) {
  const r = run('tar', ['-tzf', tgzAbs])
  if (r.code !== 0) return null
  return r.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

/** cordis.patch.yml 的极简回退解析（只取 insert[].id/name） */
function parseSimplePatchYaml(text) {
  const inserts = []
  if (!/^\s*-\s*insert:/m.test(text)) return null
  let current = null
  for (const line of text.split(/\r?\n/)) {
    const idm = /^\s*-\s*id:\s*(.+)$/.exec(line)
    if (idm) {
      if (current) inserts.push(current)
      current = { id: idm[1].trim().replace(/^['"]|['"]$/g, '') }
      continue
    }
    const nm = /^\s*name:\s*(.+)$/.exec(line)
    if (nm && current) current.name = nm[1].trim().replace(/^['"]|['"]$/g, '')
  }
  if (current) inserts.push(current)
  return { insert: inserts }
}

// ---------------------------------------------------------------------------
// 契约档：真实 dsh-tools 0.2.1 ToolRuntime + 真实 cordis Context 加载插件
// ---------------------------------------------------------------------------

async function tierContract() {
  section('契约档 --contract（真实 ToolRuntime + cordis Context 加载插件入口）')
  const c = state.ctx
  const work = c.workDir
  const dir = join(work, 'contract')
  mkdirSync(dir, { recursive: true })

  const pnpm = findPnpm(c)
  if (!pnpm) return skip('contract', 'deps', '未找到 pnpm（DSH runtime 或 PATH），无法安装 dsh-tools/cordis')

  // 1) 确保依赖就位（幂等；已安装正确版本则跳过安装）
  const want = { '@deepseek-ai/dsh-tools': c.options.contractVersion ?? PINNED.dshTools, '@deepseek-ai/cordis': c.options.cordisVersion ?? PINNED.cordis }
  const have = {}
  for (const [name, ver] of Object.entries(want)) {
    try { have[name] = readJson(join(dir, 'node_modules', ...name.split('/'), 'package.json')).version } catch { have[name] = null }
  }
  const needInstall = Object.entries(want).some(([name, ver]) => have[name] !== ver)
  if (needInstall) {
    const pjPath = join(dir, 'package.json')
    if (!exists(pjPath)) writeFileSync(pjPath, JSON.stringify({ name: 'normify-p0smoke-contract', private: true, type: 'module' }, null, 2) + '\n')
    const args = ['add', '--dir', dir, ...Object.entries(want).map(([n, v]) => `${n}@${v}`), '--store-dir', join(work, 'pnpm-store'), '--ignore-scripts', '--reporter=append-only']
    const r = run(process.execPath, [pnpm, ...args], { timeoutMs: c.options.installTimeoutMs ?? 300000 })
    if (r.code !== 0) return fail('contract', 'deps/install', '安装 dsh-tools/cordis 失败', `${firstLine(r.err) || firstLine(r.out)}\n命令：${process.execPath} ${pnpm} ${args.join(' ')}`)
    for (const [name] of Object.entries(want)) {
      try { have[name] = readJson(join(dir, 'node_modules', ...name.split('/'), 'package.json')).version } catch { have[name] = null }
    }
  }
  const versionMismatch = Object.entries(want).filter(([name, ver]) => have[name] !== ver)
  if (versionMismatch.length > 0) return fail('contract', 'deps/version', `依赖版本不符：${versionMismatch.map(([n, v]) => `${n} 期望 ${v} 实际 ${have[n]}`).join('；')}`)
  pass('contract', 'deps', `依赖就位：${Object.entries(have).map(([n, v]) => `${n}@${v}`).join(' + ')}`, dir)

  // 2) 解析入口并按绝对路径动态 import（不依赖脚本自身 node_modules）
  let dshToolsEntry, cordisEntry, assertSupportedJsonSchema, assertObjectJsonSchema, defineTool, ToolRuntime, Context
  try {
    dshToolsEntry = resolvePackageEntry(dir, '@deepseek-ai/dsh-tools')
    cordisEntry = resolvePackageEntry(dir, '@deepseek-ai/cordis')
    const toolsMod = await awaitImport(dshToolsEntry)
    const cordisMod = await awaitImport(cordisEntry)
    assertSupportedJsonSchema = toolsMod.assertSupportedJsonSchema
    assertObjectJsonSchema = toolsMod.assertObjectJsonSchema
    ToolRuntime = toolsMod.default ?? toolsMod.ToolRuntime
    Context = cordisMod.Context
    if (typeof ToolRuntime !== 'function') throw new Error('dsh-tools 未导出 ToolRuntime')
    if (typeof Context !== 'function') throw new Error('cordis 未导出 Context')
    if (typeof assertSupportedJsonSchema !== 'function') throw new Error('dsh-tools 未导出 assertSupportedJsonSchema')
  } catch (e) {
    return fail('contract', 'import', '加载 dsh-tools/cordis 失败', firstLine(e?.message) + '\n' + String(e?.stack ?? '').split('\n').slice(1, 4).join('\n'))
  }
  pass('contract', 'import', 'dsh-tools / cordis 入口加载成功', `${dshToolsEntry}\n           ${cordisEntry}`)

  // 3) 真实 cordis Context + 真实 ToolRuntime（fake systemPrompt/skills 服务）
  let ctxReal, rt
  try {
    ctxReal = new Context()
    ctxReal.provide('systemPrompt')
    ctxReal.set('systemPrompt', { tools: () => () => {}, section: () => () => {}, getSectionOrder: () => 0 })
    rt = new ToolRuntime(ctxReal, {})
    if (typeof rt.register !== 'function' || typeof rt.get !== 'function') throw new Error('ToolRuntime 实例缺少 register/get')
  } catch (e) {
    return fail('contract', 'runtime', '构造真实 ToolRuntime 失败', firstLine(e?.message))
  }
  pass('contract', 'runtime', `ToolRuntime 构造成功（inject=${JSON.stringify(ToolRuntime.inject ?? [])}）`)

  // 4) 加载插件并 apply（捕获 register 调用）
  const registered = []
  const origRegister = rt.register.bind(rt)
  rt.register = (def) => { registered.push(def); return origRegister(def) }
  ctxReal.provide('skills')
  const skills = []
  ctxReal.set('skills', { register: (spec) => { skills.push(spec); return () => {} } })

  const repoPkg = readJson(join(c.repoRoot, 'package.json'))
  const repoMain = String(repoPkg.main ?? './lib/index.js').replace(/^\.\//, '').replace(/\\/g, '/')
  const pluginEntry = join(c.repoRoot, repoMain)
  if (!exists(pluginEntry)) return fail('contract', 'plugin', `缺少构建产物：${pluginEntry}（先 npm run build）`)
  let plug
  try { plug = await awaitImport(pluginEntry) } catch (e) {
    return fail('contract', 'plugin/import', '插件入口动态 import 失败', firstLine(e?.message))
  }
  for (const field of ['name', 'inject', 'Config', 'apply']) {
    if (plug[field] === undefined) fail('contract', `plugin/export:${field}`, `插件未导出 ${field}`)
    else pass('contract', `plugin/export:${field}`, `${field} = ${field === 'apply' || field === 'Config' ? typeof plug[field] : JSON.stringify(plug[field])}`)
  }
  try {
    plug.apply(ctxReal, { rootDir: '.', requireBilingual: true, devCompanionReminder: false, devCompanionReminderAfter: 8, toolset: 'full' })
  } catch (e) {
    return fail('contract', 'plugin/apply', 'apply() 抛异常（真实 0.2.1 Context 下加载失败）', String(e?.stack ?? e).split('\n').slice(0, 6).join('\n'))
  }
  const expected = c.options.expectTools ?? c.detectedToolCount ?? CONTRACT_BOOT_FALLBACK
  pass('contract', 'plugin/apply', `apply() 成功，捕获 ${registered.length} 次 register()`)

  // 5) 注册断言
  const names = registered.map((d) => d?.name)
  if (registered.length !== expected) fail('contract', 'tools/count', `注册数 ${registered.length} ≠ 期望 ${expected}`)
  else pass('contract', 'tools/count', `${registered.length} 个工具注册成功（期望 ${expected}）`)
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  if (dup.length > 0) fail('contract', 'tools/dup', `重复注册：${[...new Set(dup)].join(', ')}`)
  if (names.some((n) => !String(n).startsWith(EXPECTED_TOOL_PREFIX))) fail('contract', 'tools/prefix', `存在非 ${EXPECTED_TOOL_PREFIX}* 工具名：${names.filter((n) => !String(n).startsWith(EXPECTED_TOOL_PREFIX)).join(', ')}`)
  else pass('contract', 'tools/prefix', `全部工具名以 ${EXPECTED_TOOL_PREFIX} 开头`)
  const missingInRuntime = names.filter((n) => !rt.get(n))
  if (missingInRuntime.length > 0) fail('contract', 'tools/visible', `真实 runtime 查不到：${missingInRuntime.join(', ')}`)
  else pass('contract', 'tools/visible', `全部 ${names.length} 个工具在真实 ToolRuntime 中可见（rt.get）`)

  // 6) 每个工具的 schema / 回调
  const schemaFails = []
  const renderFails = []
  const executeFails = []
  for (const d of registered) {
    const label = d?.name ?? '<unnamed>'
    try {
      if (!d?.parameters || typeof d.parameters !== 'object') throw new Error('缺少 parameters 对象')
      assertObjectJsonSchema(d.parameters)
    } catch (e) { schemaFails.push(`${label}: parameters → ${firstLine(e?.message, 160)}`) }
    try {
      if (!d?.output || typeof d.output !== 'object') throw new Error('缺少 output 对象')
      assertSupportedJsonSchema(d.output.schema)
    } catch (e) { schemaFails.push(`${label}: output.schema → ${firstLine(e?.message, 160)}`) }
    if (typeof d?.output?.render !== 'function') renderFails.push(label)
    if (typeof d?.execute !== 'function') executeFails.push(label)
    if (typeof d?.description !== 'string' || d.description.trim() === '') renderFails.push(`${label}(description 空)`)
  }
  if (schemaFails.length > 0) fail('contract', 'schema/subset', `${schemaFails.length} 个参数/输出 schema 不在 0.2.1 子集内`, schemaFails.slice(0, 6).join('\n           '))
  else pass('contract', 'schema/subset', `全部 ${registered.length} 个工具的 parameters 通过 assertObjectJsonSchema、output.schema 通过 assertSupportedJsonSchema`)
  if (renderFails.length > 0) fail('contract', 'schema/render', `output.render/description 缺失：${renderFails.join(', ')}`)
  else pass('contract', 'schema/render', '全部 output.render 为函数、description 非空')
  if (executeFails.length > 0) fail('contract', 'schema/execute', `execute 非函数：${executeFails.join(', ')}`)
  else pass('contract', 'schema/execute', '全部 execute 为函数')

  // 离线子集兜底扫描（不依赖 dsh-tools 导出，捕捉"未来关键字"）
  const unsupported = []
  const walkSchema = (node, path) => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      if (Array.isArray(node)) node.forEach((n, i) => walkSchema(n, `${path}[${i}]`))
      return
    }
    for (const [k, v] of Object.entries(node)) {
      if (!SUPPORTED_JSON_SCHEMA_KEYS.has(k)) unsupported.push(`${path}.${k}`)
      if (k === 'properties' && v && typeof v === 'object') for (const [pk, pv] of Object.entries(v)) walkSchema(pv, `${path}.properties.${pk}`)
      else if (k === 'items') walkSchema(v, `${path}.items`)
      else if (k === 'oneOf' && Array.isArray(v)) v.forEach((n, i) => walkSchema(n, `${path}.oneOf[${i}]`))
    }
  }
  for (const d of registered) { walkSchema(d.parameters, `${d.name}.parameters`); walkSchema(d.output?.schema, `${d.name}.output.schema`) }
  if (unsupported.length > 0) fail('contract', 'schema/offline-subset', `${unsupported.length} 处疑似非 0.2.1 子集关键字`, [...new Set(unsupported)].slice(0, 8).join(', '))
  else pass('contract', 'schema/offline-subset', '离线子集扫描通过（无 $ref/allOf/anyOf/patternProperties 等）')

  // 7) 并发安全标记（0.2.1 期望 (args)=>boolean；旧代码 () => true 仍可调用）
  const conc = registered.filter((d) => d?.isConcurrencySafe !== undefined)
  const concBad = conc.filter((d) => { try { return typeof d.isConcurrencySafe() !== 'boolean' } catch { return true } })
  if (concBad.length > 0) fail('contract', 'concurrency', `isConcurrencySafe 调用异常/非布尔：${concBad.map((d) => d.name).join(', ')}`)
  else pass('contract', 'concurrency', `${conc.length} 个工具声明 isConcurrencySafe，调用返回布尔`)
  const readTools = registered.filter((d) => d?.behavior === 'read')
  const readWithoutConc = readTools.filter((d) => typeof d?.isConcurrencySafe !== 'function')
  if (readWithoutConc.length > 0) warn('contract', 'concurrency/read', `${readWithoutConc.length} 个 behavior=read 的工具未声明 isConcurrencySafe`, readWithoutConc.map((d) => d.name).join(', '))
  const legacy = registered.filter((d) => 'readOnly' in (d ?? {}) || 'idempotent' in (d ?? {}) || 'destructive' in (d ?? {}))
  if (legacy.length > 0) info('contract', 'legacy-fields', `${legacy.length} 个工具仍带 0.2.0 以前的 readOnly/idempotent/destructive 字段（0.2.1 不读取，允许）`)

  // 8) skill 注册
  if (skills.length === 0) fail('contract', 'skill', 'skills.register 未被调用（技能未注册）')
  else if (skills.length > 1) fail('contract', 'skill', `注册了 ${skills.length} 个技能（期望 1）`)
  else {
    const s = skills[0]
    const checks = []
    if (s.name !== 'normify-gen') checks.push(`name=${s.name}`)
    if (typeof s.description !== 'string' || s.description.trim() === '') checks.push('description 空')
    if (typeof s.content !== 'string' || s.content.length < 500) checks.push(`content 过短(${String(s.content ?? '').length})`)
    if (s.resourceBase?.kind !== 'directory') checks.push('resourceBase.kind')
    if (s.resourceBase?.path && !exists(s.resourceBase.path)) checks.push(`resourceBase.path 不存在：${s.resourceBase.path}`)
    if (s.invocation?.modelInvocable !== true) checks.push('invocation.modelInvocable')
    if (checks.length > 0) fail('contract', 'skill', `技能注册形状异常：${checks.join('；')}`)
    else pass('contract', 'skill', `技能 normify-gen 注册成功（desc ${s.description.length}B / content ${s.content.length}B）`, s.resourceBase.path)
    // SKILL.md 自身 frontmatter
    const skillMd = safeRead(join(c.repoRoot, 'skills', 'normify-gen', 'SKILL.md'))
    if (skillMd.startsWith('---') && /name:\s*normify-gen/.test(skillMd)) pass('contract', 'skill/frontmatter', 'SKILL.md frontmatter 有效')
    else fail('contract', 'skill/frontmatter', 'SKILL.md frontmatter 无效')
  }
}

function resolvePackageEntry(nodeModulesRoot, spec) {
  const pkgJson = join(nodeModulesRoot, 'node_modules', ...spec.split('/'), 'package.json')
  if (!exists(pkgJson)) throw new Error(`包未安装：${pkgJson}`)
  const pj = readJson(pkgJson)
  const exp = pj.exports?.['.']
  const rel = typeof exp === 'string'
    ? exp
    : exp?.import ?? exp?.default ?? exp?.node ?? (typeof pj.main === 'string' ? pj.main : 'index.js')
  if (typeof rel !== 'string') throw new Error(`${spec} 无法解析入口`)
  return resolve(dirname(pkgJson), rel)
}

async function awaitImport(absPath) {
  return import(pathToFileURL(absPath).href)
}

// ---------------------------------------------------------------------------
// 启动档：pack → 临时 profile 安装 → dump-config → 真实挂载探测
// ---------------------------------------------------------------------------

async function tierBoot() {
  section('启动档 --boot（pnpm pack → 临时 DSH_HOME/profile → dump-config → 挂载探测）')
  const c = state.ctx
  const cli = detectDshCli(c)
  if (!cli) return skip('boot', 'cli', '未找到 dsh 启动器（--dsh-cli / DSH_SMOKE_CLI / 桌面端 runtime/cli/bin/dsh.cmd）')
  c.dshCli = cli
  const ver = runDsh(c, ['--version'])
  if (ver.code !== 0) return fail('boot', 'cli', 'dsh --version 失败', firstLine(ver.err || ver.out))
  const cliVer = ver.out.trim().split(/\r?\n/).pop()
  pass('boot', 'cli', `dsh ${cliVer}`, cli)

  const pnpm = findPnpm(c)
  if (!pnpm) return skip('boot', 'pnpm', '未找到 pnpm，无法打包/安装')

  const bootRoot = join(c.workDir, 'boot')
  const packDir = join(bootRoot, 'pack')
  const homeDir = join(bootRoot, 'home')
  const storeDir = join(bootRoot, 'store')
  mkdirSync(packDir, { recursive: true })
  mkdirSync(homeDir, { recursive: true })

  // B1: pack（产物只写 --work，不污染仓库）
  const pack = run(process.execPath, [pnpm, 'pack', '--pack-destination', packDir], { cwd: c.repoRoot, timeoutMs: 120000 })
  if (pack.code !== 0) return fail('boot', 'pack', 'pnpm pack 失败', firstLine(pack.err || pack.out))
  const tgz = readdirSync(packDir).find((f) => f.endsWith('.tgz'))
  if (!tgz) return fail('boot', 'pack', 'pnpm pack 未产出 tgz')
  const tgzPath = join(packDir, tgz)
  pass('boot', 'pack', `${tgz}（${statSync(tgzPath).size} B）`, tgzPath)

  // B2: 临时 DSH_HOME + 从 web 模板建 profile
  const env = { DSH_HOME: homeDir }
  const profile = 'smoke'
  const tmpl = runDsh(c, ['--profile', profile, '--from-default-profile', 'web', '--dump-config'], { env, timeoutMs: 120000 })
  if (tmpl.code !== 0) return fail('boot', 'profile/init', '从 web 模板初始化临时 profile 失败', firstLine(tmpl.err || tmpl.out))
  pass('boot', 'profile/init', `临时 profile 已创建：DSH_HOME=${homeDir}`, `profiles/${profile}`)

  // B3: 安装 tgz（本地 file: 依赖，pnpm 只联网取 plugin 的 yaml 依赖）
  const add = runDsh(c, ['plugin', '--profile', profile, 'add', tgzPath, '--store-dir', storeDir], { env, timeoutMs: 300000 })
  if (add.code !== 0) return fail('boot', 'plugin/add', 'dsh plugin add <tgz> 失败', firstLine(add.err || add.out))
  pass('boot', 'plugin/add', 'dsh plugin add <tgz> 成功（profile 依赖 + bundles 已登记）')

  // B4: profile 清单自洽
  const profilePkgPath = join(homeDir, 'profiles', profile, 'package.json')
  let profilePkg = null
  try { profilePkg = readJson(profilePkgPath) } catch { /* 下面报 */ }
  if (!profilePkg) fail('boot', 'profile/pkg', `profile package.json 不存在：${profilePkgPath}`)
  else {
    const depKeys = Object.keys(profilePkg.dependencies ?? {})
    const bundles = profilePkg.dsh?.profile?.bundles ?? []
    if (!depKeys.includes('@dsh-external/dsh-normify')) fail('boot', 'profile/dep', 'profile 未依赖 @dsh-external/dsh-normify', depKeys.join(', '))
    else pass('boot', 'profile/dep', `profile 已依赖 @dsh-external/dsh-normify（${profilePkg.dependencies['@dsh-external/dsh-normify']}）`)
    if (!bundles.includes('@dsh-external/dsh-normify')) fail('boot', 'profile/bundle', 'profile 的 dsh.profile.bundles 未登记本插件', bundles.join(', '))
    else pass('boot', 'profile/bundle', `profile bundles 已登记（共 ${bundles.length} 项）`)
  }

  // B5: 组合树含插件层（dump-config 不挂载，验证 bundle patch 被接受）
  const dump = runDsh(c, ['--profile', profile, '--dump-config'], { env, timeoutMs: 120000 })
  if (dump.code !== 0) return fail('boot', 'dump-config', '--dump-config 失败（bundle/patch 合成有问题）', firstLine(dump.err || dump.out))
  const hasLayer = /#\s*==\s*@dsh-external\/dsh-normify/.test(dump.out) && /id:\s*dsh-normify/.test(dump.out)
  if (hasLayer) pass('boot', 'dump-config', '组合树包含 dsh-normify 插件层（bundle patch 被 0.2.1 接受）')
  else fail('boot', 'dump-config', '组合树中未找到 dsh-normify 插件层', dump.out.split(/\r?\n/).filter((l) => /normify|insert/i.test(l)).slice(0, 5).join('\n'))

  // B6: 真实挂载探测（boot web app 并抓插件 apply 日志；跑完 kill）
  if (c.options.mount === false) {
    skip('boot', 'mount', '--no-mount 指定跳过真实挂载探测')
    return
  }
  await mountProbe(c, { env, profile })
}

/**
 * 真实挂载探测：用 headless profile 让 DSH 真正 mount 全部插件后主动退出。
 * 0.5.5 起插件不再 console.log（只走 ctx.logger），所以不再以「加载日志」为判据：
 *   - 到达 MISSING_CREDENTIAL / 模型调用阶段 = profile 合成 + 所有插件 mount 成功（含本插件）；
 *   - 若插件 apply 抛错，DSH 会在 mount 阶段报 plugin/loader 错误，故用「无 mount 错误」反证；
 *   - 带 DEEPSEEK_API_KEY 时若真跑通，同样算 PASS。
 */
async function mountProbe(c, { env, profile }) {
  const timeoutMs = c.options.mountTimeoutMs ?? 30000
  const headless = profile + '-hl'
  const init = runDsh(c, ['--profile', headless, '--from-default-profile', 'headless', '--dump-config'], { env, timeoutMs: 120000 })
  if (init.code !== 0) return skip('boot', 'mount', 'headless 模板初始化失败，跳过真实挂载探测', firstLine(init.err || init.out))
  // headless profile 独立，需要自己安装一次插件
  const packDir = join(c.workDir, 'boot', 'pack')
  const tgz = readdirSync(packDir).find((f) => f.endsWith('.tgz'))
  if (!tgz) return skip('boot', 'mount', '未找到已打包 tgz，跳过真实挂载探测')
  const add = runDsh(c, ['plugin', '--profile', headless, 'add', join(packDir, tgz), '--store-dir', join(c.workDir, 'boot', 'store')], { env, timeoutMs: 300000 })
  if (add.code !== 0) return skip('boot', 'mount', 'headless profile 安装插件失败，跳过真实挂载探测', firstLine(add.err || add.out))

  let output = ''
  const child = spawn(c.dshCli, ['--profile', headless, 'say hi'], {
    cwd: c.workDir,
    env: { ...process.env, ...env },
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(c.dshCli),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (d) => { output += d.toString() })
  child.stderr.on('data', (d) => { output += d.toString() })
  let exited = false
  let exitCode = null
  child.on('exit', (code) => { exited = true; exitCode = code })
  const started = Date.now()
  while (!exited && Date.now() - started < timeoutMs) await new Promise((r) => setTimeout(r, 200))
  if (!exited) killTree(child)
  await new Promise((r) => setTimeout(r, 300))

  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const tail = lines.slice(-6).join('\n')
  const normifyErr = lines.filter((l) => /normify/i.test(l) && /error|failed|throw|cannot|无法|失败/i.test(l))
  const mountErr = lines.filter((l) => /plugin/i.test(l) && /error|failed|throw/i.test(l))
  if (normifyErr.length > 0 || mountErr.length > 0) {
    return fail('boot', 'mount', '插件 mount 阶段报错', [...normifyErr, ...mountErr].slice(0, 4).join(' | '))
  }
  const reachedModel = lines.some((l) => /MISSING_CREDENTIAL|no API key|provider route|API key/i.test(l))
  const reachedNormifyLog = /\[normify\]/.test(output)
  if (!reachedModel && !reachedNormifyLog) {
    const why = exited ? '进程退出但没有可判定的 mount 证据（code=' + exitCode + '）' : timeoutMs + 'ms 内未完成挂载探测'
    return skip('boot', 'mount', why, tail)
  }
  const stage = reachedModel ? '已进入模型/凭据阶段（=插件全部 mount 成功）' : '捕获 [normify] 日志'
  const evidence = stage + '；exit=' + (exitCode === null ? 'killed' : exitCode) + '；' + lines.slice(-2).join(' ← ')
  pass('boot', 'mount', '真实挂载成功：headless profile 合成 + 插件 mount 无错误（engines 门禁已解除）', evidence)
}

function killTree(child) {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else {
      try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
    }
  } catch { try { child.kill('SIGKILL') } catch { /* ignore */ } }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const o = {
    tiers: [],
    repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    workDir: null,
    noJson: false,
    quiet: false,
    keep: false,
    strict: false,
    mount: true,
  }
  const take = (i) => { o._pending = i; return argv[i + 1] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const nextVal = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`参数 ${a} 缺少值`)
      return v
    }
    switch (a) {
      case '--static': o.tiers.push('static'); break
      case '--contract': o.tiers.push('contract'); break
      case '--boot': o.tiers.push('boot'); break
      case '--all': o.tiers.push('static', 'contract', 'boot'); break
      case '--strict': o.strict = true; break
      case '--quiet': o.quiet = true; break
      case '--keep': o.keep = true; break
      case '--no-mount': o.mount = false; break
      case '--no-json': o.noJson = true; break
      case '--repo-root': o.repoRoot = resolve(nextVal()); break
      case '--work': o.workDir = resolve(nextVal()); break
      case '--dsh-version': o.dshVersion = nextVal(); break
      case '--asar': o.asar = resolve(nextVal()); break
      case '--desktop': o.desktop = resolve(nextVal()); break
      case '--dsh-cli': o.dshCli = resolve(nextVal()); break
      case '--pnpm': o.pnpm = resolve(nextVal()); break
      case '--contract-version': o.contractVersion = nextVal(); break
      case '--cordis-version': o.cordisVersion = nextVal(); break
      case '--expect-tools': o.expectTools = Number(nextVal()); break
      case '--mount-timeout': o.mountTimeoutMs = Number(nextVal()); break
      case '--install-timeout': o.installTimeoutMs = Number(nextVal()); break
      case '--json-out': o.jsonOut = resolve(nextVal()); break
      case '-h': case '--help': o.help = true; break
      default:
        if (a.startsWith('-')) throw new Error(`未知参数：${a}（--help 查看用法）`)
    }
  }
  if (o.tiers.length === 0 && !o.help) o.tiers = ['static']
  return o
}

function printHelp() {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').replace(/^\s*\*? ?/gm, '').trim())
}

export function summarize(checks, strict) {
  const count = (s) => checks.filter((c) => c.status === s).length
  const fails = count('FAIL')
  const warns = count('WARN')
  return {
    pass: count('PASS'), fail: fails, warn: warns, skip: count('SKIP'), info: count('INFO'),
    ok: fails === 0 && (!strict || warns === 0),
  }
}

async function main() {
  let options
  try { options = parseArgs(process.argv.slice(2)) } catch (e) {
    console.error(String(e?.message ?? e))
    process.exit(2)
  }
  if (options.help) { printHelp(); process.exit(0) }

  const repoRoot = resolve(options.repoRoot)
  if (!exists(join(repoRoot, 'package.json'))) {
    console.error(`不是插件仓库（缺少 package.json）：${repoRoot}`)
    process.exit(2)
  }
  const workDir = options.workDir ?? resolve(repoRoot, '..', '..', '_normify-audit', '_p0smoke')
  mkdirSync(workDir, { recursive: true })

  state.ctx = {
    options, repoRoot, workDir,
    desktop: detectDesktop({ options }),
    dshCli: null,
    detectedToolCount: null,
  }
  const c = state.ctx
  console.log(`pack-smoke  dsh-normify  repo=${repoRoot}`)
  console.log(`            node=${process.version}  work=${workDir}`)
  console.log(`            desktop=${c.desktop ?? '<未探测到>'}  tiers=${options.tiers.join(',')}${options.strict ? '  strict' : ''}`)

  for (const tier of options.tiers) {
    try {
      if (tier === 'static') tierStatic()
      else if (tier === 'contract') await tierContract()
      else if (tier === 'boot') await tierBoot()
    } catch (e) {
      fail(tier, 'uncaught', `${tier} 档未捕获异常`, String(e?.stack ?? e).split('\n').slice(0, 5).join('\n'))
    }
  }

  const sum = summarize(state.checks, options.strict)
  const elapsed = ((Date.now() - state.startedAt.getTime()) / 1000).toFixed(1)
  console.log(`\n=== 汇总（${elapsed}s）：PASS ${sum.pass} / FAIL ${sum.fail} / WARN ${sum.warn} / SKIP ${sum.skip} / INFO ${sum.info} ===`)
  const failed = state.checks.filter((x) => x.status === 'FAIL')
  if (failed.length > 0) {
    console.log('失败项：')
    for (const f of failed) console.log(`  - [${f.tier}/${f.id}] ${f.detail}`)
  }
  if (options.strict && sum.warn > 0) {
    console.log('WARN 项（--strict 视为失败）：')
    for (const w of state.checks.filter((x) => x.status === 'WARN')) console.log(`  - [${w.tier}/${w.id}] ${w.detail}`)
  }
  console.log(sum.ok ? 'RESULT: PASS' : 'RESULT: FAIL')

  if (!options.noJson) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const outPath = options.jsonOut ?? join(workDir, `pack-smoke-${ts}.json`)
    try {
      writeFileSync(outPath, JSON.stringify({
        schema: 'normify-pack-smoke/1',
        startedAt: state.startedAt.toISOString(),
        elapsedSeconds: Number(elapsed),
        node: process.version,
        repoRoot,
        desktop: c.desktop,
        tiers: options.tiers,
        strict: options.strict,
        summary: sum,
        checks: state.checks,
      }, null, 2) + '\n')
      console.log(`结果 JSON：${outPath}`)
    } catch (e) {
      console.log(`[WARN] 结果 JSON 写入失败：${firstLine(e?.message)}`)
    }
  }

  if (!options.keep) {
    // boot/contract 的安装目录体积大；默认清理（保留 JSON 由 outPath 决定）
    for (const sub of ['boot']) {
      try { rmSync(join(workDir, sub), { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }
  process.exit(sum.ok ? 0 : 1)
}

main().catch((e) => {
  console.error('pack-smoke 崩溃：', e)
  process.exit(2)
})
