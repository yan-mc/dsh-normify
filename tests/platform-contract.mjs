#!/usr/bin/env node
/**
 * tests/platform-contract.mjs — L2 平台契约测试（真实 DSH 0.2.1 ToolRuntime）
 *
 * 用真实 `@deepseek-ai/dsh-tools@0.2.1-rc.5` 的 ToolRuntime + 真实 cordis Context 加载
 * `lib/dsh/index.js` 的 `apply()`，断言适配层（ADR-0010：不 import dsh-tools 运行时、
 * 等价 ToolDefinition 构造）产出的定义满足 0.2.1 契约：
 *   - 31 个工具注册、名字唯一且 normify_* 前缀、真实 runtime 可见；
 *   - 每个 parameters 过 assertObjectJsonSchema；
 *   - 每个 output.schema 过 assertSupportedJsonSchema 且非 `{}`（真实渲染 schema）；
 *   - output.render / execute 为函数；presentCall / presentResult 可调用并返回视图；
 *   - isConcurrencySafe 只出现在 read 类工具上（0.2.1 签名 (args)=>boolean）；
 *   - skill normify-gen 注册成功（name/description/content/resourceBase/invocation）。
 *
 * 依赖获取（按顺序；全部失败视为 SKIP 而非 FAIL，便于离线环境）：
 *   1) 已有安装目录：$NORMIFY_DSH_DEPS / tests/.dsh-deps / <repo>/../../_p0smoke/work/contract
 *   2) 在线安装：npm（CI 默认）→ 失败再试 pnpm（DSH runtime 内置或 PATH）
 *   3) 无网络/无安装器 → 打印 SKIP 并退出 0
 *
 * 版本可由 env 覆盖：NORMIFY_DSH_TOOLS_VERSION / NORMIFY_CORDIS_VERSION（CI 矩阵用 next）。
 * 运行：node tests/platform-contract.mjs       （建议先 npm run build）
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PIN = {
  tools: process.env.NORMIFY_DSH_TOOLS_VERSION ?? '0.2.1-rc.5',
  cordis: process.env.NORMIFY_CORDIS_VERSION ?? '4.0.5',
}
const EXPECTED_TOOLS = 31
/** 仅当期望值是精确版本时才要求相等；dist-tag（next/alpha）接受实际解析到的版本。 */
const SEMVER = /^\d+\.\d+\.\d+/
function versionMatches(installed, want) { return installed !== null && (!SEMVER.test(want) || installed === want) }
const SKIP_OFFLINE = [
  '离线/无安装器：跳过平台契约测试（CI 会联网执行；本地可 npm install 后重试）',
]

const results = []
function ok(name, detail) { results.push({ status: 'PASS', name, detail }) }
function fail(name, detail) { results.push({ status: 'FAIL', name, detail }) }
function assert(name, cond, detail) { cond ? ok(name, detail) : fail(name, detail) }

function firstLine(s, n = 220) {
  return String(s ?? '').split(/\r?\n/).find((l) => l.trim() !== '')?.trim().slice(0, n) ?? ''
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd, env: { ...process.env, ...(opts.env ?? {}) }, encoding: 'utf8',
    windowsHide: true, shell: opts.shell === true, timeout: opts.timeoutMs ?? 300000,
    maxBuffer: 32 * 1024 * 1024,
  })
  return { code: r.status ?? -1, out: String(r.stdout ?? ''), err: String(r.stderr ?? '') }
}

function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')) }

function installedVersion(dir, pkg) {
  try { return readJson(join(dir, 'node_modules', ...pkg.split('/'), 'package.json')).version } catch { return null }
}

function resolvePackageEntry(dir, spec) {
  const pkgJson = join(dir, 'node_modules', ...spec.split('/'), 'package.json')
  const pj = readJson(pkgJson)
  const exp = pj.exports?.['.']
  const rel = typeof exp === 'string' ? exp : exp?.import ?? exp?.default ?? exp?.node ?? (typeof pj.main === 'string' ? pj.main : 'index.js')
  return resolve(dirname(pkgJson), rel)
}

function findPnpm() {
  const candidates = []
  const home = process.env.DSH_HOME ?? (process.env.USERPROFILE ? join(process.env.USERPROFILE, '.dsh') : '')
  if (home) candidates.push(join(home, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'))
  candidates.push(join(process.env.USERPROFILE ?? '', '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'))
  for (const c of candidates) if (existsSync(c)) return c
  const which = run(process.platform === 'win32' ? 'where' : 'which', ['pnpm'])
  if (which.code === 0) return which.out.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? null
  return null
}

function hasNpm() {
  const r = run(process.platform === 'win32' ? 'where' : 'which', ['npm'])
  return r.code === 0
}

/**
 * 保证依赖可用；返回依赖根目录或 null（null = SKIP）。
 * 优先复用已有安装，避免每次重复联网。
 */
function ensureDeps() {
  const candidates = [
    process.env.NORMIFY_DSH_DEPS,
    join(repoRoot, 'tests', '.dsh-deps'),
    resolve(repoRoot, '..', '..', '_p0smoke', 'work', 'contract'),
  ].filter(Boolean)
  const mismatched = []
  for (const dir of candidates) {
    if (versionMatches(installedVersion(dir, '@deepseek-ai/dsh-tools'), PIN.tools) && versionMatches(installedVersion(dir, '@deepseek-ai/cordis'), PIN.cordis))
      return { dir, reused: true }
    const tools = installedVersion(dir, '@deepseek-ai/dsh-tools')
    if (tools !== null) mismatched.push(`${dir}（实际 dsh-tools ${tools}）`)
  }
  // 安装到 tests/.dsh-deps（避免污染仓库根 node_modules）
  const target = join(repoRoot, 'tests', '.dsh-deps')
  mkdirSync(target, { recursive: true })
  if (!existsSync(join(target, 'package.json')))
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'normify-dsh-deps', private: true, type: 'module' }, null, 2) + '\n')
  const specs = [`@deepseek-ai/dsh-tools@${PIN.tools}`, `@deepseek-ai/cordis@${PIN.cordis}`]
  let install = null
  if (hasNpm()) {
    install = run('npm', ['install', '--prefix', target, '--no-audit', '--no-fund', '--no-save', '--loglevel=error', ...specs])
  }
  if ((install === null || install.code !== 0)) {
    const pnpm = findPnpm()
    if (pnpm) {
      install = run(process.execPath, [pnpm, 'add', '--dir', target, '--ignore-scripts', '--reporter=append-only', '--store-dir', join(target, 'pnpm-store'), ...specs])
    }
  }
  if (!install || install.code !== 0) return { dir: null, why: firstLine(install?.err ?? install?.out ?? '无 npm / pnpm') }
  if (!versionMatches(installedVersion(target, '@deepseek-ai/dsh-tools'), PIN.tools) || !versionMatches(installedVersion(target, '@deepseek-ai/cordis'), PIN.cordis))
    return { dir: null, why: '安装后版本不符' }
  return { dir: target, reused: false }
}

async function main() {
  const toolsMain = join(repoRoot, 'lib', 'dsh', 'index.js')
  if (!existsSync(toolsMain)) {
    fail('build/lib 存在', `缺少构建产物 ${toolsMain}（先运行 npm run build）`)
    return
  }
  ok('build/lib 存在', 'lib/dsh/index.js')

  const deps = ensureDeps()
  if (deps.dir === null) {
    console.log('SKIP: ' + SKIP_OFFLINE[0] + '；原因：' + deps.why)
    console.log('SKIP: 平台契约测试未执行（不算失败）')
    writeSummary()
    process.exit(0)
  }
  ok('deps', `dsh-tools@${PIN.tools} + cordis@${PIN.cordis}（${deps.reused ? '复用已有安装' : '本次安装'}）`, deps.dir)

  let toolsMod, cordisMod
  try {
    toolsMod = await import(pathToFileURL(resolvePackageEntry(deps.dir, '@deepseek-ai/dsh-tools')).href)
    cordisMod = await import(pathToFileURL(resolvePackageEntry(deps.dir, '@deepseek-ai/cordis')).href)
  } catch (error) {
    fail('import dsh-tools/cordis', firstLine(error?.message))
    return
  }
  const ToolRuntime = toolsMod.default ?? toolsMod.ToolRuntime
  const { Context } = cordisMod
  const { assertObjectJsonSchema, assertSupportedJsonSchema } = toolsMod
  if (typeof ToolRuntime !== 'function' || typeof Context !== 'function') {
    fail('runtime 符号', '缺少 ToolRuntime 或 cordis Context')
    return
  }
  ok('runtime 符号', 'ToolRuntime + cordis Context')

  // 真实 cordis Context；ToolRuntime 需要 systemPrompt 服务
  let ctx, rt
  try {
    ctx = new Context()
    ctx.provide('systemPrompt')
    ctx.set('systemPrompt', { tools: () => () => {}, section: () => () => {}, getSectionOrder: () => 0 })
    rt = new ToolRuntime(ctx, {})
    ctx.provide('skills')
  } catch (error) {
    fail('构造 ToolRuntime', firstLine(error?.message))
    return
  }
  ok('构造 ToolRuntime', `inject=${JSON.stringify(ToolRuntime.inject ?? [])}`)

  // 加载插件（与真实 DSH 相同：apply(ctx, config)）
  const registered = []
  const originalRegister = rt.register.bind(rt)
  rt.register = (def) => { registered.push(def); return originalRegister(def) }
  const skills = []
  ctx.set('skills', { register: (spec) => { skills.push(spec); return () => {} } })

  let plug
  try { plug = await import(pathToFileURL(toolsMain).href) } catch (error) {
    fail('import 插件', firstLine(error?.message))
    return
  }
  for (const field of ['name', 'inject', 'Config', 'apply'])
    assert('插件导出 ' + field, plug[field] !== undefined, field === 'Config' || field === 'apply' ? typeof plug[field] : JSON.stringify(plug[field]))

  try {
    plug.apply(ctx, { rootDir: '.', requireBilingual: true, devCompanionReminder: false, devCompanionReminderAfter: 8, approveDestructive: false })
    ok('apply()', '真实 0.2.1 Context 下无异常')
  } catch (error) {
    fail('apply()', String(error?.stack ?? error).split('\n').slice(0, 5).join(' | '))
    return
  }

  // ---- 注册面 ----
  assert('工具数量 = ' + EXPECTED_TOOLS, registered.length === EXPECTED_TOOLS, `实际 ${registered.length}`)
  const names = registered.map((d) => d?.name)
  assert('工具名唯一', new Set(names).size === names.length)
  assert('工具名 normify_ 前缀', names.every((n) => String(n).startsWith('normify_')), names.filter((n) => !String(n).startsWith('normify_')).join(', '))
  assert('真实 runtime 可见', names.every((n) => rt.get(n) !== undefined), names.filter((n) => !rt.get(n)).join(', '))

  // ---- schema 契约（ADR-0010 核心断言）----
  const paramFails = []
  const outputFails = []
  const emptyOutput = []
  const fnFails = []
  for (const def of registered) {
    const label = def?.name ?? '<unnamed>'
    try { assertObjectJsonSchema(def.parameters) } catch (e) { paramFails.push(label + ': ' + firstLine(e?.message, 120)) }
    try { assertSupportedJsonSchema(def.output?.schema) } catch (e) { outputFails.push(label + ': ' + firstLine(e?.message, 120)) }
    const schema = def?.output?.schema
    if (schema === undefined || schema === null || JSON.stringify(schema) === '{}') emptyOutput.push(label)
    if (typeof def?.output?.render !== 'function' || typeof def?.execute !== 'function') fnFails.push(label)
  }
  assert('parameters 过 assertObjectJsonSchema', paramFails.length === 0, paramFails.join(' | '))
  assert('output.schema 过 assertSupportedJsonSchema', outputFails.length === 0, outputFails.join(' | '))
  assert('output.schema 非空（真实渲染 schema）', emptyOutput.length === 0, emptyOutput.join(', '))
  assert('output.render / execute 为函数', fnFails.length === 0, fnFails.join(', '))

  // ---- presenter 可调用（0.2.1 新增能力）----
  const presentFails = []
  for (const def of registered) {
    const label = def?.name ?? '<unnamed>'
    try {
      if (typeof def.presentCall !== 'function') { presentFails.push(label + ': 缺 presentCall'); continue }
      if (typeof def.presentResult !== 'function') { presentFails.push(label + ': 缺 presentResult'); continue }
      const call = def.presentCall({})
      if (call === null || typeof call !== 'object' || typeof call.card !== 'string') presentFails.push(label + ': presentCall 返回异常')
      const result = def.presentResult({}, { content: [], isError: false, meta: { ok: true, summary: '完成' } })
      if (result === null || typeof result !== 'object' || typeof result.card !== 'string') presentFails.push(label + ': presentResult 返回异常')
    } catch (e) { presentFails.push(label + ': ' + firstLine(e?.message, 120)) }
  }
  assert('presentCall / presentResult 可调用', presentFails.length === 0, presentFails.slice(0, 6).join(' | '))

  // ---- isConcurrencySafe 仅 read 工具 ----
  let behaviors = new Map()
  try {
    const core = await import(pathToFileURL(join(repoRoot, 'lib', 'core', 'index.js')).href)
    const toolset = await import(pathToFileURL(join(repoRoot, 'lib', 'core', 'toolset.js')).href)
    const specs = toolset.createNormifyTools({ rootDir: '.', requireBilingual: true })
    behaviors = new Map(specs.map((s) => [s.name, s.behavior]))
    ok('core toolset 可用', `${specs.length} 个 spec（read ${specs.filter((s) => s.behavior === 'read').length} 个）`)
    void core
  } catch (e) {
    fail('core toolset 可用', firstLine(e?.message))
  }
  const concBad = []
  for (const def of registered) {
    const behavior = behaviors.get(def?.name)
    const has = typeof def?.isConcurrencySafe === 'function'
    if (behavior === 'read' && !has) concBad.push(`${def.name}: read 但缺 isConcurrencySafe`)
    if (behavior !== 'read' && has) concBad.push(`${def.name}: ${behavior ?? '未知'} 却声明 isConcurrencySafe`)
    if (has) { try { if (typeof def.isConcurrencySafe({}) !== 'boolean') concBad.push(`${def.name}: 返回非布尔`) } catch { concBad.push(`${def.name}: 调用抛错`) } }
  }
  assert('isConcurrencySafe 仅 read 工具且可调用', concBad.length === 0, concBad.join(' | '))

  // ---- skill 注册 ----
  assert('skill 注册 1 个', skills.length === 1, `实际 ${skills.length}`)
  if (skills.length === 1) {
    const s = skills[0]
    const check = []
    if (s.name !== 'normify-gen') check.push('name=' + s.name)
    if (typeof s.description !== 'string' || s.description.trim() === '') check.push('description 空')
    if (typeof s.content !== 'string' || s.content.length < 500) check.push('content 过短')
    if (s.resourceBase?.kind !== 'directory') check.push('resourceBase.kind')
    if (!s.resourceBase?.path || !existsSync(s.resourceBase.path)) check.push('resourceBase.path 不存在')
    if (s.invocation?.modelInvocable !== true) check.push('invocation.modelInvocable')
    assert('skill normify-gen 形状合法', check.length === 0, check.join('; '))
  }
}

function writeSummary() {
  const failed = results.filter((r) => r.status === 'FAIL')
  console.log('')
  for (const r of results) console.log(`[${r.status}] ${r.name}${r.detail ? '  — ' + r.detail : ''}`)
  console.log(`\n=== platform-contract: ${results.filter((r) => r.status === 'PASS').length}/${results.length} PASS${failed.length ? `，${failed.length} FAIL` : '（全部通过）'} ===`)
}

await main()
writeSummary()
process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0)
