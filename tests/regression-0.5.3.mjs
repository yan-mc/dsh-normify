// 0.5.3 回归测试：锁定伴随编程 A/B 实验暴露的 4 个易用性/引导性缺陷
//   ① normify_help 支持 topic（此前完全忽略入参）
//   ② 项目初始化入口（change_open 自动建项目 + normify_project_init + brief 缺失模块的可执行提示）
//   ③ 批量写入诊断的因果链（dep/target-dropped / structure/parent-dropped + detail.dropped_by_l1）
//   ④ "API 直连"引导（两端都有 API 却未锚定 → 聚合 warning dep/unanchored）
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const PLUGIN = new URL('../lib/index.js', import.meta.url).href // 跨平台：直接用 URL 解析；不要手工去掉前导斜杠再拼 file URL（POSIX 下会变成相对路径）
const plug = await import(PLUGIN)
const tools = new Map()
plug.apply({ tools: { register: (d) => tools.set(d.name, d) }, skills: { register: () => () => {} },
  logger: { info: () => {}, warn: () => {} }, effect: () => {}, on: () => {} },
  { rootDir: '.', requireBilingual: true, devCompanionReminder: false, devCompanionReminderAfter: 8 })
const call = (n, a) => tools.get(n).execute(a ?? {})
const hex = (s) => createHash('sha256').update(s).digest('hex')
const A = (path, zh, en) => ({ protocol: 'rpc', path, description: { zh, en } })
const L = (zh, en) => ({ zh, en })
const NOW = '2026-09-13T10:00:00Z'
const fm = (id, parent, apis) => ({
  uid: hex('uid:' + id).slice(0, 8), id, parent,
  name: L(id, id), description: L('回归 ' + id, 'regression ' + id),
  source: [{ path: 'src/' + id.split('.').join('/') + '.ts', line: 1 }],
  revision: '0'.repeat(40), updated_at: NOW, fingerprint: hex(id),
  ...(apis ? { apis } : {}),
})
const fails = []
const ok = (name, cond, extra = '') => { if (!cond) fails.push(name); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + String(extra).slice(0, 160) + ']' : ''}`) }

const work = mkdtempSync(join(tmpdir(), 'normify-reg053-'))
const DIR = join(work, 'normify-demo').replace(/\\/g, '/')

console.log('== ① normify_help 支持 topic ==')
const h0 = await call('normify_help', {})
ok('①a 默认返回 fields', h0.ok === true && h0.topic === 'fields' && /模块字段/.test(h0.reference), JSON.stringify(h0.title))
const hFlow = await call('normify_help', { topic: 'flow' })
ok('①b topic=flow 返回伴随流程', hFlow.ok === true && /normify_project_init/.test(hFlow.reference) && /change_close/.test(hFlow.reference))
const hTools = await call('normify_help', { topic: 'tools' })
ok('①c topic=tools 列出全部工具', hTools.ok === true && hTools.reference.split('\n').length === tools.size, 'catalog=' + hTools.reference.split('\n').length + ' registered=' + tools.size)
const hDeps = await call('normify_help', { topic: 'deps' })
ok('①d topic=deps 讲 API 直连', hDeps.ok === true && /from_api/.test(hDeps.reference) && /to_api/.test(hDeps.reference))
const hBad = await call('normify_help', { topic: 'nope' })
ok('①e 未知主题报错并列出可用主题', hBad.ok === false && hBad.error?.code === 'args/invalid-topic' && /fields/.test(hBad.error.message), JSON.stringify(hBad.error).slice(0, 120))
ok('①f topic=all 覆盖各段', (await call('normify_help', { topic: 'all' })).reference.includes('=== policy ==='))

console.log('\n== ② 项目初始化通道 ==')
const init = await call('normify_project_init', { dir: DIR, root: { id: 'demo', name: L('演示', 'Demo'), description: L('回归项目根模块', 'Regression root') } })
ok('②a project_init 建目录 + 根模块', init.ok === true && existsSync(join(work, 'normify-demo', 'modules', 'demo', 'index.md')) || existsSync(join(work, 'normify-demo', 'modules', 'demo.md')), JSON.stringify(init).slice(0, 140))
ok('②b 自动安装默认架构规则', init.ok === true && init.policy_rules > 0, 'rules=' + init.policy_rules)
ok('②c 幂等：重复调用不报错', (await call('normify_project_init', { dir: DIR, root: { id: 'demo' } })).ok === true)
const br = await call('normify_brief', { dir: DIR, id: 'demo' })
ok('②d 初始化后 brief(id) 可用（此前 module/not-found）', br.ok !== false && !br.error, JSON.stringify(br.error ?? br.target ?? '').slice(0, 100))
const brMiss = await call('normify_brief', { dir: DIR, id: 'demo.nope' })
ok('②e brief 缺失模块给出可执行 hint', brMiss.ok === false && brMiss.error?.code === 'module/not-found' && /normify_project_init/.test(String(brMiss.hint)), String(brMiss.hint).slice(0, 90))
const NEWDIR = join(work, 'normify-fresh').replace(/\\/g, '/')
const co = await call('normify_change_open', { dir: NEWDIR, title: L('首变更', 'First change'), intent: L('验证 change_open 自动建项目', 'verify auto-create'), modules: {}, acceptance: ['目录被自动创建'] })
ok('②f change_open 自动建项目（此前 project/no-modules）', co.ok === true && existsSync(join(work, 'normify-fresh', 'modules')), JSON.stringify(co.error ?? co.id ?? '').slice(0, 100))

console.log('\n== ③ 批量诊断的因果链 ==')
const DIR2 = join(work, 'normify-batch').replace(/\\/g, '/')
const longLabel = 'x'.repeat(33)
const batch = await call('normify_module_batch', { dir: DIR2, mode: 'upsert', items: [
  { frontmatter: { ...fm('b', null) } },
  { frontmatter: { ...fm('b.core', 'b'), deps: [{ kind: 'call', to: 'b.api', label: L('依赖', longLabel) }] } },
  { frontmatter: { ...fm('b.api', 'b', [A('go', '跑', 'run')]), deps: [{ kind: 'call', to: 'b.core' }] } },
  { frontmatter: { ...fm('b.core.child', 'b.core') } },
] })
ok('③a 整批原子失败（根因仍在）', batch.ok === false && (batch.errors ?? []).some(e => /label-too-long/.test(String(e))), 'errors=' + (batch.errors ?? []).length)
ok('③b 悬空箭头改报 dep/target-dropped 并指向根因', (batch.errors ?? []).some(e => /dep\/target-dropped/.test(String(e)) && /label-too-long/.test(String(e))), JSON.stringify((batch.errors ?? []).filter(e => /target-dropped/.test(String(e)))).slice(0, 150))
ok('③c 子模块父级失败报 structure/parent-dropped', (batch.errors ?? []).some(e => /structure\/parent-dropped/.test(String(e))))
ok('③d root_causes 直接列出被丢弃模块 + hint', Array.isArray(batch.root_causes) && batch.root_causes.some(d => d.module === 'b.core' && /label-too-long/.test(String(d.code))) && /原子写入/.test(String(batch.hint)), JSON.stringify(batch.root_causes ?? null).slice(0, 150))
const fixed = await call('normify_module_batch', { dir: DIR2, mode: 'upsert', items: [
  { frontmatter: { ...fm('b', null) } },
  { frontmatter: { ...fm('b.core', 'b'), name: L('核心', 'Core') } },
  { frontmatter: { ...fm('b.api', 'b', [A('go', '跑', 'run')]), deps: [{ kind: 'call', to: 'b.core' }] } },
] })
ok('③e 修掉根因后整批通过（无 target-dropped）', fixed.ok === true, JSON.stringify(fixed.errors ?? '').slice(0, 100))

console.log('\n== ④ API 直连引导 ==')
const DIR3 = join(work, 'normify-anchor').replace(/\\/g, '/')
await call('normify_module_batch', { dir: DIR3, mode: 'upsert', items: [
  { frontmatter: { ...fm('a', null) } },
  { frontmatter: { ...fm('a.x', 'a', [A('x/run', '跑 x', 'run x')]), deps: [{ kind: 'call', to: 'a.y' }] } },
  { frontmatter: { ...fm('a.y', 'a', [A('y/go', '跑 y', 'run y')]) } },
] })
const v1 = await call('normify_validate', { dir: DIR3 })
ok('④a 未锚定 → 聚合 warning dep/unanchored', v1.ok === true && (v1.warnings ?? []).some(w => /dep\/unanchored/.test(String(w))), JSON.stringify((v1.warnings ?? []).slice(0, 2)).slice(0, 160))
ok('④b warning 文案里带条数与示例', (v1.warnings ?? []).some(w => /1 条箭头可锚定/.test(String(w)) && /a\.x → a\.y/.test(String(w))), JSON.stringify((v1.warnings ?? [])[0] ?? '').slice(0, 150))
await call('normify_module_upsert', { dir: DIR3, frontmatter: { ...fm('a.x', 'a', [A('x/run', '跑 x', 'run x')]), deps: [{ kind: 'call', to: 'a.y', from_api: 'rpc:x/run', to_api: 'rpc:y/go' }] } })
const v2 = await call('normify_validate', { dir: DIR3 })
ok('④c 锚定后 warning 消失', v2.ok === true && !(v2.warnings ?? []).some(w => /dep\/unanchored/.test(String(w))), JSON.stringify((v2.warnings ?? []).slice(0, 2)).slice(0, 140))
await call('normify_module_upsert', { dir: DIR3, frontmatter: { ...fm('a.x', 'a', [A('x/run', '跑 x', 'run x')]), deps: [{ kind: 'call', to: 'a.y', from_api: 'rpc:not-here', to_api: 'rpc:y/go' }] } })
const v3 = await call('normify_validate', { dir: DIR3 })
ok('④d 锚错键仍是 error（引导≠放宽）', v3.ok === false && (v3.errors ?? []).some(e => /from-api-invalid/.test(String(e))), JSON.stringify((v3.errors ?? []).slice(0, 1)).slice(0, 120))

console.log('\n=== 结果：' + (fails.length === 0 ? '全部 PASS' : 'FAIL ' + fails.length + ' 项 → ' + fails.join(' | ')) + ' ===')
rmSync(work, { recursive: true, force: true })
process.exit(fails.length === 0 ? 0 : 1)
