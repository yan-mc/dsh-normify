// Issue #1~#4 修复回归（2026-09 PR）：写白名单旁路 / receipt 自哈希 / id 末段 index / 长度校验码与 severity
//   #1a render.out 路径穿越        → render/out-invalid（out 必须是结构数据目录内的相对文件名）
//   #1b sync.diff '-' 开头注入      → 拒绝（git 不再拿到可当选项解析的裸位置参数）
//   #1c dir/project 越出 rootDir    → project/outside-root（root 是写入边界）
//   #2  receipt.json 自引用哈希     → artifacts 不再含 receipt.json（自哈希逻辑上不可能成立）
//   #3  id 末段 index 静默覆盖父模块 → structure/id-reserved-segment（写入前拒绝）
//   #4  api/description-*、dep/label-* 诊断码可达；宽松模式 name/描述/label 超限同为 warning
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const PLUGIN = new URL('../lib/index.js', import.meta.url).href
const plug = await import(PLUGIN)

const makeTools = (requireBilingual) => {
  const tools = new Map()
  plug.apply({ tools: { register: (d) => tools.set(d.name, d) }, skills: { register: () => () => {} },
    logger: { info: () => {}, warn: () => {} }, effect: () => {}, on: () => {} },
    { rootDir: ROOT, requireBilingual, devCompanionReminder: false, devCompanionReminderAfter: 8 })
  return tools
}

const fails = []
const ok = (name, cond, extra = '') => { if (!cond) fails.push(name); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + String(extra).slice(0, 150) + ']' : ''}`) }
const hex = (s) => createHash('sha256').update(s).digest('hex')
const sha256File = (p) => hex(readFileSync(p, 'utf8'))
const L = (zh, en) => ({ zh, en })
const NOW = '2026-09-12T12:00:00Z'
const txt = (...lines) => lines.join('\n') + '\n'

const work = mkdtempSync(join(tmpdir(), 'normify-fix1234-'))
const ROOT = join(work, 'root').replace(/\\/g, '/')
mkdirSync(ROOT, { recursive: true })
const DIR = (slug) => ROOT + '/normify-' + slug

const strict = makeTools(true)
const loose = makeTools(false)
const callS = async (n, a) => { try { return await strict.get(n).execute(a ?? {}) } catch (e) { return { ok: false, error: { code: 'thrown', message: String(e?.message ?? e) } } } }
const callL = async (n, a) => { try { return await loose.get(n).execute(a ?? {}) } catch (e) { return { ok: false, error: { code: 'thrown', message: String(e?.message ?? e) } } } }

const fm = (id, parent, extra = {}) => ({
  uid: hex('uid:' + id).slice(0, 8), id, parent,
  name: L('模块 ' + id, 'module ' + id), description: L('回归 ' + id, 'regression ' + id),
  source: [], revision: '0'.repeat(40), updated_at: NOW, fingerprint: 'pending', state: 'planned',
  ...extra,
})
const api = (path) => [{ protocol: 'rpc', path, description: L('构建接口', 'build api') }]

// ---------- 准备：demo 树（根 + 容器 + 叶子），随后 build ----------
const prep = await callS('normify_module_batch', { dir: DIR('demo'), items: [
  { frontmatter: fm('demo', null) },
  { frontmatter: fm('demo.order', 'demo', { apis: api('buildOrder') }) },
  { frontmatter: fm('demo.order.item', 'demo.order', { apis: api('buildItem') }) },
] })
ok('准备：demo 骨架写入', prep.ok === true, JSON.stringify(prep.errors ?? prep).slice(0, 120))

console.log('== #3 id 末段 index：写入前拒绝，父模块不被覆盖 ==')
const idx = await callS('normify_module_batch', { dir: DIR('demo'), items: [
  { frontmatter: fm('demo.order.index', 'demo.order', { apis: api('buildIndex') }) },
] })
const idxCodes = JSON.stringify(idx.errors ?? []) + JSON.stringify(idx.error ?? {})
ok('#3a 末段 index 被拒绝', idx.ok === false && /id-reserved-segment/.test(idxCodes), idxCodes.slice(0, 140))
const orderFile = readFileSync(join(DIR('demo'), 'modules/demo/order/index.md'), 'utf8')
ok('#3b 父容器文件未被覆盖', /id: demo\.order\b/.test(orderFile) && !/id: demo\.order\.index/.test(orderFile))
const idxOk = await callS('normify_module_upsert', { dir: DIR('demo'), frontmatter: fm('demo.order.indexpage', 'demo.order', { apis: api('buildIndexPage') }) })
ok('#3c 非保留末段照常写入', idxOk.ok === true, JSON.stringify(idxOk.errors ?? idxOk).slice(0, 120))

console.log('== #4 诊断码可达 + 宽松模式 severity 统一 ==')
// L1 是两段式：基础字段（name 等）有错会 return、跳过 apis/deps 段——每种超限必须放独立模块，
// 各码才能各自浮出来；另留一个干净孩子 fix.core，避免犯错模块被丢出集合后根模块退化成叶子（api/leaf-missing 干扰）。
const FIX = DIR('fix')
const mk = await callS('normify_module_batch', { dir: FIX, items: [
  { frontmatter: fm('fix', null) },
  { frontmatter: fm('fix.core', 'fix', { apis: api('c') }) },
  { frontmatter: fm('fix.longname', 'fix', { name: L('名字超长', 'Markername') }) },
  { frontmatter: fm('fix.longapi', 'fix', { apis: [{ protocol: 'rpc', path: 'a', description: L('构建', 'Markeraip') }] }) },
  { frontmatter: fm('fix.badlabel', 'fix', { apis: api('b'), deps: [{ kind: 'call', to: 'fix.core', label: L('标签', 'Markerlabel') }] }) },
] })
ok('#4 准备：夹具写入', mk.ok === true, JSON.stringify(mk.errors ?? mk).slice(0, 120))
const pn = join(FIX, 'modules/fix/longname.md')
const pa = join(FIX, 'modules/fix/longapi.md')
const pl = join(FIX, 'modules/fix/badlabel.md')
writeFileSync(pn, readFileSync(pn, 'utf8').split('Markername').join('N'.repeat(70)), 'utf8')
writeFileSync(pa, readFileSync(pa, 'utf8').split('Markeraip').join('A'.repeat(250)), 'utf8')
writeFileSync(pl, readFileSync(pl, 'utf8').split('Markerlabel').join('L'.repeat(40)), 'utf8')
ok('#4 准备：夹具已替换为超长文案', readFileSync(pn, 'utf8').includes('N'.repeat(70))
  && readFileSync(pa, 'utf8').includes('A'.repeat(250)) && readFileSync(pl, 'utf8').includes('L'.repeat(40)))

const strictV = await callS('normify_validate', { dir: FIX })
const sErr = (strictV.errors ?? []).join(' ')
ok('#4a api/description-too-long 可达', /api\/description-too-long/.test(sErr), sErr.slice(0, 140))
ok('#4b dep/label-too-long 可达', /dep\/label-too-long/.test(sErr))
ok('#4c structure/name-too-long 可达', /structure\/name-too-long/.test(sErr))
const looseV = await callL('normify_validate', { dir: FIX })
const lErr = (looseV.errors ?? []).join(' ')
const lWarn = (looseV.warnings ?? []).join(' ')
ok('#4d 宽松模式三者全部降级 warning', !/too-long/.test(lErr)
  && /structure\/name-too-long/.test(lWarn) && /api\/description-too-long/.test(lWarn) && /dep\/label-too-long/.test(lWarn),
  'err=' + lErr.slice(0, 100))

console.log('== #2 receipt.json 不再自引用 ==')
const b = await callS('normify_build', { dir: DIR('demo') })
ok('#2 准备：build 成功', b.ok === true, JSON.stringify(b.errors ?? b).slice(0, 120))
const receipt = JSON.parse(readFileSync(join(DIR('demo'), 'receipt.json'), 'utf8'))
const arts = receipt.artifacts ?? {}
ok('#2a artifacts 不含 receipt.json 自引用', !('receipt.json' in arts), JSON.stringify(Object.keys(arts)))
const names = Object.keys(arts)
ok('#2b 冻结范围 = 三件产物', names.length === 3 && ['tree.json', 'outline.md', 'api-index.json'].every(n => names.includes(n)), names.join(','))
ok('#2c 三件产物哈希与字节一致', names.every(n => sha256File(join(DIR('demo'), n)) === arts[n].sha256))

console.log('== #1a render.out 只接受结构数据目录内的相对文件名 ==')
const esc = join(work, 'escape.html').replace(/\\/g, '/')
const r1 = await callS('normify_render', { dir: DIR('demo'), out: '../../escape.html' })
ok('#1a-a 穿越路径被拒', r1.ok === false && /out-invalid/.test(JSON.stringify(r1.errors ?? [])), JSON.stringify(r1.errors ?? r1).slice(0, 140))
ok('#1a-b 探针文件未落地', !existsSync(esc))
const r2 = await callS('normify_render', { dir: DIR('demo') })
ok('#1a-c 合法默认输出照常', r2.ok === true && existsSync(join(DIR('demo'), 'normify.html')), JSON.stringify(r2).slice(0, 100))

console.log('== #1b sync.diff 拒绝 \'-\' 开头（git 选项注入面） ==')
const CODE = join(work, 'repo').replace(/\\/g, '/')
mkdirSync(join(CODE, 'src'), { recursive: true })
writeFileSync(join(CODE, 'src/a.js'), txt('export const a = 1'), 'utf8')
const g = (...a) => spawnSync('git', ['-C', CODE, ...a], { encoding: 'utf8' })
g('init'); g('add', '.'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'init')
writeFileSync(join(CODE, 'src/a.js'), txt('export const a = 2'), 'utf8')
const probe = join(work, 'sync-probe.txt').replace(/\\/g, '/')
const s1 = await callS('normify_sync', { dir: DIR('demo'), repoRoot: CODE, diff: '--output=' + probe })
ok('#1b-a 注入式 diff 被拒', s1.ok === false, JSON.stringify(s1).slice(0, 140))
ok('#1b-b 探针文件未落地', !existsSync(probe))
const s2 = await callS('normify_sync', { dir: DIR('demo'), repoRoot: CODE, diff: '' })
ok('#1b-c 常规 diff 照常', s2.ok === true && (s2.changed_count ?? 0) >= 1, 'changed=' + s2.changed_count)

console.log('== #1c dir/project 必须落在 rootDir 之内 ==')
const outside = join(work, 'outside', 'normify-escape').replace(/\\/g, '/')
const d1 = await callS('normify_project_init', { dir: outside })
const d1c = (d1.error?.code ?? '') + JSON.stringify(d1.errors ?? [])
ok('#1c-a 越界目录被拒', d1.ok === false && /outside-root/.test(d1c), d1c.slice(0, 140))
ok('#1c-b 越界目录未创建', !existsSync(outside))
const inside = ROOT + '/normify-inside'
const d2 = await callS('normify_project_init', { dir: inside })
ok('#1c-c 界内绝对路径照常', d2.ok === true && existsSync(join(inside, 'modules')), JSON.stringify(d2).slice(0, 100))

console.log()
if (fails.length > 0) {
  console.log('FAILED ' + fails.length + ': ' + fails.join(' | '))
  process.exit(1)
}
console.log('all issue-fix regressions green')
