#!/usr/bin/env node
/**
 * tests/core-unit.mjs — L1 引擎单测（无外部依赖，不启动 DSH）
 *
 * 覆盖：ids/保留段、frontmatter L1、validate L2（环/叶子/API/唯一性）、compile 产物确定性、
 *       layout、policy、changes（delete_snapshot）、atomic（原子写/路径包含性/回滚）、path 安全。
 *
 * 运行：node tests/core-unit.mjs        （npm run test:unit）
 * 退出码：0 全部通过；1 有失败。
 *
 * 约定：只写 node:os 临时目录，跑完删除；不触碰仓库文件。
 * 被测实现：lib/core/index.js（先 `npm run build`）。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

import {
  // ids
  RESERVED_SEGMENTS, findReservedSegment, isValidId, splitId, deriveParent, treeOf, depthOf, slugify, apiKey,
  idFromFilePath, moduleFilePath,
  // frontmatter
  l1Validate, checkSourceEntry, checkApiEntry, checkDepEntry, parseModuleText, serializeModule,
  // store / atomic
  resolveProject, loadAllModules, writeModuleFile, writeFileAtomic, isInside, assertInsideProject, safeOutName,
  isSafeRepoRelative, isValidDiffSpec, createProjectIndex, indexFind, fingerprintOf, sha256Text,
  // validate / compile / render
  validateProject, buildProject, renderProject,
  // layout
  l1ValidateLayout, serializeLayout, layoutRelPath, idFromLayoutPath, edgeKey, writeLayoutFile, deleteLayoutFile,
  // policy
  l1ValidatePolicy, evaluatePolicy, matchIdPattern, defaultPolicyTemplate, policyReference,
  // changes
  l1ValidateChange, isValidChangeId, writeChangeFile, loadChangeFile, validateChanges,
  // edit
  batchWrite, patchModule, moveModuleTree, refreshModules, checkProposal,
} from '../lib/core/index.js'

// ---------------------------------------------------------------------------
// 微型测试框架（零依赖；输出简洁、失败定位清晰）
// ---------------------------------------------------------------------------
let passed = 0
const failures = []
let currentSuite = '(root)'
const only = process.env.UNIT_ONLY ? new RegExp(process.env.UNIT_ONLY) : null

function suite(name) { currentSuite = name }

async function test(name, fn) {
  const full = currentSuite + ' · ' + name
  if (only && !only.test(full)) return
  try {
    await fn()
    passed++
  } catch (error) {
    failures.push({ name: full, message: error?.message ?? String(error), stack: String(error?.stack ?? '') })
  }
}

/** 断言异步函数抛出带指定 code 的错误 */
async function rejectsWith(fn, code, predicate = () => true) {
  let err = null
  try { await fn() } catch (e) { err = e }
  assert.ok(err !== null, `期望抛出 ${code}，实际未抛错`)
  assert.equal(err.code, code, `错误 code 不符（收到 ${err.code}）：${err.message}`)
  assert.ok(predicate(err), `错误内容不满足断言：${err.message}`)
  return err
}

function throwsWith(fn, code) {
  let err = null
  try { fn() } catch (e) { err = e }
  assert.ok(err !== null, `期望抛出 ${code}，实际未抛错`)
  assert.equal(err.code, code, `错误 code 不符（收到 ${err.code}）：${err.message}`)
  return err
}

// ---------------------------------------------------------------------------
// 公共夹具
// ---------------------------------------------------------------------------
const AT = '2026-11-03T10:00:00Z'
const REV = '0'.repeat(40)
const hex = (s) => createHash('sha256').update(s).digest('hex')
const uidOf = (id) => hex('uid:' + id).slice(0, 8)
const L = (zh, en = zh) => ({ zh, en })

function moduleOf(id, parent, extra = {}) {
  return {
    uid: uidOf(id), id, parent,
    name: L('名 ' + id, 'name ' + id),
    description: L('描述 ' + id, 'description ' + id),
    source: [{ path: 'src/' + id.split('.').slice(1).join('/') + '.ts' }],
    revision: REV, updated_at: AT, fingerprint: 'a'.repeat(64),
    ...extra,
  }
}

const tmpRoots = []
function newRoot() {
  const root = mkdtempSync(join(tmpdir(), 'normify-unit-'))
  tmpRoots.push(root)
  return root
}

/** 建一个带默认 policy 的结构项目；返回 { root, dir } */
async function newProject(project = 'demo') {
  const root = newRoot()
  const ref = await resolveProject(root, { project }, { create: true })
  return { root, dir: ref.dir }
}

/** 写入一棵能通过 L2 的最小树：根容器 + 两个带 API 的叶子 */
async function minimalTree(dir) {
  await writeModuleFile(dir, moduleOf('demo', null), '')
  await writeModuleFile(dir, moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a/run', description: L('跑 a', 'run a') }] }), '')
  await writeModuleFile(dir, moduleOf('demo.b', 'demo', { apis: [{ protocol: 'rpc', path: 'b/run', description: L('跑 b', 'run b') }] }), '')
}

function childrenSet(...ids) { return new Set(ids) }

// ---------------------------------------------------------------------------
// 1. ids / 保留段 / 路径映射
// ---------------------------------------------------------------------------
suite('ids')

await test('合法点分 id 通过', () => {
  assert.equal(isValidId('demo.order.checkout.payment'), true)
  assert.deepEqual(splitId('demo.order'), ['demo', 'order'])
})

await test('大写/下划线/空串/首字符非法被拒', () => {
  for (const bad of ['Demo', 'demo_x', '', '-demo', 'demo..x', 'demo.'])
    assert.equal(isValidId(bad), false, `应拒绝 ${JSON.stringify(bad)}`)
})

await test('超长 id 被拒（>4096）', () => {
  assert.equal(isValidId('a'.repeat(4097)), false)
})

await test('保留段 index 被拒且在 RESERVED_SEGMENTS 中', () => {
  assert.equal(RESERVED_SEGMENTS.has('index'), true)
  assert.equal(isValidId('demo.x.index'), false)
  assert.equal(splitId('demo.x.index'), null)
})

await test('findReservedSegment 只命中整段 index', () => {
  assert.equal(findReservedSegment('demo.x.index'), 'index')
  assert.equal(findReservedSegment('demo.indexable'), null)
  assert.equal(findReservedSegment('index'), 'index')
})

await test('deriveParent / treeOf / depthOf', () => {
  assert.equal(deriveParent('demo.a.b'), 'demo.a')
  assert.equal(deriveParent('demo'), null)
  assert.equal(treeOf('demo.a.b'), 'demo')
  assert.equal(depthOf('demo.a.b'), 3)
})

await test('moduleFilePath：容器 index.md / 叶子 <last>.md', () => {
  const leaf = moduleFilePath('F:/p/normify-demo', 'demo.order.payment', false).replace(/\\/g, '/')
  const container = moduleFilePath('F:/p/normify-demo', 'demo.order.payment', true).replace(/\\/g, '/')
  assert.ok(leaf.endsWith('/modules/demo/order/payment.md'), leaf)
  assert.ok(container.endsWith('/modules/demo/order/payment/index.md'), container)
})

await test('idFromFilePath 反向映射（index → 父 id）', () => {
  assert.equal(idFromFilePath('modules/demo/index.md'), 'demo')
  assert.equal(idFromFilePath('modules/demo/order/payment.md'), 'demo.order.payment')
  assert.equal(idFromFilePath('renders/demo.json'), null)
  assert.equal(idFromFilePath('modules/demo/order/index.md'), 'demo.order')
})

await test('apiKey：http 大写 METHOD，其它 protocol:path', () => {
  assert.equal(apiKey({ protocol: 'http', method: 'post', path: '/login' }), 'POST /login')
  assert.equal(apiKey({ protocol: 'rpc', path: 'formatMoney' }), 'rpc:formatMoney')
})

await test('slugify 归一化并兜底 project', () => {
  assert.equal(slugify('Hello World!'), 'hello-world')
  assert.equal(slugify('中文'), 'project')
  assert.ok(slugify('a'.repeat(100)).length <= 64)
})

// ---------------------------------------------------------------------------
// 2. frontmatter L1
// ---------------------------------------------------------------------------
suite('frontmatter')

const validFm = () => moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a/run', description: L('跑 a', 'run a') }] })

await test('合法模块通过并返回 Module', () => {
  const r = l1Validate(validFm(), 'unit')
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors.map((e) => e.code)))
  assert.ok(r.module !== null)
  assert.equal(r.module.id, 'demo.a')
})

await test('缺 uid → structure/missing-field', () => {
  const fm = validFm(); delete fm.uid
  const r = l1Validate(fm, 'unit')
  assert.equal(r.module, null)
  assert.ok(r.errors.some((e) => e.code === 'structure/missing-field' && /uid/.test(e.message)))
})

await test('uid 非 8 位 hex → structure/uid-format', () => {
  const fm = validFm(); fm.uid = 'UID00000'
  assert.ok(l1Validate(fm, 'unit').errors.some((e) => e.code === 'structure/uid-format'))
})

await test('parent 与 id 不匹配 → structure/parent-mismatch', () => {
  const fm = validFm(); fm.parent = 'demo.other'
  assert.ok(l1Validate(fm, 'unit').errors.some((e) => e.code === 'structure/parent-mismatch'))
})

await test('未知字段 → structure/unknown-field', () => {
  const fm = validFm(); fm.bogus = 1
  const errors = l1Validate(fm, 'unit').errors
  assert.ok(errors.some((e) => e.code === 'structure/unknown-field'), JSON.stringify(errors.map((e) => e.code)))
})

await test('http API 缺大写 method → api/method-required', () => {
  const fm = validFm(); fm.apis = [{ protocol: 'http', path: '/x', description: L('x', 'x') }]
  assert.ok(l1Validate(fm, 'unit').errors.some((e) => e.code === 'api/method-required'))
})

await test('非 http API 带 method → api/method-forbidden', () => {
  const fm = validFm(); fm.apis = [{ protocol: 'rpc', method: 'GET', path: 'x', description: L('x', 'x') }]
  assert.ok(l1Validate(fm, 'unit').errors.some((e) => e.code === 'api/method-forbidden'))
})

await test('dept kind 非法 → dep/kind-unknown', () => {
  const fm = validFm(); fm.deps = [{ kind: 'nope', to: 'demo.b' }]
  assert.ok(l1Validate(fm, 'unit').errors.some((e) => e.code === 'dep/kind-unknown'))
})

await test('source.path 含 .. → structure/source-path-invalid', () => {
  const fm = validFm(); fm.source = [{ path: 'src/../../etc/passwd' }]
  assert.ok(l1Validate(fm, 'unit').errors.some((e) => e.code === 'structure/source-path-invalid'))
})

await test('description.zh 为空 → structure/description-empty', () => {
  const fm = validFm(); fm.description = { zh: '  ', en: 'x' }
  assert.ok(l1Validate(fm, 'unit').errors.some((e) => e.code === 'structure/description-empty'))
})

await test('name 超长 → structure/name-too-long', () => {
  const fm = validFm(); fm.name = { zh: '名'.repeat(61), en: 'x' }
  assert.ok(l1Validate(fm, 'unit').errors.some((e) => e.code === 'structure/name-too-long'))
})

await test('tags 重复 → structure/tag-duplicate', () => {
  const fm = validFm(); fm.tags = ['a', 'a']
  assert.ok(l1Validate(fm, 'unit').errors.some((e) => e.code === 'structure/tag-duplicate'))
})

await test('active + 非空 source 时 fingerprint=pending 被拒', () => {
  const fm = validFm(); fm.fingerprint = 'pending'
  assert.ok(l1Validate(fm, 'unit').errors.some((e) => e.code === 'structure/fingerprint-invalid'))
})

await test('id 含保留段 → L1 拒绝（structure/id-reserved）', () => {
  const fm = moduleOf('demo.x.index', 'demo.x')
  const codes = l1Validate(fm, 'unit').errors.map((e) => e.code)
  assert.ok(codes.includes('structure/id-reserved'), JSON.stringify(codes))
})

await test('checkSourceEntry / checkApiEntry / checkDepEntry 独立可用', () => {
  const out = []
  assert.equal(checkSourceEntry({ path: 'src/a.ts', line: 3 }, 'w', out), true)
  assert.equal(checkSourceEntry({ path: '/abs.ts' }, 'w', out), false)
  assert.equal(checkApiEntry({ protocol: 'rpc', path: 'x', description: L('x', 'x') }, 'w', out), true)
  assert.equal(checkApiEntry({ protocol: 'nope', path: 'x', description: L('x', 'x') }, 'w', out), false)
  assert.equal(checkDepEntry({ kind: 'call', to: 'demo.b' }, 'w', out), true)
  assert.equal(checkDepEntry({ kind: 'nope', to: 'x' }, 'w', out), false)
})

await test('serializeModule ↔ parseModuleText 往返稳定', () => {
  const module = l1Validate(validFm(), 'unit').module
  const text = serializeModule(module, '正文内容')
  const parsed = parseModuleText(text, 'unit')
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors.map((e) => e.code)))
  assert.ok(parsed.module !== null)
  for (const key of ['uid', 'id', 'parent', 'revision', 'fingerprint'])
    assert.equal(parsed.module[key], module[key], key)
  assert.equal(parsed.module.apis[0].path, 'a/run')
  assert.equal(parsed.body.trim(), '正文内容')
  assert.equal(serializeModule(module, '正文内容'), text, '序列化必须确定性')
})

await test('parseModuleText 拒绝无 frontmatter / 未闭合', () => {
  assert.equal(parseModuleText('没有 frontmatter', 'u').errors[0].code, 'input/no-frontmatter')
  assert.equal(parseModuleText('---\nid: demo\n', 'u').errors[0].code, 'input/unclosed-frontmatter')
})

// ---------------------------------------------------------------------------
// 3. validate L2
// ---------------------------------------------------------------------------
suite('validate')

await test('最小合法树 0 error', async () => {
  const { dir } = await newProject()
  await minimalTree(dir)
  const v = await validateProject(dir, { requireBilingual: true })
  assert.equal(v.errors.length, 0, JSON.stringify(v.errors.map((e) => e.code + ':' + e.message)))
  assert.equal(v.ok, true)
})

await test('依赖环（无 policy.yml 由 L2 内置检查）→ structure/dependency-cycle', async () => {
  const { dir } = await newProject()
  await writeModuleFile(dir, moduleOf('demo', null), '')
  await writeModuleFile(dir, moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }], deps: [{ kind: 'call', to: 'demo.b' }] }), '')
  await writeModuleFile(dir, moduleOf('demo.b', 'demo', { apis: [{ protocol: 'rpc', path: 'b', description: L('b') }], deps: [{ kind: 'call', to: 'demo.a' }] }), '')
  rmSync(join(dir, 'policy.yml'), { force: true })
  const v = await validateProject(dir, { requireBilingual: true })
  assert.ok(v.errors.some((e) => e.code === 'structure/dependency-cycle'), JSON.stringify(v.errors.map((e) => e.code)))
})

await test('叶子缺 apis → api/leaf-missing', async () => {
  const { dir } = await newProject()
  await writeModuleFile(dir, moduleOf('demo', null), '')
  await writeModuleFile(dir, moduleOf('demo.a', 'demo'), '')
  const v = await validateProject(dir, {})
  assert.ok(v.errors.some((e) => e.code === 'api/leaf-missing'))
})

await test('容器带 apis → api/non-leaf（手工落盘，绕过写工具的自动摘除）', async () => {
  const { dir } = await newProject()
  // 直接写盘构造非法状态：根容器带 apis + 一个合法叶子
  const rootWithApis = moduleOf('demo', null, { apis: [{ protocol: 'rpc', path: 'x', description: L('x') }] })
  await writeFileAtomic(join(dir, 'modules/demo/index.md'), serializeModule(rootWithApis, ''))
  await writeFileAtomic(join(dir, 'modules/demo/a.md'), serializeModule(moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }] }), ''))
  const v = await validateProject(dir, {})
  assert.ok(v.errors.some((e) => e.code === 'api/non-leaf'), JSON.stringify(v.errors.map((e) => e.code)))
})

await test('悬空依赖 → dep/target-missing', async () => {
  const { dir } = await newProject()
  await writeModuleFile(dir, moduleOf('demo', null), '')
  await writeModuleFile(dir, moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }], deps: [{ kind: 'call', to: 'demo.missing' }] }), '')
  const v = await validateProject(dir, {})
  assert.ok(v.errors.some((e) => e.code === 'dep/target-missing'))
})

await test('API 键全项目重复 → api/key-duplicate', async () => {
  const { dir } = await newProject()
  await writeModuleFile(dir, moduleOf('demo', null), '')
  for (const id of ['demo.a', 'demo.b'])
    await writeModuleFile(dir, moduleOf(id, 'demo', { apis: [{ protocol: 'rpc', path: 'same/key', description: L('x') }] }), '')
  const v = await validateProject(dir, {})
  assert.ok(v.errors.some((e) => e.code === 'api/key-duplicate'))
})

await test('uid 重复 → structure/uid-duplicate', async () => {
  const { dir } = await newProject()
  const sameUid = '0000beef'
  await writeModuleFile(dir, moduleOf('demo', null), '')
  await writeModuleFile(dir, { ...moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }] }), uid: sameUid }, '')
  await writeModuleFile(dir, { ...moduleOf('demo.b', 'demo', { apis: [{ protocol: 'rpc', path: 'b', description: L('b') }] }), uid: sameUid }, '')
  const v = await validateProject(dir, {})
  assert.ok(v.errors.some((e) => e.code === 'structure/uid-duplicate'))
})

await test('parent 指向不存在的模块（孤儿）→ structure/parent-not-exist', async () => {
  const { dir } = await newProject()
  // 只写子模块、不写父模块：parent 字段仍等于 deriveParent(id)，L1 通过，L2 报孤儿
  await writeModuleFile(dir, moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }] }), '')
  const v = await validateProject(dir, {})
  assert.ok(v.errors.some((e) => e.code === 'structure/parent-not-exist'), JSON.stringify(v.errors.map((e) => e.code)))
})

await test('文件路径与 id 不一致 → structure/file-id-mismatch', async () => {
  const { dir } = await newProject()
  await writeModuleFile(dir, moduleOf('demo', null), '')
  await writeModuleFile(dir, moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }] }), '')
  const src = join(dir, 'modules', 'demo', 'a.md')
  const dst = join(dir, 'modules', 'demo', 'b.md')
  renameSync(src, dst)
  const v = await validateProject(dir, {})
  assert.ok(v.errors.some((e) => e.code === 'structure/file-id-mismatch'), JSON.stringify(v.errors.map((e) => e.code)))
})

await test('缺 policy.yml 只记 warning（不阻断）', async () => {
  const { dir } = await newProject()
  await minimalTree(dir)
  rmSync(join(dir, 'policy.yml'), { force: true })
  const v = await validateProject(dir, {})
  assert.equal(v.ok, true)
  assert.ok(v.warnings.some((w) => w.code === 'policy/missing'))
})

await test('repoRoot 证据校验：source 不存在 → evidence/source-missing', async () => {
  const { root, dir } = await newProject()
  await minimalTree(dir)
  const v = await validateProject(dir, { repoRoot: join(root, 'repo'), requireBilingual: true })
  assert.ok(v.errors.some((e) => e.code === 'evidence/source-missing'), JSON.stringify(v.errors.map((e) => e.code)))
})

// ---------------------------------------------------------------------------
// 4. compile（确定性 + 回执 + fail-closed）
// ---------------------------------------------------------------------------
suite('compile')

await test('产物齐全：tree/outline/api-index/receipt + receipt.sha256', async () => {
  const { dir } = await newProject()
  await minimalTree(dir)
  const r = await buildProject(dir, {})
  assert.equal(r.ok, true, JSON.stringify(r.errors?.map((e) => e.code)))
  for (const f of ['tree.json', 'outline.md', 'api-index.json', 'structure-manifest.json', 'receipt.json', 'receipt.sha256'])
    assert.equal(existsSync(join(dir, f)), true, '缺少产物 ' + f)
})

await test('receipt 不自哈希且 sidecar 与 receipt.json 字节一致', async () => {
  const { dir } = await newProject()
  await minimalTree(dir)
  await buildProject(dir, {})
  const receiptText = readFileSync(join(dir, 'receipt.json'), 'utf8')
  const receipt = JSON.parse(receiptText)
  const sidecar = readFileSync(join(dir, 'receipt.sha256'), 'utf8').trim()
  assert.deepEqual(Object.keys(receipt.artifacts).sort(), ['api-index.json', 'outline.md', 'structure-manifest.json', 'tree.json'])
  assert.equal(receipt.artifacts['receipt.json'], undefined)
  assert.equal(sidecar, sha256Text(receiptText))
  assert.equal(receipt.artifacts['tree.json'].sha256, sha256Text(readFileSync(join(dir, 'tree.json'), 'utf8')))
  assert.equal(receipt.artifacts['structure-manifest.json'].sha256, sha256Text(readFileSync(join(dir, 'structure-manifest.json'), 'utf8')))
})

await test('tree.json 结构确定：两次构建 modules/api_index/edges 完全一致', async () => {
  const { dir } = await newProject()
  await minimalTree(dir)
  await buildProject(dir, {})
  const first = JSON.parse(readFileSync(join(dir, 'tree.json'), 'utf8'))
  const outline1 = readFileSync(join(dir, 'outline.md'), 'utf8')
  const api1 = readFileSync(join(dir, 'api-index.json'), 'utf8')
  await buildProject(dir, {})
  const second = JSON.parse(readFileSync(join(dir, 'tree.json'), 'utf8'))
  assert.deepEqual(second.modules, first.modules)
  assert.deepEqual(second.api_index, first.api_index)
  assert.deepEqual(second.edges, first.edges)
  assert.equal(readFileSync(join(dir, 'outline.md'), 'utf8'), outline1)
  assert.equal(readFileSync(join(dir, 'api-index.json'), 'utf8'), api1)
})

await test('build fail-closed：存在 error 时不产出任何产物', async () => {
  const { dir } = await newProject()
  await writeModuleFile(dir, moduleOf('demo', null), '')
  await writeModuleFile(dir, moduleOf('demo.a', 'demo'), '') // 叶子缺 apis
  rmSync(join(dir, 'tree.json'), { force: true })
  const r = await buildProject(dir, {})
  assert.equal(r.ok, false)
  assert.ok(r.errors.length > 0)
  for (const f of ['tree.json', 'outline.md', 'api-index.json', 'receipt.json'])
    assert.equal(existsSync(join(dir, f)), false, '不应产出 ' + f)
})

// ---------------------------------------------------------------------------
// 5. layout
// ---------------------------------------------------------------------------
suite('layout')

await test('合法渲染数据通过', () => {
  const r = l1ValidateLayout(
    { schema_version: 1, id: 'demo', updated_at: AT, order: ['demo.a', 'demo.b'], mode: 'grid' },
    'demo', ['demo.a', 'demo.b'], childrenSet(), 'unit')
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors.map((e) => e.code)))
  assert.ok(r.layout !== null)
})

await test('order 含非直接子模块 → layout/order-child', () => {
  const r = l1ValidateLayout({ schema_version: 1, id: 'demo', updated_at: AT, order: ['demo.x'] }, 'demo', ['demo.a'], childrenSet(), 'u')
  assert.ok(r.errors.some((e) => e.code === 'layout/order-child'))
})

await test('groups 子模块重复 → layout/group-child-duplicate', () => {
  const r = l1ValidateLayout({
    schema_version: 1, id: 'demo', updated_at: AT, mode: 'groups',
    groups: [
      { id: 'g1', title: L('组1'), children: ['demo.a'] },
      { id: 'g2', title: L('组2'), children: ['demo.a'] },
    ],
  }, 'demo', ['demo.a'], childrenSet(), 'u')
  assert.ok(r.errors.some((e) => e.code === 'layout/group-child-duplicate'))
})

await test('edge_hint 端点非直接子模块 → layout/hint-endpoint', () => {
  const r = l1ValidateLayout({
    schema_version: 1, id: 'demo', updated_at: AT,
    edge_hints: [{ from: 'demo.a', to: 'demo.zzz' }],
  }, 'demo', ['demo.a', 'demo.b'], new Set([edgeKey('demo.a', 'demo.b')]), 'u')
  assert.ok(r.errors.some((e) => e.code === 'layout/hint-endpoint'))
})

await test('serializeLayout 字段顺序稳定', () => {
  const layout = { schema_version: 1, id: 'demo', updated_at: AT, mode: 'grid', order: ['demo.a'] }
  const text = serializeLayout(layout)
  assert.deepEqual(Object.keys(JSON.parse(text)), ['schema_version', 'id', 'updated_at', 'mode', 'order'])
  assert.equal(serializeLayout(layout), text)
})

await test('layoutRelPath / idFromLayoutPath 双向映射', () => {
  assert.equal(layoutRelPath('demo.order.checkout'), 'renders/demo/order/checkout.json')
  assert.equal(idFromLayoutPath('renders/demo/order.json'), 'demo.order')
  assert.equal(idFromLayoutPath('demo.json'), 'demo')
  assert.equal(idFromLayoutPath('renders/index.json'), null)
})

await test('writeLayoutFile / deleteLayoutFile 往返', async () => {
  const { dir } = await newProject()
  await minimalTree(dir)
  const file = await writeLayoutFile(dir, { schema_version: 1, id: 'demo', updated_at: AT, order: ['demo.a', 'demo.b'] })
  assert.equal(file, 'renders/demo.json')
  assert.equal(existsSync(join(dir, 'renders/demo.json')), true)
  assert.equal(await deleteLayoutFile(dir, 'demo'), true)
  assert.equal(existsSync(join(dir, 'renders/demo.json')), false)
})

// ---------------------------------------------------------------------------
// 6. policy
// ---------------------------------------------------------------------------
suite('policy')

const validPolicy = () => l1ValidatePolicy({ schema_version: 1, updated_at: AT, rules: [] }, 'unit')

await test('空规则集通过；默认模板可解析为合法 policy', async () => {
  assert.ok(validPolicy().policy !== null)
  const yaml = await import('yaml')
  const doc = yaml.parse(defaultPolicyTemplate())
  const r = l1ValidatePolicy(doc, 'default')
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors.map((e) => e.code)))
  assert.ok(r.policy.rules.length >= 2)
})

await test('未知规则类型 → policy/rule-type', () => {
  const r = l1ValidatePolicy({ schema_version: 1, updated_at: AT, rules: [{ id: 'x', type: 'nope' }] }, 'u')
  assert.ok(r.errors.some((e) => e.code === 'policy/rule-type'))
})

await test('naming 非法正则 → policy/rule-pattern-invalid', () => {
  const r = l1ValidatePolicy({ schema_version: 1, updated_at: AT, rules: [{ id: 'n', type: 'naming', pattern: '((' }] }, 'u')
  assert.ok(r.errors.some((e) => e.code === 'policy/rule-pattern-invalid'))
})

await test('matchIdPattern：* 单段、** 任意段', () => {
  assert.equal(matchIdPattern('demo.*', 'demo.a'), true)
  assert.equal(matchIdPattern('demo.*', 'demo.a.b'), false)
  assert.equal(matchIdPattern('demo.**', 'demo.a.b'), true)
  assert.equal(matchIdPattern('**', 'demo.a.b'), true)
  assert.equal(matchIdPattern('other.*', 'demo.a'), false)
})

await test('evaluatePolicy forbid-dependency 命中', async () => {
  const { dir } = await newProject()
  await writeModuleFile(dir, moduleOf('demo', null), '')
  await writeModuleFile(dir, moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }], deps: [{ kind: 'call', to: 'demo.b' }] }), '')
  await writeModuleFile(dir, moduleOf('demo.b', 'demo', { apis: [{ protocol: 'rpc', path: 'b', description: L('b') }] }), '')
  const { files, byId } = await loadAllModules(dir)
  const policy = l1ValidatePolicy({ schema_version: 1, updated_at: AT, rules: [
    { id: 'no-a-to-b', type: 'forbid-dependency', from: ['demo.a'], to: ['demo.b'] },
  ] }, 'u').policy
  const diags = evaluatePolicy(policy, { files, byId: new Map(files.map((f) => [f.module.id, f])) })
  assert.ok(diags.some((d) => d.code === 'policy/no-a-to-b'))
})

await test('evaluatePolicy acyclic 检出环；max-depth 检出超深', async () => {
  const { dir } = await newProject()
  await writeModuleFile(dir, moduleOf('demo', null), '')
  await writeModuleFile(dir, moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }], deps: [{ kind: 'call', to: 'demo.b' }] }), '')
  await writeModuleFile(dir, moduleOf('demo.b', 'demo', { apis: [{ protocol: 'rpc', path: 'b', description: L('b') }], deps: [{ kind: 'call', to: 'demo.a' }] }), '')
  const { files, byId } = await loadAllModules(dir)
  const policy = l1ValidatePolicy({ schema_version: 1, updated_at: AT, rules: [
    { id: 'acyclic', type: 'acyclic' },
    { id: 'depth2', type: 'max-depth', maxDepth: 1 },
  ] }, 'u').policy
  const diags = evaluatePolicy(policy, { files, byId: new Map(files.map((f) => [f.module.id, f])) })
  assert.ok(diags.some((d) => d.code === 'policy/acyclic'), JSON.stringify(diags.map((d) => d.code)))
  assert.ok(diags.some((d) => d.code === 'policy/depth2'))
})

await test('policyReference 输出含 6 类规则', () => {
  const text = policyReference()
  for (const t of ['forbid-dependency', 'dependency-direction', 'acyclic', 'max-depth', 'cross-tree', 'naming'])
    assert.ok(text.includes(t), '缺少规则说明 ' + t)
})

// ---------------------------------------------------------------------------
// 7. changes（delete_snapshot / 校验）
// ---------------------------------------------------------------------------
suite('changes')

const changeData = (id, extra = {}) => ({
  schema_version: 1, id,
  title: L('变更 ' + id), status: 'in_progress', intent: L('意图'),
  modules: { create: [], modify: [], delete: [] },
  acceptance: ['验收 1'], revision: { before: null, after: null },
  created_at: AT, updated_at: AT, ...extra,
})

await test('isValidChangeId 文法', () => {
  assert.equal(isValidChangeId('2026-11-03-add-x'), true)
  assert.equal(isValidChangeId('2026-1-3-x'), false)
  assert.equal(isValidChangeId('nope'), false)
})

await test('合法 change 通过 L1', () => {
  const r = l1ValidateChange(changeData('2026-11-03-add-x'), '2026-11-03-add-x', 'u')
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors.map((e) => e.code)))
})

await test('acceptance 含对象 → change/acceptance 且指出第 N 条', () => {
  const r = l1ValidateChange(changeData('2026-11-03-bad', { acceptance: [L('双语对象')] }), '2026-11-03-bad', 'u')
  const d = r.errors.find((e) => e.code === 'change/acceptance')
  assert.ok(d !== undefined)
  assert.match(d.message, /第 1 条/)
})

await test('delete_snapshot 允许已删除的模块（不再死锁）', async () => {
  const { dir } = await newProject()
  await writeModuleFile(dir, moduleOf('demo', null), '')
  await writeModuleFile(dir, moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }] }), '')
  const id = '2026-11-03-del'
  const change = l1ValidateChange(changeData(id, { modules: { create: [], modify: [], delete: ['demo.a'] }, delete_snapshot: ['demo.a'] }), id, 'u')
  assert.ok(change.change !== null)
  await writeChangeFile(dir, change.change)
  // 模拟模块已按变更删除
  rmSync(join(dir, 'modules', 'demo', 'a.md'))
  const { files } = await loadAllModules(dir)
  const r = await validateChanges(dir, new Map(files.map((f) => [f.module.id, f])))
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors.map((e) => e.code + ':' + e.message)))
})

await test('delete 目标既不存在也不在快照 → change/module-missing', async () => {
  const { dir } = await newProject()
  await writeModuleFile(dir, moduleOf('demo', null), '')
  const id = '2026-11-03-del2'
  const change = l1ValidateChange(changeData(id, { modules: { create: [], modify: [], delete: ['demo.gone'] } }), id, 'u')
  await writeChangeFile(dir, change.change)
  const { files } = await loadAllModules(dir)
  const r = await validateChanges(dir, new Map(files.map((f) => [f.module.id, f])))
  assert.ok(r.errors.some((e) => e.code === 'change/module-missing'))
})

await test('verified 必须带 closed_at；未关闭不得有 closed_at', () => {
  const a = l1ValidateChange(changeData('2026-11-03-v', { status: 'verified' }), '2026-11-03-v', 'u')
  assert.ok(a.errors.some((e) => e.code === 'change/verified-closed-at'))
  const b = l1ValidateChange(changeData('2026-11-03-v2', { status: 'in_progress', closed_at: AT }), '2026-11-03-v2', 'u')
  assert.ok(b.errors.some((e) => e.code === 'change/open-closed-at'))
})

await test('writeChangeFile / loadChangeFile 往返', async () => {
  const { dir } = await newProject()
  const id = '2026-11-03-rt'
  const change = l1ValidateChange(changeData(id), id, 'u').change
  const rel = await writeChangeFile(dir, change)
  assert.equal(rel, 'changes/' + id + '.json')
  const loaded = await loadChangeFile(dir, id)
  assert.equal(loaded.error, null)
  assert.equal(loaded.change.id, id)
})

// ---------------------------------------------------------------------------
// 8. atomic（原子写 / 路径安全 / 事务回滚）
// ---------------------------------------------------------------------------
suite('atomic')

await test('writeFileAtomic 写入且不残留临时文件', async () => {
  const root = newRoot()
  const file = join(root, 'a', 'b.txt')
  await writeFileAtomic(file, 'hello')
  assert.equal(readFileSync(file, 'utf8'), 'hello')
  assert.deepEqual(readdirSync(join(root, 'a')), ['b.txt'])
})

await test('writeFileAtomic 覆盖已有文件', async () => {
  const root = newRoot()
  const file = join(root, 'x.txt')
  writeFileSync(file, 'old')
  await writeFileAtomic(file, 'new')
  assert.equal(readFileSync(file, 'utf8'), 'new')
})

await test('writeFileAtomic 失败不残留临时文件', async () => {
  const root = newRoot()
  mkdirSync(join(root, 'dir'))
  await assert.rejects(() => writeFileAtomic(join(root, 'dir'), 'x'))
  assert.deepEqual(readdirSync(root).filter((n) => n.includes('.tmp-')), [])
})

await test('isInside：包含父目录但不容忍前缀误判', () => {
  assert.equal(isInside('F:/p/normify-a', 'F:/p/normify-a/modules'), true)
  assert.equal(isInside('F:/p/normify-a', 'F:/p/normify-a'), true)
  assert.equal(isInside('F:/p/normify-a', 'F:/p/normify-ab'), false)
  assert.equal(isInside('F:/p/normify-a', 'F:/p/other'), false)
})

await test('assertInsideProject 拦截 ../ 越界（security/path-outside-project）', () => {
  const err = throwsWith(() => assertInsideProject('F:/p/normify-a', '../evil.html'), 'security/path-outside-project')
  assert.ok(err.message.includes('越界'))
})

await test('safeOutName：默认值 / 合法名 / 拒绝路径穿越', () => {
  assert.equal(safeOutName(undefined), 'normify.html')
  assert.equal(safeOutName('graph.html'), 'graph.html')
  for (const bad of ['../../x.html', 'a/b.html', 'a\\b.html', '..'])
    throwsWith(() => safeOutName(bad), 'args/invalid-out')
})

await test('isSafeRepoRelative：拒绝绝对/反斜杠/..，接受普通相对路径', () => {
  assert.equal(isSafeRepoRelative('src/core/index.ts'), true)
  for (const bad of ['/etc/passwd', 'C:/x', 'src\\a.ts', '../x', 'a//b', './a'])
    assert.equal(isSafeRepoRelative(bad), false, '应拒绝 ' + bad)
})

await test('isValidDiffSpec：拒绝 git 选项注入，接受 revision/range', () => {
  for (const bad of ['--output=x', '-c', 'HEAD --output=x', 'a b', 'a--b'])
    assert.equal(isValidDiffSpec(bad), false, '应拒绝 ' + JSON.stringify(bad))
  for (const good of ['HEAD', 'main', 'main..HEAD', 'v0.5.5...HEAD', 'HEAD~1'])
    assert.equal(isValidDiffSpec(good), true, '应接受 ' + good)
})

await test('gitChangedFiles 对非法 diffSpec 直接拒绝（不进子进程）', async () => {
  const r = await import('../lib/core/index.js').then((m) => m.gitChangedFiles('/nonexistent-repo', '--output=C:/evil.txt'))
  assert.equal(r.files, null)
  assert.match(String(r.error), /非法/)
})

await test('fingerprintOf 拒绝越界 source.path（按 missing 处理）', async () => {
  const root = newRoot()
  const fp = await fingerprintOf(root, [{ path: '../secret.txt' }])
  assert.equal(fp.hash, null)
  assert.deepEqual(fp.missing, ['../secret.txt'])
})

await test('createProjectIndex / indexFind / indexUpsert 基本行为', async () => {
  const { dir } = await newProject()
  await minimalTree(dir)
  const loaded = await loadAllModules(dir)
  const index = createProjectIndex(loaded)
  assert.ok(indexFind(index, 'demo.a') !== undefined)
  const fake = { module: moduleOf('demo.c', 'demo', { apis: [{ protocol: 'rpc', path: 'c', description: L('c') }] }), body: '', file: 'modules/demo/c.md' }
  const index2 = createProjectIndex({ files: [...loaded.files, fake] })
  assert.ok(indexFind(index2, 'demo.c') !== undefined)
})

// ---------------------------------------------------------------------------
// 9. edit / batch（事务性）
// ---------------------------------------------------------------------------
suite('edit')

await test('batchWrite 全部合法时写入，数量正确', async () => {
  const { dir } = await newProject()
  const r = await batchWrite(dir, [
    { frontmatter: moduleOf('demo', null) },
    { frontmatter: moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }] }) },
  ], 'upsert', {})
  assert.equal(r.ok, true, JSON.stringify(r.errors.map((e) => e.code)))
  assert.equal(r.files.length, 2)
  assert.equal(existsSync(join(dir, 'modules/demo/index.md')), true)
})

await test('batchWrite 一条非法 → 整批原子回滚（磁盘零写入）', async () => {
  const { dir } = await newProject()
  const bad = moduleOf('demo.b', 'demo', { apis: [{ protocol: 'rpc', path: 'b', description: L('b') }] })
  bad.uid = 'NOT-HEX'
  const r = await batchWrite(dir, [
    { frontmatter: moduleOf('demo', null) },
    { frontmatter: moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }] }) },
    { frontmatter: bad },
  ], 'upsert', {})
  assert.equal(r.ok, false)
  const after = await loadAllModules(dir)
  assert.equal(after.files.length, 0, '失败批次不应留下任何模块')
})

await test('patchModule 空补丁报 args/empty-patch；正常补丁生效', async () => {
  const { dir } = await newProject()
  await minimalTree(dir)
  const empty = await patchModule(dir, 'demo.a', {}, {})
  assert.equal(empty.ok, false)
  assert.ok(empty.errors.some((e) => e.code === 'args/empty-patch'))
  const ok = await patchModule(dir, 'demo.a', { tags: ['unit'] }, {})
  assert.equal(ok.ok, true)
  const { files } = await loadAllModules(dir)
  const mod = files.find((f) => f.module.id === 'demo.a').module
  assert.deepEqual(mod.tags, ['unit'])
})

await test('moveModuleTree 级联 id/parent 且迁移渲染数据', async () => {
  const { dir } = await newProject()
  await writeModuleFile(dir, moduleOf('demo', null), '')
  await writeModuleFile(dir, moduleOf('demo.core', 'demo'), '')
  await writeModuleFile(dir, moduleOf('demo.core.a', 'demo.core', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }] }), '')
  await writeLayoutFile(dir, { schema_version: 1, id: 'demo.core', updated_at: AT, order: ['demo.core.a'] })
  const r = await moveModuleTree(dir, 'demo.core', { newId: 'demo.platform' })
  assert.equal(r.ok, true, JSON.stringify(r.errors.map((e) => e.code)))
  assert.equal(existsSync(join(dir, 'modules/demo/platform/index.md')), true)
  assert.equal(existsSync(join(dir, 'modules/demo/platform/a.md')), true)
  const layout = JSON.parse(readFileSync(join(dir, 'renders/demo/platform.json'), 'utf8'))
  assert.equal(layout.id, 'demo.platform')
  assert.deepEqual(layout.order, ['demo.platform.a'])
})

await test('checkProposal 拦截不存在的 parent / 违规依赖', async () => {
  const { dir } = await newProject()
  await minimalTree(dir)
  const badParent = await checkProposal(dir, { modules: [{ id: 'demo.orphan.x', parent: 'demo.nope' }] })
  assert.equal(badParent.ok, false)
  await writeModuleFile(dir, moduleOf('demo.a', 'demo', { apis: [{ protocol: 'rpc', path: 'a', description: L('a') }], deps: [{ kind: 'call', to: 'demo.b' }] }), '')
  const okProposal = await checkProposal(dir, { modules: [], deps: [{ from: 'demo.a', to: 'demo.b' }] })
  assert.equal(okProposal.ok, true, JSON.stringify(okProposal.errors.map((e) => e.code)))
})

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
for (const root of tmpRoots) rmSync(root, { recursive: true, force: true })

const total = passed + failures.length
console.log(`\n=== core-unit: ${passed}/${total} PASS${failures.length > 0 ? `，${failures.length} FAIL` : '（全部通过）'} ===`)
for (const f of failures) {
  console.log(`\nFAIL  ${f.name}\n      ${f.message.split('\n').join('\n      ')}`)
  if (process.env.UNIT_VERBOSE) console.log(f.stack)
}
process.exit(failures.length === 0 ? 0 : 1)
