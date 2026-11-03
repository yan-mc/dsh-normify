// 0.5.5 回归测试：锁定 Phase 0（止血）修复
//   ① engines/安装相关（静态检查由 scripts/pack-smoke.mjs 覆盖，这里只测运行时行为）
//   ② 安全三破口：sync.diff 选项注入 / render.out 路径穿越 / fingerprint source 越界
//   ③ receipt.json 自哈希 → receipt.sha256 sidecar；artifacts 不含自身
//   ④ 数据正确性：index 保留段、空 batch、孤儿 upsert、坏文件不静默、policy 缺失时环检测、delete 型 change 死锁
//   ⑤ 渲染安全：<title> 转义、CSP、/s+/g 正则修复
//   ⑥ 原子写：不残留 .tmp- 文件
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const PLUGIN = new URL('../lib/dsh/index.js', import.meta.url).href
const plug = await import(PLUGIN)
const tools = new Map()
plug.apply({ tools: { register: (d) => tools.set(d.name, d) }, skills: { register: () => () => {} },
  logger: { info: () => {}, warn: () => {} }, effect: () => {}, on: () => {} },
  { rootDir: '.', requireBilingual: true, devCompanionReminder: false, devCompanionReminderAfter: 8 })
const raw = (n, a) => tools.get(n).execute(a ?? {})
const call = async (n, a) => { try { return await raw(n, a) } catch (e) { return { ok: false, error: { code: 'thrown', message: String(e?.message ?? e) } } } }
const hex = (s) => createHash('sha256').update(s).digest('hex')
const L = (zh, en) => ({ zh, en })
const NOW = '2026-11-03T12:00:00Z'
const fails = []
const ok = (name, cond, extra = '') => { if (!cond) fails.push(name); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + String(extra).slice(0, 160) + ']' : ''}`) }
const fm = (id, parent, source = [], apis, extra = {}) => ({
  uid: hex('uid:' + id).slice(0, 8), id, parent,
  name: L(id, id), description: L('回归 ' + id, 'regression ' + id),
  source: source.map(p => ({ path: p, line: 1 })),
  revision: '0'.repeat(40), updated_at: NOW, fingerprint: 'pending', state: 'planned',
  ...(apis !== undefined ? { apis } : {}),
  ...extra,
})
const walkFiles = (dir) => {
  const out = []
  const rec = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) rec(p); else out.push(p) } }
  try { rec(dir) } catch { /* ignore */ }
  return out
}

const work = mkdtempSync(join(tmpdir(), 'normify-p0-'))
const REPO = join(work, 'repo')
mkdirSync(join(REPO, 'src'), { recursive: true })
writeFileSync(join(REPO, 'src', 'a.ts'), 'export const a = 1\n', 'utf8')
writeFileSync(join(REPO, 'src', 'b.ts'), 'export const b = 2\n', 'utf8')

console.log('== ① 安全：sync.diff 选项注入被拒绝（不创建仓库外文件） ==')
const SEC = join(work, 'normify-sec').replace(/\\/g, '/')
const init = await call('normify_project_init', { dir: SEC, root: { id: 'sec', name: L('安全', 'Sec'), description: L('安全测试项目', 'Security test project') } })
ok('①a 项目初始化', init.ok === true, JSON.stringify(init.error ?? init.root_module))
const attack = join(work, 'pwned.txt').replace(/\\/g, '/')
const inj = await call('normify_sync', { dir: SEC, repoRoot: REPO, diff: '--output=' + attack })
ok('①b diff 注入被拒绝', inj.ok === false && /args\/invalid-diff/.test(JSON.stringify(inj.error ?? inj.errors ?? '')), JSON.stringify(inj.error ?? inj.errors ?? '').slice(0, 140))
ok('①c 仓库外文件未被创建', existsSync(attack) === false)
const outTrav = await call('normify_render', { dir: SEC, out: '../../escaped.html' })
ok('①d render.out 路径穿越被拒绝', outTrav.ok === false && /render\/invalid-out|render\/no-build/.test(JSON.stringify(outTrav.errors ?? outTrav)), JSON.stringify(outTrav.errors ?? outTrav).slice(0, 140))
ok('①e 项目目录外未被写出', existsSync(join(work, 'escaped.html')) === false)
const fpTrav = await call('normify_fingerprint', { repoRoot: REPO, source: [{ path: '../../outside.txt' }] })
ok('①f fingerprint source 越界被拒绝', fpTrav.ok === false && /structure\/source-path-invalid/.test(JSON.stringify(fpTrav.errors ?? fpTrav)), JSON.stringify(fpTrav.errors ?? fpTrav).slice(0, 140))
const fpAbs = await call('normify_fingerprint', { repoRoot: REPO, source: [{ path: 'C:/Windows/win.ini' }] })
ok('①g fingerprint 绝对路径被拒绝', fpAbs.ok === false && /structure\/source-path-invalid/.test(JSON.stringify(fpAbs.errors ?? fpAbs)))

console.log('\n== ② 数据正确性：index 保留段 / 空 batch / 孤儿 upsert ==')
const idx = await call('normify_module_upsert', { dir: SEC, frontmatter: fm('sec.index', 'sec', []) })
ok('②a id 末段 index 被拒绝', idx.ok === false && /structure\/id-reserved/.test(JSON.stringify(idx.errors ?? idx)), JSON.stringify(idx.errors ?? idx).slice(0, 140))
const emptyBatch = await call('normify_module_batch', { dir: SEC, mode: 'upsert', items: [] })
ok('②b 空 batch 不再假成功', emptyBatch.ok === false && /args\/empty-batch/.test(JSON.stringify(emptyBatch.errors ?? emptyBatch)), JSON.stringify(emptyBatch.errors ?? emptyBatch).slice(0, 140))
const orphan = await call('normify_module_upsert', { dir: SEC, frontmatter: fm('nope.x', 'nope', ['src/a.ts'], []) })
ok('②c 孤儿 parent 单 upsert 被拒绝', orphan.ok === false && /structure\/parent-not-exist/.test(JSON.stringify(orphan.error ?? orphan.errors ?? orphan)), JSON.stringify(orphan.error ?? orphan.errors ?? '').slice(0, 140))

console.log('\n== ③ 编译：receipt 自哈希修复 + 原子写 ==')
const BUILD = join(work, 'normify-build').replace(/\\/g, '/')
await call('normify_project_init', { dir: BUILD, root: { id: 'bld', name: L('构建', 'Build'), description: L('构建测试', 'Build test') } })
const built = await call('normify_module_batch', { dir: BUILD, mode: 'upsert', items: [
  { frontmatter: fm('bld.core', 'bld', ['src/a.ts'], undefined) },
  { frontmatter: fm('bld.core.a', 'bld.core', ['src/a.ts'], [{ protocol: 'rpc', path: 'a/run', description: L('跑 a', 'run a') }]) },
] })
ok('③a 建树', built.ok === true, JSON.stringify(built.errors ?? '').slice(0, 100))
// 容器会触发父模块晋升；补一层渲染数据避免 layout/missing warning（不影响 build）
const b = await call('normify_build', { dir: BUILD })
ok('③b build 成功', b.ok === true, JSON.stringify(b.errors ?? '').slice(0, 140))
const receiptPath = join(BUILD, 'receipt.json')
const receiptText = existsSync(receiptPath) ? readFileSync(receiptPath, 'utf8') : ''
const receipt = receiptText ? JSON.parse(receiptText) : {}
ok('③c receipt.artifacts 不含自身', receipt.artifacts !== undefined && receipt.artifacts['receipt.json'] === undefined, JSON.stringify(Object.keys(receipt.artifacts ?? {})))
const sidecar = existsSync(join(BUILD, 'receipt.sha256')) ? readFileSync(join(BUILD, 'receipt.sha256'), 'utf8').trim() : ''
ok('③d receipt.sha256 sidecar 与文件字节一致', sidecar === hex(receiptText), sidecar.slice(0, 12) + ' vs ' + hex(receiptText).slice(0, 12))
const treeText = readFileSync(join(BUILD, 'tree.json'), 'utf8')
ok('③e tree.json 哈希可复算', receipt.artifacts?.['tree.json']?.sha256 === hex(treeText))
const tmpLeft = walkFiles(join(BUILD, 'modules')).filter(p => p.includes('.tmp-'))
ok('③f 原子写不残留 .tmp- 文件', tmpLeft.length === 0, tmpLeft.slice(0, 3).join(', '))

console.log('\n== ④ 坏文件不静默 + policy 缺失时环检测 + delete 型 change ==')
const BAD = join(work, 'normify-bad').replace(/\\/g, '/')
await call('normify_project_init', { dir: BAD, root: { id: 'bad', name: L('坏', 'Bad'), description: L('坏文件', 'bad file') } })
writeFileSync(join(BAD, 'modules', 'bad', 'broken.md'), '---\nuid: [unclosed\n---\n', 'utf8')
const getBad = await call('normify_module_get', { dir: BAD, id: 'bad' })
ok('④a 读工具遇到坏文件不再静默', getBad.ok === false && /input\/invalid-modules/.test(JSON.stringify(getBad.error ?? getBad.errors ?? '')), JSON.stringify(getBad.error ?? getBad.errors ?? '').slice(0, 160))

const CYC = join(work, 'normify-cyc').replace(/\\/g, '/')
await call('normify_project_init', { dir: CYC, root: { id: 'cyc', name: L('环', 'Cycle'), description: L('环检测', 'cycle check') } })
await call('normify_module_batch', { dir: CYC, mode: 'upsert', items: [
  { frontmatter: fm('cyc.x', 'cyc', ['src/a.ts'], [{ protocol: 'rpc', path: 'x/run', description: L('跑 x', 'run x') }], { deps: [{ kind: 'call', to: 'cyc.y' }] }) },
  { frontmatter: fm('cyc.y', 'cyc', ['src/b.ts'], [{ protocol: 'rpc', path: 'y/run', description: L('跑 y', 'run y') }], { deps: [{ kind: 'call', to: 'cyc.x' }] }) },
] })
unlinkSync(join(CYC, 'policy.yml'))
const cycVal = await call('normify_validate', { dir: CYC })
ok('④b policy 缺失时环依赖被 L2 拦截', cycVal.ok === false && /structure\/dependency-cycle/.test(JSON.stringify(cycVal.errors ?? cycVal)), JSON.stringify(cycVal.errors ?? cycVal).slice(0, 160))

const CHG = join(work, 'normify-chg').replace(/\\/g, '/')
await call('normify_project_init', { dir: CHG, root: { id: 'chg', name: L('变更', 'Change'), description: L('变更测试', 'change test') } })
await call('normify_module_batch', { dir: CHG, mode: 'upsert', items: [
  { frontmatter: fm('chg.c', 'chg', ['src/a.ts']) },
  { frontmatter: fm('chg.c.a', 'chg.c', ['src/a.ts'], [{ protocol: 'rpc', path: 'a/run', description: L('跑 a', 'run a') }]) },
  { frontmatter: fm('chg.c.b', 'chg.c', ['src/b.ts'], [{ protocol: 'rpc', path: 'b/run', description: L('跑 b', 'run b') }]) },
] })
const chgOpen = await call('normify_change_open', { dir: CHG, title: L('删除 a', 'delete a'), intent: L('测试 delete 死锁', 'delete deadlock'), modules: { delete: ['chg.c.a'] }, acceptance: ['a 被删除', 'validate 0 error'] })
ok('④c change_open 记录删除目标', chgOpen.ok === true, JSON.stringify(chgOpen.error ?? chgOpen.id ?? ''))
const chgFile = join(CHG, 'changes', String(chgOpen.id) + '.json')
const chgData = JSON.parse(readFileSync(chgFile, 'utf8'))
ok('④d change 内含 delete_snapshot', Array.isArray(chgData.delete_snapshot) && chgData.delete_snapshot.includes('chg.c.a'), JSON.stringify(chgData.delete_snapshot ?? null))
const delRes = await call('normify_module_delete', { dir: CHG, id: 'chg.c.a' })
ok('④e 删除模块', delRes.ok === true, JSON.stringify(delRes.error ?? ''))
const chgVal = await call('normify_validate', { dir: CHG })
ok('④f 删除后 L2 不再报 change/module-missing', chgVal.ok === true, JSON.stringify(chgVal.errors ?? chgVal).slice(0, 160))
const chgClose = await call('normify_change_close', { dir: CHG, id: String(chgOpen.id) })
ok('④g delete 型 change 可以关闭', chgClose.ok === true, JSON.stringify(chgClose.errors ?? chgClose.error ?? chgClose.phase ?? '').slice(0, 160))

console.log('\n== ⑤ 渲染安全：title 转义 / CSP / \\s 正则 ==')
const treeFile = join(BUILD, 'tree.json')
const t = JSON.parse(readFileSync(treeFile, 'utf8'))
t.project.name = '<img src=x onerror=alert(1)>'
writeFileSync(treeFile, JSON.stringify(t, null, 2) + '\n', 'utf8')
const rnd = await call('normify_render', { dir: BUILD })
ok('⑤a render 成功', rnd.ok === true, JSON.stringify(rnd.errors ?? '').slice(0, 120))
const html = existsSync(join(BUILD, 'normify.html')) ? readFileSync(join(BUILD, 'normify.html'), 'utf8') : ''
ok('⑤b <title> 已转义', /<title>&lt;img/.test(html))
ok('⑤c 未出现未转义的注入标签', !/<title><img/.test(html) && !/<img src=x onerror=alert\(1\)>/.test(html))
ok('⑤d 含 CSP meta', /Content-Security-Policy/.test(html))
ok('⑤e \\s 正则修复（不再是 /s+/g）', html.includes('/\\s+/g') && !html.includes('/s+/g'))
const outTrav2 = await call('normify_render', { dir: BUILD, out: '../../escaped2.html' })
ok('⑤f 已构建项目的 render.out 穿越被拒绝', outTrav2.ok === false && /render\/invalid-out/.test(JSON.stringify(outTrav2.errors ?? outTrav2)), JSON.stringify(outTrav2.errors ?? outTrav2).slice(0, 140))
ok('⑤g 没有写出项目目录', existsSync(join(work, 'escaped2.html')) === false)

console.log('\n== ⑥ 变更列表遇到坏变更文件不静默 ==')
const chgDir = join(CHG, 'changes')
writeFileSync(join(chgDir, '2026-11-03-broken.json'), '{ not valid json', 'utf8')
const listBad = await call('normify_change_list', { dir: CHG })
ok('⑥a change_list 返回解析错误', listBad.ok === false && /change\/json-parse/.test(JSON.stringify(listBad.errors ?? listBad)), JSON.stringify(listBad.errors ?? listBad).slice(0, 160))

console.log('\n=== 结果：' + (fails.length === 0 ? '全部 PASS' : 'FAIL ' + fails.length + ' 项 → ' + fails.join(' | ')) + ' ===')
rmSync(work, { recursive: true, force: true })
process.exit(fails.length === 0 ? 0 : 1)
