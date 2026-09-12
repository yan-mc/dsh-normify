// companion e2e：伴随开发闭环（计划态建树 → 规则强制 → 编辑算子 → 激活 → 变更关闭）。
// 覆盖 8 个环节；直接调用 lib/engine/*，使用真实 git 仓库提供 source 证据。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import { resolveProject, loadAllModules, fingerprintOf } from '../lib/engine/store.js'
import { batchWrite, patchModule, moveModuleTree, refreshModules, checkProposal } from '../lib/engine/edit.js'
import { loadPolicyFile, writePolicyFile, l1ValidatePolicy } from '../lib/engine/policy.js'
import { loadChangeFile, writeChangeFile } from '../lib/engine/changes.js'
import { closeChange } from '../lib/engine/companion.js'
import { writeLayoutFile } from '../lib/engine/layout.js'
import { validateProject } from '../lib/engine/validate.js'

const work = mkdtempSync(join(tmpdir(), 'normify-companion-e2e-'))
const repo = join(work, 'demo-repo')
const root = join(work, 'home')
mkdirSync(join(repo, 'src'), { recursive: true })
mkdirSync(root, { recursive: true })
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()

function assert(cond, msg) { if (!cond) { console.error('断言失败: ' + msg); process.exit(1) } }
const step = (n) => console.log('\n=== ' + n + ' ===')
const now = () => new Date().toISOString()
const hex = (s) => createHash('sha256').update(s).digest('hex')
const uid = (s) => hex('uid:' + s).slice(0, 8)
const rev = () => git('rev-parse', 'HEAD')

let projectDir
async function mod(id, parent, zh, en, desc, extra = {}) {
  const source = extra.source ?? [{ path: 'src/' + (id.split('.').slice(1).join('_') || 'main') + '.ts' }]
  const fp = await fingerprintOf(repo, source)
  return {
    frontmatter: {
      uid: uid(id), id, parent,
      name: { zh, en }, description: { zh: desc, en: desc },
      source, revision: rev(), updated_at: now(),
      fingerprint: fp.hash ?? 'pending',
      ...extra.frontmatter,
    },
  }
}

async function main() {
  // 仓库先有初始提交，refresh 才能取到 revision
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(repo, 'src', 'b.ts'), 'export const b = 2\n')
  writeFileSync(join(repo, 'src', 'consumer.ts'), 'export const c = 3\n')
  git('init', '-q'); git('config', 'user.email', 'e2e@example.com'); git('config', 'user.name', 'e2e'); git('add', '-A'); git('commit', '-qm', 'init')

  step('1. 项目创建自动安装架构规则')
  const proj = await resolveProject(root, { project: 'demo-repo' }, { create: true })
  projectDir = proj.dir
  assert(existsSync(join(projectDir, 'policy.yml')), '创建项目应自动安装 policy.yml')
  const pol = await loadPolicyFile(projectDir)
  assert(pol.policy !== null && pol.policy.rules.length >= 2, 'policy.yml 应可读且含基础规则')
  console.log('policy.yml 已安装，规则数: ' + pol.policy.rules.length)

  step('2. 计划态先建树（批量原子）')
  const batch = [
    await mod('demo-repo', null, '演示仓库', 'Demo Repo', '演示', { source: [{ path: 'src/a.ts' }] }),
    await mod('demo-repo.core', 'demo-repo', '核心', 'Core', '核心域', { source: [{ path: 'src/a.ts' }], frontmatter: { state: 'planned', fingerprint: 'pending' } }),
    await mod('demo-repo.core.consumer', 'demo-repo.core', '消费者', 'Consumer', '消费核心数据', { source: [{ path: 'src/consumer.ts' }], frontmatter: { state: 'planned', fingerprint: 'pending', apis: [{ protocol: 'rpc', path: 'consume', description: { zh: '消费', en: 'Consume' } }] } }),
  ]
  const r2 = await batchWrite(projectDir, batch, 'upsert', {})
  assert(r2.ok, '批量写入应成功: ' + JSON.stringify(r2.errors?.slice(0, 2)))
  console.log('批量写入 ' + r2.files.length + ' 个模块（含 planned）')
  const badBatch = [...batch, { frontmatter: { ...(await mod('demo-repo.bad', 'demo-repo.wrong-parent', '错父', 'Bad', 'x')).frontmatter } }]
  const r2b = await batchWrite(projectDir, badBatch, 'upsert', {})
  assert(!r2b.ok, '含非法条目的批次应整批失败')
  const after = await loadAllModules(projectDir)
  assert(after.files.length === 3, '失败的批次不应留下部分写入')
  console.log('原子性验证通过（非法批次回滚，模块数仍为 3）')

  step('3. 架构规则强制 + 预检')
  const rules = [
    { id: 'no-core-to-consumer', type: 'forbid-dependency', severity: 'error', from: ['demo-repo.core'], to: ['demo-repo.core.consumer'] },
    { id: 'depth', type: 'max-depth', severity: 'error', maxDepth: 6, scope: ['demo-repo.**'] },
  ]
  const polv = l1ValidatePolicy({ schema_version: 1, updated_at: now(), rules })
  assert(polv.policy !== null, '规则集应通过 L1: ' + JSON.stringify(polv.errors?.map(e => e.code)))
  await writePolicyFile(projectDir, polv.policy)
  const proposal = await checkProposal(projectDir, { modules: [], deps: [{ from: 'demo-repo.core', to: 'demo-repo.core.consumer', kind: 'call' }] })
  const blocked = (proposal.errors ?? []).some(e => String(e.code ?? '').includes('no-core-to-consumer'))
  assert(blocked, '预检应拦截违规依赖')
  console.log('预检拦截违规依赖 OK（规则 no-core-to-consumer）')

  step('4. patch / 冲突 / dry-run')
  const fm = (await loadAllModules(projectDir)).files.find(f => f.module.id === 'demo-repo.core').module
  const okPatch = await patchModule(projectDir, 'demo-repo.core', { name: { zh: '核心域', en: 'Core Domain' } }, {})
  assert(okPatch.ok !== false, 'patch 应成功')
  const conflict = await patchModule(projectDir, 'demo-repo.core', { name: { zh: 'x', en: 'x' }, expect_updated_at: '2000-01-01T00:00:00Z' }, {})
  assert(conflict.ok === false, 'expect_updated_at 不匹配应拒绝')
  const coreRel = (await loadAllModules(projectDir)).files.find(f => f.module.id === 'demo-repo.core').file
  const before = readFileSync(join(projectDir, 'modules', coreRel), 'utf8')
  const dry = await patchModule(projectDir, 'demo-repo.core', { tags: ['dry'] }, { dryRun: true })
  const afterDry = readFileSync(join(projectDir, 'modules', coreRel), 'utf8')
  assert(before === afterDry, 'dry_run 不应写盘')
  console.log('patch OK / 冲突被拒 / dry_run 零写入（v' + fm.fingerprint.slice(0, 6) + '）')

  step('5. move：重命名/换父级 + 级联 rewiring + 渲染数据随迁')
  await writeLayoutFile(projectDir, { schema_version: 1, id: 'demo-repo.core', updated_at: now(), order: ['demo-repo.core.consumer'] })
  const mv = await moveModuleTree(projectDir, 'demo-repo.core', { newId: 'demo-repo.platform', dryRun: false })
  assert(mv.ok !== false, 'move 应成功: ' + JSON.stringify(mv.errors?.slice(0, 2)))
  const moved = await loadAllModules(projectDir)
  const ids = moved.files.map(f => f.module.id).sort()
  assert(ids.includes('demo-repo.platform') && ids.includes('demo-repo.platform.consumer'), 'move 后 id 应级联: ' + ids.join(','))
  assert(existsSync(join(projectDir, 'renders', 'demo-repo', 'platform.json')), '渲染数据应随 move 迁移')
  assert(!existsSync(join(projectDir, 'renders', 'demo-repo', 'core.json')), '旧渲染数据应被移除')
  // 0.5.2 修复：move 迁移渲染数据时必须把 id / order / groups / edge_hints 一并改写到新 id，
  // 否则随后 validate 会报 layout/id-mismatch + layout/order-child（旧世界残留）。
  const migrated = JSON.parse(readFileSync(join(projectDir, 'renders', 'demo-repo', 'platform.json'), 'utf8'))
  assert(migrated.id === 'demo-repo.platform', 'move 后渲染数据 id 应重写为新 id（实际=' + migrated.id + '）')
  assert(JSON.stringify(migrated.order) === JSON.stringify(['demo-repo.platform.consumer']), 'move 后渲染数据 order 应重写为新 id（实际=' + JSON.stringify(migrated.order) + '）')
  const postMove = await validateProject(projectDir, {})
  assert((postMove.errors ?? []).length === 0, 'move 后 L2 应 0 error（实际=' + JSON.stringify((postMove.errors ?? []).slice(0, 3)) + '）')
  console.log('move OK：id 级联 + 渲染数据随迁并重写内容（0.5.2 修复），move 后 L2 = 0 error')

  step('6. refresh：planned → active')
  const rf = await refreshModules(projectDir, { ids: ['demo-repo.platform.consumer'], activate: true, repoRoot: repo })
  assert(rf.ok !== false, 'refresh 应成功: ' + JSON.stringify(rf.errors?.slice(0, 2)))
  const refreshed = (await loadAllModules(projectDir)).files.find(f => f.module.id === 'demo-repo.platform.consumer').module
  assert((refreshed.state ?? 'active') === 'active', 'planned 应转为 active')
  assert(/^[a-f0-9]{64}$/.test(refreshed.fingerprint), 'fingerprint 应为 64 位 hex')
  console.log('refresh OK：state=' + (refreshed.state ?? 'active') + '，fingerprint=' + refreshed.fingerprint.slice(0, 8) + '…')

  step('7. 变更闭环：close 0 error 强制')
  const change = {
    schema_version: 1, id: '2026-09-12-e2e-close', title: { zh: '演示变更', en: 'Demo change' }, status: 'in_progress',
    intent: { zh: '验证闭环', en: 'Verify closure' }, modules: { create: [], modify: ['demo-repo.platform.consumer'], delete: [] },
    acceptance: ['validate 0 error'], revision: { before: rev(), after: null },
    created_at: now(), updated_at: now(),
  }
  await writeChangeFile(projectDir, change)
  const closed = await closeChange(projectDir, '2026-09-12-e2e-close', { repoRoot: repo, activate: true })
  assert(closed.ok !== false, 'close 应成功: ' + JSON.stringify((closed.errors ?? []).slice(0, 2)))
  const cf = await loadChangeFile(projectDir, '2026-09-12-e2e-close')
  assert(cf.change !== null && cf.change.status === 'verified', 'close 后状态应为 verified')
  assert(cf.change.revision.after !== null, 'close 应写入 revision.after')
  console.log('close OK：status=verified，revision.after=' + String(cf.change.revision.after).slice(0, 8) + '…')

  step('8. close 阻断：planned 叶子未落地')
  const stuck = {
    schema_version: 1, id: '2026-09-12-e2e-stuck', title: { zh: '未落地', en: 'Not landed' }, status: 'in_progress',
    intent: { zh: '验证阻断', en: 'Verify block' }, modules: { create: ['demo-repo.pending'], modify: [], delete: [] },
    acceptance: ['pending 模块落地后才允许关闭'], revision: { before: rev(), after: null }, created_at: now(), updated_at: now(),
  }
  const wr = await writeChangeFile(projectDir, stuck)
  if (wr && wr.errors && wr.errors.length) console.log('  change 写入诊断: ' + JSON.stringify(wr.errors.map(e => e.code)))
  await batchWrite(projectDir, [await mod('demo-repo.pending', 'demo-repo', '未落地', 'Pending', '尚未实现',
    { source: [{ path: 'src/pending.ts' }], frontmatter: { state: 'planned', fingerprint: 'pending' } })], 'upsert', {})
  const blockedClose = await closeChange(projectDir, '2026-09-12-e2e-stuck', { repoRoot: repo, activate: true })
  assert(blockedClose.ok === false, 'create 清单未落地时 close 应被阻断')
  const still = await loadChangeFile(projectDir, '2026-09-12-e2e-stuck')
  console.log('  变更读取: ' + (still.change === null ? ('null err=' + JSON.stringify(still.error)) : still.change.status))
  assert(still.change.status === 'in_progress', '被阻断的变更应保持原状态')
  console.log('close 阻断 OK：' + (blockedClose.summary ?? blockedClose.errors?.[0]?.code ?? ''))

  console.log('\n=== companion e2e PASS ===')
}

try {
  await main()
} finally {
  rmSync(work, { recursive: true, force: true })
}
