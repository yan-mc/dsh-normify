// 0.5.4 回归测试：锁定第二轮 A/B 实测暴露的 4 个工具缺陷
//   ① mode=patch 内层 patch 缺失/为空 → 静默 no-op（返回 ok 但零改动）
//   ② 单模块 patch 空补丁 → 同样静默 no-op
//   ③ normify_module_refresh 强依赖 git（非 git 仓库直接失败）
//   ④ normify_help 只有工具清单、没有参数树；change_open 的 acceptance 报错笼统
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const PLUGIN = new URL('../lib/index.js', import.meta.url).href
const plug = await import(PLUGIN)
const tools = new Map()
plug.apply({ tools: { register: (d) => tools.set(d.name, d) }, skills: { register: () => () => {} },
  logger: { info: () => {}, warn: () => {} }, effect: () => {}, on: () => {} },
  { rootDir: '.', requireBilingual: true, devCompanionReminder: false, devCompanionReminderAfter: 8 })
const raw = (n, a) => tools.get(n).execute(a ?? {})
const call = async (n, a) => { try { return await raw(n, a) } catch (e) { return { ok: false, error: { code: 'thrown', message: String(e?.message ?? e) } } } }
const hex = (s) => createHash('sha256').update(s).digest('hex')
const L = (zh, en) => ({ zh, en })
const NOW = '2026-09-13T12:00:00Z'
const txt = (...lines) => lines.join(String.fromCharCode(10)) + String.fromCharCode(10)
const readModule = (dir, rel) => readFileSync(join(dir, rel), 'utf8')

const fails = []
const ok = (name, cond, extra = '') => { if (!cond) fails.push(name); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + String(extra).slice(0, 150) + ']' : ''}`) }

const work = mkdtempSync(join(tmpdir(), 'normify-reg054-'))
const CODE = join(work, 'repo').replace(/\\/g, '/')
mkdirSync(join(work, 'repo', 'src'), { recursive: true })
writeFileSync(join(work, 'repo', 'src/a.js'), txt('export const a = 1'), 'utf8')
writeFileSync(join(work, 'repo', 'src/b.js'), txt('export const b = 2'), 'utf8')
const DIR = join(work, 'normify-demo').replace(/\\/g, '/')

const fm = (id, parent, source, apis) => ({
  uid: hex('uid:' + id).slice(0, 8), id, parent,
  name: L(id, id), description: L('回归 ' + id, 'regression ' + id),
  source: source.map(p => ({ path: p, line: 1 })),
  revision: '0'.repeat(40), updated_at: NOW, fingerprint: 'pending', state: 'planned',
  ...(apis ? { apis } : {}),
})
// 建一个 planned 项目：根 + 两个叶子（b 依赖 a）
const built = await call('normify_module_batch', { dir: DIR, mode: 'upsert', items: [
  { frontmatter: fm('demo', null, ['src/a.js', 'src/b.js']) },
  { frontmatter: fm('demo.a', 'demo', ['src/a.js'], [{ protocol: 'rpc', path: 'a/run', description: L('跑 a', 'run a') }]) },
  { frontmatter: fm('demo.b', 'demo', ['src/b.js'], [{ protocol: 'rpc', path: 'b/run', description: L('跑 b', 'run b') }]) },
] })
ok('准备：planned 骨架写入', built.ok === true, JSON.stringify(built.errors ?? '').slice(0, 100))

console.log('== ① batch patch 内层缺失 → 必须报错，不能静默 no-op ==')
const FILE_A = 'modules/demo/a.md'
const before = readModule(DIR, FILE_A)
const bad = await call('normify_module_batch', { dir: DIR, mode: 'patch', items: [{ patch: { id: 'demo.a', tags: ['bad'] } }] })
ok('①a 单层包装报 args/invalid-patch', bad.ok === false && (bad.errors ?? []).some(e => /args\/invalid-patch/.test(String(e))), JSON.stringify(bad.errors ?? bad).slice(0, 140))
ok('①b 文件确实没被改动', readModule(DIR, FILE_A) === before)
const emptyInner = await call('normify_module_batch', { dir: DIR, mode: 'patch', items: [{ patch: { id: 'demo.a', patch: {} } }] })
ok('①c 内层空对象同样报错', emptyInner.ok === false && (emptyInner.errors ?? []).some(e => /args\/invalid-patch/.test(String(e))))
const good = await call('normify_module_batch', { dir: DIR, mode: 'patch', items: [{ patch: { id: 'demo.a', patch: { tags: ['ok'] } } }] })
ok('①d 双层包装成功', good.ok === true, JSON.stringify(good.errors ?? '').slice(0, 100))
ok('①e 双层包装真的写进去了', /tags:/.test(readModule(DIR, FILE_A)) && readModule(DIR, FILE_A) !== before)

console.log('\n== ② 单模块 patch 空补丁 ==')
const empty = await call('normify_module_patch', { dir: DIR, id: 'demo.a', patch: {} })
ok('②a 空补丁报 args/empty-patch', empty.ok === false && /args\/empty-patch/.test(JSON.stringify(empty.errors ?? empty)), JSON.stringify(empty.errors ?? empty).slice(0, 120))
const onlyExpect = await call('normify_module_patch', { dir: DIR, id: 'demo.a', patch: { expect_updated_at: '2026-01-01T00:00:00Z' } })
ok('②b 只给 expect_updated_at 也报错（且不是静默通过）', onlyExpect.ok === false, JSON.stringify(onlyExpect.errors ?? onlyExpect).slice(0, 120))
const real = await call('normify_module_patch', { dir: DIR, id: 'demo.a', patch: { tags: ['patched'] } })
ok('②c 正常补丁仍可用', real.ok === true, JSON.stringify(real.errors ?? '').slice(0, 100))

console.log('\n== ③ refresh 不依赖 git（降级为 warning） ==')
const rf = await call('normify_module_refresh', { dir: DIR, ids: ['demo.a', 'demo.b'], repoRoot: CODE, activate: true })
ok('③a 非 git 仓库不再 refresh/git-failed', rf.ok === true, JSON.stringify(rf.errors ?? rf.error ?? '').slice(0, 140))
ok('③b 给出 refresh/git-unavailable 警告', (rf.warnings ?? []).some(w => /refresh\/git-unavailable/.test(String(w))), JSON.stringify((rf.warnings ?? []).slice(0, 1)).slice(0, 140))
const modA = await call('normify_module_get', { dir: DIR, id: 'demo.a' })
const fpA = JSON.stringify(modA)
ok('③c fingerprint 已按源码重算（非 pending）', !/pending/.test(fpA) && /[a-f0-9]{64}/.test(fpA), fpA.slice(0, 120))
ok('③d revision 保持原值（仍是占位 40 个 0）', /0{40}/.test(fpA))
ok('③e 叶子已激活为 active（refreshed[].state）', (rf.refreshed ?? []).some(r => r.id === 'demo.a' && r.state === 'active'), JSON.stringify(rf.refreshed ?? null).slice(0, 140))

console.log('\n== ④ help 参数树 + acceptance 报错文案 ==')
const td = await call('normify_help', { topic: 'tool:normify_module_batch' })
ok('④a tool:<name> 返回参数树', td.ok === true && /参数/.test(td.reference) && /items/.test(td.reference), String(td.title))
ok('④b 参数树标出必填与类型', /\* items: array/.test(td.reference) && /mode: string/.test(td.reference), td.reference.split('\n').slice(4, 6).join(' / '))
ok('④c 参数树暴露 patch 双层结构说明', /patch: \{ id, patch \}/.test(td.reference))
const tu = await call('normify_help', { topic: 'tool:nope' })
ok('④d 未知工具报 args/unknown-tool', tu.ok === false && tu.error?.code === 'args/unknown-tool', JSON.stringify(tu.error).slice(0, 120))
const tl = await call('normify_help', { topic: 'tools' })
ok('④e tools 主题带"必填/可选"摘要', /必填:/.test(tl.reference) && /可选:/.test(tl.reference))
const NEW = join(work, 'normify-chg').replace(/\\/g, '/')
const badChg = await call('normify_change_open', { dir: NEW, title: L('测试', 'Test'), intent: L('验收标准写错类型', 'wrong acceptance type'), modules: {}, acceptance: [L('双语对象', 'l10n object')] })
ok('④f acceptance 传双语对象报错并点明第几条', badChg.ok === false && /第 1 条/.test(JSON.stringify(badChg.errors ?? badChg)) && /纯字符串/.test(JSON.stringify(badChg.errors ?? badChg)), JSON.stringify(badChg.errors ?? badChg).slice(0, 170))
const okChg = await call('normify_change_open', { dir: NEW, title: L('测试', 'Test'), intent: L('正常字符串数组', 'plain string array'), modules: {}, acceptance: ['验收点 A', '验收点 B'] })
ok('④g 纯字符串数组正常通过', okChg.ok === true, JSON.stringify(okChg.error ?? okChg.id ?? '').slice(0, 100))

console.log('\n=== 结果：' + (fails.length === 0 ? '全部 PASS' : 'FAIL ' + fails.length + ' 项 → ' + fails.join(' | ')) + ' ===')
rmSync(work, { recursive: true, force: true })
process.exit(fails.length === 0 ? 0 : 1)
