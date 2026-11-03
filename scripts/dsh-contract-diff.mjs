#!/usr/bin/env node
/**
 * scripts/dsh-contract-diff.mjs — DSH 契约漂移自动检测（P1-10）
 *
 * 只比较「Normify 实际使用的 DSH 符号面」，避免整份 .d.ts 的噪声：
 *   register / defineTool / ToolDefinition / output / ToolSchema /
 *   skills.register / SkillRegistration / tools/post-execute / Context.effect
 *
 * 做法：
 *   1) 取「当前已对齐的 DSH 版本」= --pinned 或 NORMIFY_DSH_PIN → package.json 的
 *      dsh.version / dsh.testedDshVersion（若 Lead 添加）→ 本地 tests/.dsh-deps 已装版本
 *      → engines.dsh 下界（最后兜底）。
 *   2) 取目标版本 = --target（默认 next 与 alpha）或 --new；从 npm registry 查 dist-tags。
 *   3) 下载两个版本的 @deepseek-ai/dsh-tools tarball，解包 lib/types/**.d.ts，
 *      只抽取命中上述符号面的声明行（去注释、压空白后比较）。
 *   4) 有差异 → 打印报告并退出 1；无差异 → PASS 退出 0；网络/工具不可用 → 退出 2（SKIP）。
 *
 * 用法：
 *   node scripts/dsh-contract-diff.mjs                     # pinned vs next + alpha
 *   node scripts/dsh-contract-diff.mjs --target next
 *   node scripts/dsh-contract-diff.mjs --old 0.2.1-rc.1 --new 0.2.1-rc.5   # 显式对比（自测/伪造版本）
 *   node scripts/dsh-contract-diff.mjs --json              # 机器可读
 *   node scripts/dsh-contract-diff.mjs --report out.md     # 报告写文件（CI issue 用）
 *
 * 退出码：0 无差异；1 有差异；2 无法检测（网络/版本/tar 缺失）——watch workflow 需区分。
 * 注意：CI/本地无缓存时请先 `npm run test:contract`（装 tests/.dsh-deps），pinned 才能落在实测版本上。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = process.env.NORMIFY_NPM_REGISTRY ?? 'https://registry.npmjs.org'
const PKG = '@deepseek-ai/dsh-tools'

// Normify 使用的 DSH 符号面（归一化后的行匹配）
const TOKENS = [
  { id: 'register', re: /\bregister\s*\(/ },
  { id: 'defineTool', re: /\bdefineTool\b/ },
  { id: 'ToolDefinition', re: /\bToolDefinition\b/ },
  { id: 'output', re: /\boutput\s*\??\s*:/ },
  { id: 'ToolSchema', re: /\bToolSchema\b/ },
  { id: 'skills.register', re: /\bskills?\s*\.\s*register\b/ },
  { id: 'SkillRegistration', re: /\bSkillRegistration\b/ },
  { id: 'tools/post-execute', re: /tools\/post-execute/ },
  { id: 'Context.effect', re: /\bContext\b[^\n]*\beffect\b|\beffect\s*[?:]\s*\(/ },
]
const TOKEN_IDS = TOKENS.map((t) => t.id)

function parseArgs(argv) {
  const o = { targets: [], json: false, report: null, pinned: null, oldVer: null, newVer: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(a + ' 缺少取值')
      return v
    }
    if (a === '--target') o.targets.push(val())
    else if (a === '--pinned') o.pinned = val()
    else if (a === '--old') o.oldVer = val()
    else if (a === '--new') o.newVer = val()
    else if (a === '--json') o.json = true
    else if (a === '--report') o.report = resolve(val())
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0) }
    else throw new Error('未知参数：' + a)
  }
  if (o.targets.length === 0 && o.newVer === null) o.targets = ['next', 'alpha']
  return o
}

function printHelp() {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').replace(/^\s*\*? ?/gm, '').trim())
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: opts.timeoutMs ?? 180000, maxBuffer: 64 * 1024 * 1024, ...opts })
  return { code: r.status ?? -1, out: String(r.stdout ?? ''), err: String(r.stderr ?? '') }
}

function readJsonNoThrow(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}

function semverKey(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v).trim())
  if (!m) return null
  return { raw: m[0], core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] }
}
function cmpPre(a, b) {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1
    if (i >= b.length) return 1
    const x = a[i], y = b[i], xn = /^\d+$/.test(x), yn = /^\d+$/.test(y)
    if (xn && yn) { const d = Number(x) - Number(y); if (d) return d < 0 ? -1 : 1 }
    else if (xn) return -1
    else if (yn) return 1
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}
function cmpVer(a, b) {
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i] ? -1 : 1
  return cmpPre(a.pre, b.pre)
}

/** 解析「当前已对齐版本」 */
function resolvePinned(opts) {
  if (opts.pinned) return { version: opts.pinned, source: '--pinned' }
  if (process.env.NORMIFY_DSH_PIN) return { version: process.env.NORMIFY_DSH_PIN, source: 'env NORMIFY_DSH_PIN' }
  const pkg = readJsonNoThrow(join(repoRoot, 'package.json')) ?? {}
  for (const key of ['version', 'testedDshVersion', 'pin']) {
    const v = pkg.dsh?.[key]
    if (typeof v === 'string' && /^\d+\.\d+\.\d+/.test(v)) return { version: v, source: 'package.json dsh.' + key }
  }
  // 已安装的测试依赖（tests/.dsh-deps 或旧缓存）
  for (const dir of [join(repoRoot, 'tests', '.dsh-deps'), resolve(repoRoot, '..', '..', '_p0smoke', 'work', 'contract')]) {
    const p = join(dir, 'node_modules', ...PKG.split('/'), 'package.json')
    const v = readJsonNoThrow(p)?.version
    if (typeof v === 'string') return { version: v, source: '已安装测试依赖 ' + p }
  }
  // engines.dsh 下界兜底
  const range = pkg.engines?.dsh
  const m = typeof range === 'string' ? />=\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(range) : null
  if (m) return { version: m[1], source: 'engines.dsh 下界（兜底）' }
  return { version: null, source: null }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url)
  return res.json()
}

async function resolveTargets(opts) {
  const out = []
  for (const t of opts.targets) {
    if (/^\d+\.\d+\.\d+/.test(t)) { out.push({ label: t, version: t }); continue }
    const meta = await fetchJson(`${REGISTRY}/${PKG.replace('/', '%2F')}`)
    const version = meta?.['dist-tags']?.[t]
    if (typeof version !== 'string') throw new Error(`dist-tag ${t} 不存在（可用：${Object.keys(meta?.['dist-tags'] ?? {}).join(', ')}）`)
    out.push({ label: 'dist-tag:' + t, version })
  }
  return out
}

/** 下载并解包指定版本 dsh-tools，返回 { version, dir, types: Map<relPath, text> } */
async function downloadTypes(version, tmpRoot) {
  const meta = await fetchJson(`${REGISTRY}/${PKG.replace('/', '%2F')}/${encodeURIComponent(version)}`)
  const tarball = meta?.dist?.tarball
  if (typeof tarball !== 'string') throw new Error('拿不到 tarball URL：' + version)
  const tgz = join(tmpRoot, `dsh-tools-${version.replace(/[^\w.-]/g, '_')}.tgz`)
  const res = await fetch(tarball)
  if (!res.ok) throw new Error('下载失败 HTTP ' + res.status + '：' + tarball)
  writeFileSync(tgz, Buffer.from(await res.arrayBuffer()))
  const dir = join(tmpRoot, 'x-' + version.replace(/[^\w.-]/g, '_'))
  mkdirSync(dir, { recursive: true })
  const tar = run('tar', ['-xzf', tgz, '-C', dir])
  if (tar.code !== 0) throw new Error('tar 解包失败（需要系统 tar）：' + (tar.err || tar.out).slice(0, 200))
  const pkgDir = join(dir, 'package')
  const types = new Map()
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.d.ts')) types.set(p.slice(pkgDir.length + 1).replace(/\\/g, '/'), readFileSync(p, 'utf8'))
    }
  }
  const typesDir = join(pkgDir, 'lib', 'types')
  if (!existsSync(typesDir)) throw new Error(`版本 ${version} 不含 lib/types/（包结构已变）`)
  walk(typesDir)
  return { version, dir: pkgDir, types }
}

/** 抽取符号面声明行：去注释 → 按行合并 → 只保留命中 token 的行 */
function extractSurface(types) {
  const surface = new Map() // normalizedLine -> { file, raw }
  for (const [file, text] of types) {
    const clean = String(text)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    for (const raw of clean.split(/\r?\n/)) {
      const line = raw.replace(/\s+/g, ' ').trim()
      if (line === '') continue
      const hit = TOKENS.find((t) => t.re.test(line))
      if (!hit) continue
      // 过滤纯注释/空声明噪声；保留归一化行作为签名
      if (!surface.has(line)) surface.set(line, { file, token: hit.id })
    }
  }
  return surface
}

async function main() {
  let opts
  try { opts = parseArgs(process.argv.slice(2)) } catch (e) { console.error(String(e.message)); process.exit(2) }

  const pinned = opts.oldVer ? { version: opts.oldVer, source: '--old' } : resolvePinned(opts)
  if (!pinned.version) {
    console.error('SKIP: 无法确定当前已对齐的 DSH 版本（可加 --pinned <version>）')
    process.exit(2)
  }
  let targets
  try {
    targets = opts.newVer ? [{ label: '--new', version: opts.newVer }] : await resolveTargets(opts)
  } catch (e) {
    console.error('SKIP: 查询 npm dist-tags 失败（网络不可用？）：' + String(e?.message ?? e))
    process.exit(2)
  }

  const tmpRoot = mkdtempSync(join(tmpdir(), 'normify-dshdiff-'))
  const report = { pinned, compared: [], differences: [], checkedAt: new Date().toISOString(), tokens: TOKEN_IDS }
  try {
    let pinnedTypes = null
    const cache = new Map()
    const loadTypes = async (version) => {
      if (!cache.has(version)) cache.set(version, await downloadTypes(version, tmpRoot))
      return cache.get(version)
    }
    for (const target of targets) {
      if (target.version === pinned.version) {
        report.compared.push({ target: target.label, version: target.version, status: 'same', removed: 0, added: 0 })
        continue
      }
      if (pinnedTypes === null) pinnedTypes = await loadTypes(pinned.version)
      const newTypes = await loadTypes(target.version)
      const oldSurface = extractSurface(pinnedTypes.types)
      const newSurface = extractSurface(newTypes.types)
      const removed = [...oldSurface.keys()].filter((l) => !newSurface.has(l))
      const added = [...newSurface.keys()].filter((l) => !oldSurface.has(l))
      report.compared.push({
        target: target.label, version: target.version,
        oldVersion: pinned.version,
        oldFiles: pinnedTypes.types.size, newFiles: newTypes.types.size,
        oldSurfaceLines: oldSurface.size, newSurfaceLines: newSurface.size,
        removed: removed.length, added: added.length,
      })
      if (removed.length > 0 || added.length > 0) {
        report.differences.push({
          target: target.label, version: target.version, oldVersion: pinned.version,
          removed: removed.slice(0, 40).map((l) => ({ line: l, file: oldSurface.get(l).file, token: oldSurface.get(l).token })),
          added: added.slice(0, 40).map((l) => ({ line: l, file: newSurface.get(l).file, token: newSurface.get(l).token })),
          removedTotal: removed.length, addedTotal: added.length,
        })
      }
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }

  const hasDiff = report.differences.length > 0
  if (opts.json) {
    const text = JSON.stringify(report, null, 2)
    console.log(text)
    if (opts.report) writeFileSync(opts.report, text + '\n')
  } else {
    const lines = []
    lines.push('# DSH 契约漂移报告（' + report.checkedAt + '）')
    lines.push('')
    lines.push(`- 已对齐版本（pinned）：**${pinned.version}**（来源：${pinned.source}）`)
    lines.push('- 比较符号面：' + TOKEN_IDS.join(' / '))
    lines.push('')
    lines.push('| 目标 | 版本 | 状态 | 旧符号行 | 新符号行 | 移除 | 新增 |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- |')
    for (const c of report.compared)
      lines.push(`| ${c.target} | ${c.version} | ${c.status ?? (c.removed + c.added === 0 ? '一致' : '有差异')} | ${c.oldSurfaceLines ?? '-'} | ${c.newSurfaceLines ?? '-'} | ${c.removed ?? 0} | ${c.added ?? 0} |`)
    if (hasDiff) {
      lines.push('')
      lines.push('## 差异明细（Normify 使用的符号面发生变化）')
      for (const d of report.differences) {
        lines.push('')
        lines.push(`### ${d.oldVersion} → ${d.version}（${d.target}）`)
        if (d.removedTotal > 0) {
          lines.push(`**移除/改写 ${d.removedTotal} 行（可能破坏 Normify 适配层）**：`)
          lines.push('```diff')
          for (const r of d.removed.slice(0, 20)) lines.push('- [' + r.token + '] ' + r.line)
          lines.push('```')
        }
        if (d.addedTotal > 0) {
          lines.push(`**新增 ${d.addedTotal} 行（如需使用需同步升级）**：`)
          lines.push('```diff')
          for (const a of d.added.slice(0, 20)) lines.push('+ [' + a.token + '] ' + a.line)
          lines.push('```')
        }
      }
    }
    lines.push('')
    lines.push(hasDiff ? '**结论：检测到契约漂移 → 需要复核 src/dsh 适配层并更新测试**' : '**结论：符号面无变化（PASS）**')
    const text = lines.join('\n') + '\n'
    console.log(text)
    if (opts.report) writeFileSync(opts.report, text)
  }
  process.exit(hasDiff ? 1 : 0)
}

main().catch((e) => {
  console.error('SKIP: 契约漂移检测异常：' + String(e?.stack ?? e))
  process.exit(2)
})
