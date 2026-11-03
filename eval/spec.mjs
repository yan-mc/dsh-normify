/**
 * eval/spec.mjs — 评测 fixture 的确定性规格 + 任务集 + ground truth（全部由本脚本计算，不手写答案）
 *
 * 设计要点：
 *   - 纯函数、零随机：所有 uid/文件/依赖/任务都由固定 hash 派生，同 SPEC_VERSION 下字节级稳定。
 *   - 任务 4 类：locate（哪个模块拥有某 API）/ impact（谁依赖我 或 我依赖谁）/
 *     list（子树叶子、planned 模块）/ drift（某文件变更影响哪些模块）。
 *   - ground truth 由 modules 图直接推导（脚本计算），与 fixture 落盘结果同源。
 */

export const SPEC_VERSION = 'v2'
const AT = '2026-01-01T00:00:00.000Z'
const REV = 'a'.repeat(40)
const FP = 'b'.repeat(64)

function hash(s) {
  // FNV-1a 32bit（确定性、无 crypto 依赖差异）
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}
function hex8(seed) {
  const a = hash('uid:' + seed).toString(16).padStart(8, '0')
  return a.slice(0, 8)
}
const L = (zh, en) => ({ zh, en })
const mod = (id, parent, extra = {}) => ({
  uid: hex8(id), id, parent,
  name: L(id.split('.').slice(-1)[0], id.split('.').slice(-1)[0]),
  description: L('模块 ' + id, 'Module ' + id),
  source: extra.source ?? [{ path: 'src/' + id.split('.').join('/') + '.ts' }],
  revision: REV, updated_at: AT,
  fingerprint: extra.state === 'planned' ? 'pending' : FP,
  ...extra,
})

/** 叶子模块分配到若干组，组是容器；树根是容器 */
const TREES = [
  { id: 'svc', groups: 5, leaves: 9, small: [2, 3] },
  { id: 'web', groups: 4, leaves: 7, small: [3] },
  { id: 'lib', groups: 4, leaves: 7, small: [2] },
]

export function buildModules() {
  const modules = []
  for (const t of TREES) {
    modules.push(mod(t.id, null, { repository: 'https://example.invalid/' + t.id }))
    for (let g = 0; g < t.groups; g++) {
      const gid = t.id + '.g' + g
      modules.push(mod(gid, t.id))
      for (let m = 0; m < t.leaves; m++) {
        const lid = gid + '.m' + m
        modules.push(mod(lid, gid, { apis: [] }))
      }
    }
    // 小容器：2..3 个叶子（用于"某子树叶子"类任务）
    for (let si = 0; si < (t.small ?? []).length; si++) {
      const gid = t.id + '.s' + si
      modules.push(mod(gid, t.id))
      for (let m = 0; m < t.small[si]; m++) modules.push(mod(gid + '.m' + m, gid, { apis: [] }))
    }
  }
  // 生命周期：每树 2 个 planned（无 source、fingerprint pending）+ lib 4 个 deprecated（有 replacement）
  const plannedIds = new Set(['svc.g0.m0', 'svc.g0.m1', 'web.g0.m0', 'web.g0.m1', 'lib.g0.m0', 'lib.g0.m1'])
  let deprecated = 0
  for (const m of modules) {
    if (plannedIds.has(m.id)) {
      m.state = 'planned'
      m.source = []
    }
  }
  const libLeaves = modules.filter((m) => m.id.startsWith('lib.') && m.id.split('.').length === 3 && m.state !== 'planned')
  for (const m of libLeaves.slice(-4)) {
    if (deprecated >= 4) break
    m.state = 'deprecated'
    m.replacement = libLeaves[0].id !== m.id ? libLeaves[0].id : libLeaves[1].id
    deprecated++
  }
  // API：所有非 planned 叶子 2 条（http GET + rpc），全局唯一
  for (const m of modules) {
    if (m.parent === null || m.parent.split('.').length !== 2) continue // 仅叶子（parent 是 group）
    if (m.state === 'planned') {
      m.apis = [{ protocol: 'rpc', path: m.id.replace(/\./g, '/') + '/planned-op', description: L('计划接口', 'planned api') }]
      continue
    }
    m.apis = [
      { protocol: 'http', method: 'GET', path: '/api/' + m.id.replace(/\./g, '/') + '/read', description: L('读取 ' + m.id, 'read ' + m.id) },
      { protocol: 'rpc', path: m.id.replace(/\./g, '/') + '/op', description: L('操作 ' + m.id, 'op ' + m.id) },
    ]
  }
  // deps：确定性指向"更早"的叶子（全局序号更小 ⇒ 无环），含跨树
  modules.forEach((m, idx) => {
    if (m.parent === null || m.parent.split('.').length !== 2 || m.state === 'planned') return
    const h = hash('deps:' + m.id)
    const n = h % 3 // 0..2
    const deps = []
    for (let k = 0; k < n; k++) {
      const target = modules[(h + k * 37) % idx]
      if (target === undefined || target.id === m.id) continue
      if (target.parent === null || target.parent.split('.').length !== 2) continue
      if (deps.some((d) => d.to === target.id)) continue
      deps.push({ kind: k === 0 ? 'call' : 'reference', to: target.id })
    }
    if (deps.length > 0) m.deps = deps
  })
  return modules
}

/** 源码骨架：每个 active/deprecated 叶子一个文件（含 API 字符串，供 grep 基线检索） */
export function buildSourceFiles(modules) {
  const files = new Map()
  for (const m of modules) {
    for (const s of m.source) {
      if (files.has(s.path)) continue
      const lines = [
        '// ' + m.id + ' — ' + m.description.zh,
        ...(m.apis ?? []).map((a) => '// endpoint: ' + (a.protocol === 'http' ? a.method + ' ' + a.path : a.protocol + ':' + a.path)),
        ...(m.deps ?? []).map((d) => '// depends on: ' + d.to),
        'export const id = ' + JSON.stringify(m.id) + '',
        'export function main() { return ' + JSON.stringify(m.name.zh) + ' }',
        '',
      ]
      files.set(s.path, lines.join('\n'))
    }
  }
  return files
}

/** 由模块图推导任务集（ground truth 全部脚本计算） */
export function buildTasks(modules) {
  const byId = new Map(modules.map((m) => [m.id, m]))
  const children = new Map()
  for (const m of modules) {
    if (m.parent === null) continue
    const list = children.get(m.parent) ?? []
    list.push(m.id)
    children.set(m.parent, list)
  }
  const leavesUnder = (scope) => {
    const out = []
    const walk = (id) => {
      const kids = children.get(id) ?? []
      if (kids.length === 0) { out.push(id); return }
      for (const k of kids) walk(k)
    }
    walk(scope)
    return out
  }
  const descendants = (scope) => {
    const out = []
    const walk = (id) => {
      for (const k of children.get(id) ?? []) { out.push(k); walk(k) }
    }
    walk(scope)
    return out
  }
  const tasks = []
  const apiOwners = []
  for (const m of modules) {
    if (m.state === 'planned') continue // locate 任务只用已落地模块的 API（避免"计划接口"）
    for (const a of m.apis ?? [])
      apiOwners.push({ key: a.protocol === 'http' ? a.method + ' ' + a.path : a.protocol + ':' + a.path, path: a.path, owner: m.id })
  }

  // 1) locate：6 条（3 棵树轮转，http 与 rpc 混合，owner 互不重复）
  const locatePicks = []
  const byTree = new Map()
  for (const e of apiOwners) {
    const tree = e.owner.split('.')[0]
    const list = byTree.get(tree) ?? []
    list.push(e)
    byTree.set(tree, list)
  }
  for (const [tree, list] of [...byTree.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const pickedOwners = new Set()
    for (const entry of list) {
      if (pickedOwners.size >= 2) break
      if (pickedOwners.has(entry.owner)) continue
      pickedOwners.add(entry.owner)
      locatePicks.push(entry.owner)
      tasks.push({
        id: 'locate-' + (tasks.length + 1),
        kind: 'locate',
        query: entry.path, // 用 URL path / rpc path 作为检索串
        apiKey: entry.key,
        expected: [entry.owner],
        params: { apiPath: entry.path },
        prompt: '哪个模块拥有 API ' + entry.key + '？',
      })
    }
  }

  // 2) impact-in：谁依赖 X（直连，2..3 个依赖方）；6 条
  const dependents = new Map()
  for (const m of modules)
    for (const d of m.deps ?? []) {
      const list = dependents.get(d.to) ?? []
      list.push(m.id)
      dependents.set(d.to, list)
    }
  const impactInCandidates = [...dependents.entries()].filter(([, list]) => list.length >= 1 && list.length <= 3)
    .sort((a, b) => a[0].localeCompare(b[0]))
  // 跨树优先
  const cross = impactInCandidates.filter(([to, list]) => list.some((from) => from.split('.')[0] !== to.split('.')[0]))
  const impactInPicks = [...cross.slice(0, 3), ...impactInCandidates.slice(0, 3)]
  const seenIn = new Set()
  for (const [to] of impactInPicks) {
    if (seenIn.has(to) || tasks.filter((t) => t.kind === 'impact-in').length >= 6) continue
    seenIn.add(to)
    tasks.push({
      id: 'impact-in-' + (tasks.length + 1),
      kind: 'impact-in',
      query: to,
      expected: [...dependents.get(to)].sort(),
      params: { target: to },
      prompt: '哪些模块直接依赖 ' + to + '？',
    })
  }

  // 3b) impact-transitive：谁（隔一跳）间接依赖 X（取 depth-2 集合，2..3 个）；3 条
  const reverse = new Map()
  for (const m of modules)
    for (const d of m.deps ?? []) {
      const list = reverse.get(d.to) ?? []
      list.push(m.id)
      reverse.set(d.to, list)
    }
  const transitives = []
  for (const m of modules) {
    if (m.state === 'planned') continue
    if (m.parent !== null && m.parent.split('.').length !== 2) continue
    const d1 = reverse.get(m.id) ?? []
    const d2 = new Set()
    for (const mid of d1)
      for (const up of reverse.get(mid) ?? []) if (up !== m.id && !d1.includes(up)) d2.add(up)
    if (d2.size >= 2 && d2.size <= 3) transitives.push({ id: m.id, expected: [...d2].sort() })
  }
  transitives.sort((a, b) => a.id.localeCompare(b.id))
  for (const t of transitives.slice(0, 3)) {
    tasks.push({
      id: 'impact-transitive-' + (tasks.length + 1),
      kind: 'impact-transitive',
      query: t.id,
      expected: t.expected,
      params: { target: t.id },
      prompt: '哪些模块（隔一跳）间接依赖 ' + t.id + '？',
    })
  }

  // 3) impact-out：X 依赖谁（1..3 个目标）；4 条
  const outPicks = modules.filter((m) => (m.deps ?? []).length >= 1 && (m.deps ?? []).length <= 3)
    .sort((a, b) => a.id.localeCompare(b.id))
  for (const m of outPicks.slice(0, 4)) {
    tasks.push({
      id: 'impact-out-' + (tasks.length + 1),
      kind: 'impact-out',
      query: m.id,
      expected: [...new Set(m.deps.map((d) => d.to))].sort(),
      params: { target: m.id },
      prompt: m.id + ' 依赖哪些模块？',
    })
  }

  // 4) list-leaves：某容器子树内的叶子模块（2..3 个）；4 条
  const containers = modules.filter((m) => (children.get(m.id) ?? []).length > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
  let leafTasks = 0
  for (const c of containers) {
    if (leafTasks >= 4) break
    const leaves = leavesUnder(c.id)
    if (leaves.length < 2 || leaves.length > 3) continue
    leafTasks++
    tasks.push({
      id: 'list-leaves-' + (tasks.length + 1),
      kind: 'list-leaves',
      query: c.id,
      expected: leaves.sort(),
      params: { scope: c.id },
      prompt: '子树 ' + c.id + ' 下有哪些叶子模块？',
    })
  }

  // 5) list-planned：某树内 planned 模块（2..3 个）；3 条
  let plannedTasks = 0
  for (const t of TREES) {
    const planned = modules.filter((m) => m.state === 'planned' && m.id.startsWith(t.id + '.')).map((m) => m.id).sort()
    if (planned.length < 2 || planned.length > 3) continue
    plannedTasks++
    tasks.push({
      id: 'list-planned-' + (tasks.length + 1),
      kind: 'list-planned',
      query: t.id,
      expected: planned,
      params: { scope: t.id },
      prompt: '树 ' + t.id + ' 下有哪些 planned 模块？',
    })
    if (plannedTasks >= 3) break
  }

  // 6) drift：某源文件变更影响哪些模块（含该文件 source 的模块，1..2 个）；4 条
  const fileOwners = new Map()
  for (const m of modules)
    for (const s of m.source) {
      const list = fileOwners.get(s.path) ?? []
      list.push(m.id)
      fileOwners.set(s.path, list)
    }
  const leafIds = new Set(modules.filter((m) => m.parent !== null && (children.get(m.parent) ?? []).length > 0 && (children.get(m.id) ?? []).length === 0).map((m) => m.id))
  const driftFiles = [...fileOwners.entries()]
    .filter(([, list]) => list.length >= 1 && list.length <= 2 && list.every((id) => leafIds.has(id)))
    .sort((a, b) => a[0].localeCompare(b[0]))
  const driftPicks = []
  const driftTrees = new Set()
  for (const [file] of driftFiles) {
    const tree = fileOwners.get(file)[0].split('.')[0]
    if (driftPicks.length >= 4) break
    if (driftTrees.has(tree)) continue // 每棵树最多 1 条
    driftTrees.add(tree)
    driftPicks.push(file)
  }
  // 不足 4 条时补足（允许同树）
  for (const [file] of driftFiles) {
    if (driftPicks.length >= 4) break
    if (!driftPicks.includes(file)) driftPicks.push(file)
  }
  for (const file of driftPicks) {
    tasks.push({
      id: 'drift-' + (tasks.length + 1),
      kind: 'drift',
      query: file,
      expected: [...fileOwners.get(file)].sort(),
      params: { file },
      prompt: '源文件 ' + file + ' 变更后，哪些模块需要同步？',
    })
  }
  return tasks
}

export const DRIFT_FILES = null // 由 buildSpec 计算后挂上

export function buildSpec() {
  const modules = buildModules()
  const files = buildSourceFiles(modules)
  const tasks = buildTasks(modules)
  // 漂移任务用的"已修改文件"：取 drift 任务涉及的文件（fixture 在 commit 后修改它们）
  const driftFiles = [...new Set(tasks.filter((t) => t.kind === 'drift').flatMap((t) => [t.params.file]))]
  return {
    version: SPEC_VERSION,
    modules,
    files,
    tasks,
    driftFiles,
    counts: {
      modules: modules.length,
      leaves: modules.filter((m) => (m.apis ?? []).length > 0 && m.parent !== null && m.parent.split('.').length === 2).length,
      planned: modules.filter((m) => m.state === 'planned').length,
      deprecated: modules.filter((m) => m.state === 'deprecated').length,
      apis: modules.reduce((n, m) => n + (m.apis ?? []).length, 0),
      deps: modules.reduce((n, m) => n + (m.deps ?? []).length, 0),
      trees: TREES.length,
      tasks: tasks.length,
      kinds: tasks.reduce((acc, t) => { acc[t.kind] = (acc[t.kind] ?? 0) + 1; return acc }, {}),
    },
  }
}
