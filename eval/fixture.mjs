/**
 * eval/fixture.mjs — 物化确定性评测 fixture（仓库源码骨架 + normify 结构数据 + git + 构建产物）
 *
 * 产物目录（默认 <tmp>/normify-eval-fixture/<SPEC_VERSION>/）：
 *   repo/            源码仓库（git 仓库，已提交 1 次；drift 文件在提交后被修改）
 *   structure/normify-eval-demo/   结构数据（modules/、policy.yml、tree.json、structure-manifest.json 等）
 *
 * 可复现性：模块 uid/chunk 内容全部由 eval/spec.mjs 的确定性 hash 派生；git 提交时间固定；
 * 唯一非确定项是 build 写入的 compiled_at（构建时刻），它不参与结构语义。
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSpec, SPEC_VERSION } from './spec.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const CLI_PATH = join(repoRoot, 'lib', 'cli', 'index.js')
const MARKER = '.fixture.json'

export function defaultFixtureDir(version = SPEC_VERSION) {
  return join(tmpdir(), 'normify-eval-fixture', version)
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd, env: { ...process.env, ...(opts.env ?? {}) }, encoding: 'utf8',
    windowsHide: true, timeout: opts.timeoutMs ?? 120000, maxBuffer: 64 * 1024 * 1024,
  })
  return { code: r.status ?? -1, out: String(r.stdout ?? ''), err: String(r.stderr ?? '') }
}

function writeTree(dir, files) {
  for (const [rel, content] of files) {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
}

/**
 * @param {{dir?:string, fresh?:boolean, quiet?:boolean}} opts
 * @returns {{root:string, repoDir:string, structDir:string, treePath:string, spec:object, gitHead:string, reused:boolean}}
 */
export async function ensureFixture(opts = {}) {
  const dir = resolve(opts.dir ?? defaultFixtureDir())
  const markerPath = join(dir, MARKER)
  if (!opts.fresh && existsSync(markerPath)) {
    try {
      const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
      if (marker.specVersion === SPEC_VERSION && existsSync(join(dir, 'structure', 'normify-eval-demo', 'tree.json'))) {
        if (!opts.quiet) console.log('fixture: 复用 ' + dir)
        return { root: dir, ...marker.paths, spec: null, gitHead: marker.gitHead, driftRepos: marker.driftRepos ?? {}, reused: true }
      }
    } catch { /* 损坏 → 重建 */ }
  }
  if (!opts.quiet) console.log('fixture: 生成 ' + dir)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  const spec = buildSpec()
  const repoDir = join(dir, 'repo')
  writeTree(repoDir, spec.files)

  // git：固定作者/时间，保证 commit 可复现
  const gitEnv = {
    GIT_AUTHOR_NAME: 'normify-eval', GIT_AUTHOR_EMAIL: 'eval@example.invalid', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
    GIT_COMMITTER_NAME: 'normify-eval', GIT_COMMITTER_EMAIL: 'eval@example.invalid', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
  }
  const g = (...a) => {
    const r = run('git', ['-C', repoDir, ...a], { env: gitEnv })
    if (r.code !== 0) throw new Error('git ' + a.join(' ') + ' 失败：' + (r.err || r.out))
    return r.out.trim()
  }
  g('init', '-q')
  g('config', 'user.email', 'eval@example.invalid')
  g('config', 'user.name', 'normify-eval')
  g('add', '-A')
  g('commit', '-qm', 'fixture: deterministic skeleton')
  const gitHead = g('rev-parse', 'HEAD')

  // drift 任务：每个"被改动文件"独立一个仓库副本（只含这一处 working-tree 修改），
  // 这样 `normify sync --repo-root <repo>` 的 affected 恰好等于该文件所属模块（任务语义无歧义）。
  const driftRepos = {}
  const driftRoot = join(dir, 'repo-drift')
  mkdirSync(driftRoot, { recursive: true })
  for (const [i, rel] of spec.driftFiles.entries()) {
    const target = join(driftRoot, 'r' + i)
    cpSync(repoDir, target, {
      recursive: true,
      filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src),
    })
    const gd = (...a) => {
      const r = run('git', ['-C', target, ...a], { env: gitEnv })
      if (r.code !== 0) throw new Error('git(drift) ' + a.join(' ') + ' 失败：' + (r.err || r.out))
      return r.out.trim()
    }
    gd('init', '-q')
    gd('config', 'user.email', 'eval@example.invalid')
    gd('config', 'user.name', 'normify-eval')
    gd('add', '-A')
    gd('commit', '-qm', 'fixture: drift baseline ' + i)
    const abs = join(target, rel)
    if (existsSync(abs)) writeFileSync(abs, readFileSync(abs, 'utf8') + '// drift: modified after commit\n')
    driftRepos[rel] = target
  }

  // 结构数据：用 core 引擎写入（固定 uid/时间），再走真实 CLI build
  const structureRoot = join(dir, 'structure')
  mkdirSync(structureRoot, { recursive: true })
  const core = await import(pathToFileURLCore())
  const ref = await core.resolveProject(structureRoot, { project: 'eval-demo' }, { create: true })
  const structDir = ref.dir
  const index = core.createProjectIndex({ files: [], errors: [], warnings: [] })
  for (const m of spec.modules) {
    await core.writeModuleFile(structDir, m, '', index)
  }
  const build = run(process.execPath, [CLI_PATH, 'build', '--dir', structDir], { cwd: repoRoot })
  if (build.code !== 0) {
    throw new Error('CLI build 失败（exit ' + build.code + '）：' + (build.err || build.out).slice(0, 800))
  }
  for (const f of ['tree.json', 'structure-manifest.json']) {
    if (!existsSync(join(structDir, f))) throw new Error('build 未产出 ' + f)
  }
  const treePath = join(structDir, 'tree.json')
  const marker = {
    specVersion: SPEC_VERSION,
    counts: spec.counts,
    gitHead,
    builtAt: new Date().toISOString(),
    paths: { repoDir, structDir, treePath },
    driftRepos,
  }
  writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n')
  return { root: dir, repoDir, structDir, treePath, spec, gitHead, driftRepos, reused: false }
}

function pathToFileURLCore() {
  // lib/core/index.js（构建产物）；用 file URL 动态 import，兼容 Windows 路径
  return new URL('../lib/core/index.js', import.meta.url).href
}
