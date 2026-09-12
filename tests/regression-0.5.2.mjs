// 0.5.2 回归测试：锁定本轮修掉的三个真实缺陷
//   ① normify_module_upsert.parameters.required 丢失（params() 二次编译）
//   ② normify_module_move 迁移 renders/*.json 只搬文件、不重写 id/order/groups/edge_hints
//   ③ 叶子晋升为容器时 apis 未下放（容器带 apis → L2 api/non-leaf）
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const PLUGIN = pathToFileURL(new URL('../lib/index.js', import.meta.url).pathname.replace(/^\//, '')).href
const plug = await import(PLUGIN)
const tools = new Map()
plug.apply({ tools: { register: (d) => tools.set(d.name, d) }, skills: { register: () => () => {} },
  logger: { info: () => {}, warn: () => {} }, effect: () => {}, on: () => {} },
  { rootDir: '.', requireBilingual: true, devCompanionReminder: false, devCompanionReminderAfter: 8 })
const call = (n, a) => tools.get(n).execute(a ?? {})
const hex = (s) => createHash('sha256').update(s).digest('hex')
const A = (path, zh, en) => ({ protocol: 'rpc', path, description: { zh, en } })
const L = (zh, en) => ({ zh, en })
const NOW = '2026-09-12T10:00:00Z'
const fm = (id, parent, apis) => ({
  uid: hex('uid:' + id).slice(0, 8), id, parent,
  name: L(id, id), description: L('回归测试 ' + id, 'regression ' + id),
  source: [{ path: 'src/' + id.split('.').join('/') + '.ts', line: 1 }],
  revision: '0'.repeat(40), updated_at: NOW, fingerprint: hex(id),
  ...(apis ? { apis } : {}),
})
const fails = []
const ok = (name, cond, extra = '') => { if (!cond) fails.push(name); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`) }

const work = mkdtempSync(join(tmpdir(), 'normify-regression-'))
const DATA = join(work, 'normify-demo').replace(/\\/g, '/')

console.log('== ① 工具 schema：必填表不能丢 ==')
const upsertDef = tools.get('normify_module_upsert')
ok('①a module_upsert.parameters.required 存在', Array.isArray(upsertDef.parameters?.required), JSON.stringify(upsertDef.parameters?.required))
ok('①b required = ["frontmatter"]', JSON.stringify(upsertDef.parameters?.required) === '["frontmatter"]')
const nested = upsertDef.parameters?.properties?.frontmatter?.required
ok('①c frontmatter.required 保留 9 项', Array.isArray(nested) && nested.length === 9, JSON.stringify(nested))
for (const need of ['uid', 'id', 'parent', 'name', 'description', 'source', 'revision', 'updated_at', 'fingerprint'])
  ok('①d frontmatter.required 含 ' + need, (nested ?? []).includes(need))
ok('①e 空参调用被 args/missing 拦截', (await call('normify_module_upsert', {})).error?.code === 'args/missing')

console.log('\n== 建树（3 个叶子 + 2 层容器）==')
for (const m of [
  fm('demo', null), fm('demo.core', 'demo'), fm('demo.util', 'demo', [A('util/ping', '探活', 'ping')]),
  fm('demo.core.alpha', 'demo.core', [A('alpha/run', '跑 alpha', 'run alpha')]),
  fm('demo.core.beta', 'demo.core', [A('beta/go', '跑 beta', 'run beta')]),
]) ok('upsert ' + m.id, (await call('normify_module_upsert', { dir: DATA, frontmatter: m })).ok === true)
ok('alpha→beta 依赖边', (await call('normify_module_upsert', { dir: DATA, frontmatter: {
  ...fm('demo.core.alpha', 'demo.core', [A('alpha/run', '跑 alpha', 'run alpha')]),
  deps: [{ to: 'demo.core.beta', kind: 'call', from_api: 'rpc:alpha/run', to_api: 'rpc:beta/go' }] } })).ok === true)
ok('layout demo.core（groups + edge_hint）', (await call('normify_layout_upsert', { dir: DATA, id: 'demo.core', mode: 'groups',
  order: ['demo.core.alpha', 'demo.core.beta'],
  groups: [{ id: 'g', title: L('核心', 'core'), children: ['demo.core.alpha', 'demo.core.beta'] }],
  edge_hints: [{ from: 'demo.core.alpha', to: 'demo.core.beta', kind: 'call', lane: 1 }],
  reading: L('先看 alpha', 'alpha first') })).ok === true)
ok('layout demo（order）', (await call('normify_layout_upsert', { dir: DATA, id: 'demo', order: ['demo.core', 'demo.util'] })).ok === true)
ok('基线 L2 = 0 error', (await call('normify_validate', { dir: DATA })).ok === true, JSON.stringify((await call('normify_validate', { dir: DATA })).errors ?? []))

console.log('\n== ② move：渲染数据内容必须重写 ==')
const mv1 = await call('normify_module_move', { dir: DATA, id: 'demo.core', new_id: 'demo.platform' })
ok('②a move 成功', mv1.ok === true, JSON.stringify(mv1.errors ?? mv1.error ?? ''))
const lay = JSON.parse(readFileSync(join(work, 'normify-demo/renders/demo/platform.json'), 'utf8'))
ok('②b 迁移后 id 已重写', lay.id === 'demo.platform', lay.id)
ok('②c order 已重写', JSON.stringify(lay.order) === JSON.stringify(['demo.platform.alpha', 'demo.platform.beta']), JSON.stringify(lay.order))
ok('②d groups.children 已重写', JSON.stringify(lay.groups?.[0]?.children) === JSON.stringify(['demo.platform.alpha', 'demo.platform.beta']), JSON.stringify(lay.groups))
ok('②e edge_hints 已重写', lay.edge_hints?.[0]?.from === 'demo.platform.alpha' && lay.edge_hints?.[0]?.to === 'demo.platform.beta', JSON.stringify(lay.edge_hints))
const root = JSON.parse(readFileSync(join(work, 'normify-demo/renders/demo.json'), 'utf8'))
ok('②f 旧父级 order 已去重写', JSON.stringify(root.order) === JSON.stringify(['demo.util', 'demo.platform']), JSON.stringify(root.order))
const v1 = await call('normify_validate', { dir: DATA })
ok('②g move 后 L2 = 0 error', v1.ok === true, JSON.stringify(v1.errors ?? []))

console.log('\n== ③ 晋升为容器：apis 必须下放，且要回报 ==')
const mv2 = await call('normify_module_move', { dir: DATA, id: 'demo.platform', new_parent: 'demo.util' })
ok('③a 挂到带 API 的叶子上', mv2.ok === true, JSON.stringify(mv2.errors ?? mv2.error ?? ''))
const detail = JSON.stringify(mv2.warnings ?? [])
ok('③b 回报 api-dropped-on-promote', detail.includes('api-dropped-on-promote'), detail.slice(0, 160))
const v2 = await call('normify_validate', { dir: DATA })
ok('③c 晋升后 L2 = 0 error（容器不再带 apis）', v2.ok === true, JSON.stringify((v2.errors ?? []).slice(0, 3)))
const utilFile = readFileSync(join(work, 'normify-demo/modules/demo/util/index.md'), 'utf8')
ok('③d 容器 frontmatter 无 apis 字段', !/^apis:/m.test(utilFile.split('---')[1] ?? ''), utilFile.split('---')[1]?.slice(0, 80) ?? '')
ok('③e renders 已随迁且旧文件清理', existsSync(join(work, 'normify-demo/renders/demo/util/platform.json')) && !existsSync(join(work, 'normify-demo/renders/demo/platform.json')))

console.log('\n=== 结果：' + (fails.length === 0 ? '全部 PASS' : 'FAIL ' + fails.length + ' 项 → ' + fails.join(' | ')) + ' ===')
rmSync(work, { recursive: true, force: true })
process.exit(fails.length === 0 ? 0 : 1)
