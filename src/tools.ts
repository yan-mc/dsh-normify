import type { Context } from '@deepseek-ai/cordis'
import type { Diagnostic, Module } from './engine/types.js'
import { DEP_KINDS, PROTOCOLS } from './engine/types.js'
import { fieldReference, l1Validate } from './engine/frontmatter.js'
import { apiKey } from './engine/ids.js'
import { NormifyError, deleteModuleTree, findModuleFile, fingerprintOf, gitChangedFiles, listProjects, loadAllModules, promoteModule, resolveProject, sha256Text, writeModuleFile } from './engine/store.js'
import { validateProject } from './engine/validate.js'
import { buildProject } from './engine/compile.js'
import { renderProject } from './engine/render.js'
import { fmtDiag } from './engine/diag.js'

export interface ToolEnv {
  rootDir: string
  requireBilingual: boolean
}

type Tool = Record<string, unknown>

function str(description: string) { return { type: 'string', description, required: true } }
function strOpt(description: string) { return { type: 'string', description, required: false } }
function numOpt(description: string) { return { type: 'number', description, required: false } }
function boolOpt(description: string) { return { type: 'boolean', description, required: false } }

function params(props: Record<string, unknown>, required: string[] = []) {
  return { type: 'object', properties: props, required }
}

function l10nParam(description: string) {
  return {
    type: 'object',
    description,
    required: true,
    properties: {
      zh: { type: 'string', description: '中文', required: true },
      en: { type: 'string', description: 'English', required: true },
    },
  } as unknown
}

function sourceParam() {
  return {
    type: 'array',
    description: '代码位置证据：仓库内相对路径 + 可选行号',
    required: true,
    items: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'repo 相对 POSIX 路径', required: true },
        line: { type: 'number', description: '起始行', required: false },
        end_line: { type: 'number', description: '结束行', required: false },
      },
      required: ['path'],
    },
  } as unknown
}

function apiParam() {
  return {
    type: 'array',
    description: '本模块全部 API（仅叶子模块允许；protocol: ' + PROTOCOLS.join('|') + '；http 必须带大写 method）',
    required: false,
    items: {
      type: 'object',
      properties: {
        protocol: { type: 'string', description: '协议', required: true },
        method: { type: 'string', description: '仅 http：大写 METHOD', required: false },
        path: { type: 'string', description: 'URL 路径或 topic/队列/表名', required: true },
        description: l10nParam('API 功能简介'),
      },
      required: ['protocol', 'path', 'description'],
    },
  } as unknown
}

function depParam() {
  return {
    type: 'array',
    description: '出向依赖箭头（只存源端；kind: ' + DEP_KINDS.join('|') + '；to 为目标模块 id，可跨树）',
    required: false,
    items: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: '箭头类型', required: true },
        to: { type: 'string', description: '目标模块 id', required: true },
        from_api: { type: 'string', description: '可选：本模块某 API 键（仅叶子）', required: false },
        to_api: { type: 'string', description: '可选：目标模块自身某 API 键', required: false },
        label: l10nParam('箭头标签'),
      },
      required: ['kind', 'to'],
    },
  } as unknown
}

function moduleParams() {
  return params({
    uid: str('8 位小写 hex 随机串（不变标识，全项目唯一）'),
    id: str('路径式 id：小写段点分隔，含树名段 ≤ 8 段，如 demo.order.checkout.payment'),
    parent: str('父模块 id（= id 去掉最后一段）；根模块传 null'),
    name: l10nParam('模块名（≤60 字符）'),
    description: l10nParam('功能介绍（≤500 字符，刻意精炼）'),
    source: sourceParam(),
    revision: str('生成时对应的 40 位 git SHA'),
    updated_at: str('ISO 8601 时间，如 2026-08-30T12:00:00Z'),
    fingerprint: str('source 文件的 SHA-256 指纹（hex）'),
    repository: strOpt('仅根模块：仓库 URL'),
    apis: apiParam(),
    deps: depParam(),
  }, ['uid', 'id', 'parent', 'name', 'description', 'source', 'revision', 'updated_at', 'fingerprint'])
}

function projectParams(_required: boolean) {
  return params({
    project: strOpt('项目 slug（结构数据目录 = normify-<slug>）；也可以直接传结构数据目录绝对路径'),
    dir: strOpt('结构数据目录绝对路径（与 project 二选一）'),
  })
}

function toErrorPayload(error: unknown): { ok: boolean; error: { code: string; message: string; suggestion?: string } } {
  if (error instanceof NormifyError) {
    return { ok: false, error: { code: error.code, message: error.message } }
  }
  if (error instanceof Error) {
    return { ok: false, error: { code: 'internal', message: error.message } }
  }
  return { ok: false, error: { code: 'internal', message: String(error) } }
}

function diagnosticsOut(errors: Diagnostic[], warnings: Diagnostic[]): Record<string, unknown> {
  return {
    ok: errors.length === 0,
    errors: errors.map(fmtDiag),
    warnings: warnings.map(fmtDiag),
    summary: errors.length + ' error / ' + warnings.length + ' warning',
  }
}

interface RegisterFn {
  (key: string, def: Tool, execute: (args: Record<string, unknown>) => Promise<unknown>): void
}

export function registerTools(ctx: Context, env: ToolEnv): void {
  const register: RegisterFn = (key, def, execute) => {
    const tools = (ctx as { tools?: { register?: (def: Tool) => unknown } }).tools
    if (tools === undefined || tools.register === undefined) return
    const behavior = def.behavior as string
    const wrapped = async (rawArgs: unknown) => {
      try {
        const args = (rawArgs ?? {}) as Record<string, unknown>
        const required = (def.parameters as { required?: string[] } | undefined)?.required ?? []
        const missing = required.filter(r => args[r] === undefined || args[r] === null || args[r] === '')
        if (missing.length > 0) {
          return { ok: false, error: { code: 'args/missing', message: '缺少必填参数: ' + missing.join(', ') } }
        }
        return await execute(args)
      } catch (error) {
        return toErrorPayload(error)
      }
    }
    tools.register({
      ...def,
      name: key,
      behavior,
      readOnly: behavior === 'read',
      idempotent: behavior === 'read' || behavior === 'idempotent' || behavior === 'destroy',
      destructive: behavior === 'destroy',
      output: {
        schema: {},
        render: (_args: unknown, value: unknown) => [
          { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
        ],
      },
      execute: wrapped,
    })
  }

  const resolve = (args: Record<string, unknown>, create = false) => resolveProject(env.rootDir, { project: args.project as string | undefined, dir: args.dir as string | undefined }, { create })

  register('normify.tree.list', {
    description: '列出全部结构数据项目（normify-* 目录，含每棵树的根与仓库）。',
    behavior: 'read',
    parameters: params({
      root: strOpt('搜索根目录（默认插件配置的 rootDir，可传工作区绝对路径）'),
    }),
  }, async (args) => {
    const rootDir = typeof args.root === 'string' && args.root.trim() !== '' ? args.root : env.rootDir
    const projects = listProjects(rootDir)
    const out = []
    for (const p of projects) {
      const roots = (await loadAllModules(p.dir)).files.filter(f => f.module.parent === null)
      out.push({
        slug: p.slug,
        dir: p.dir,
        trees: roots.map(r => ({ tree_id: r.module.id, root_uid: r.module.uid, repository: r.module.repository ?? null })),
      })
    }
    return { ok: true, rootDir: env.rootDir, projects: out }
  })

  register('normify.module.get', {
    description: '读取单个模块（frontmatter 字段 + 正文）。',
    behavior: 'read',
    parameters: params({
      id: str('模块 id 或 uid'),
      ...projectParams(true),
    }, ['id']),
  }, async (args) => {
    const proj = await resolve(args)
    const files = (await loadAllModules(proj.dir)).files
    const mf = files.find(f => f.module.id === args.id || f.module.uid === args.id)
    if (mf === undefined) return { ok: false, error: { code: 'module/not-found', message: '模块不存在：' + String(args.id) } }
    const kids = files.filter(f => f.module.parent === mf.module.id).map(f => f.module.id).sort()
    return { ok: true, module: mf.module, children: kids, file: mf.file, body: mf.body }
  })

  register('normify.module.list', {
    description: '列出模块（可按父模块/树过滤），含每个模块的统计。',
    behavior: 'read',
    parameters: params({
      parent: strOpt('父模块 id 或树名（默认全部）'),
      ...projectParams(true),
    }, []),
  }, async (args) => {
    const proj = await resolve(args)
    const files = (await loadAllModules(proj.dir)).files
    const kids = new Map<string, string[]>()
    for (const f of files) {
      if (f.module.parent === null) continue
      const list = kids.get(f.module.parent) ?? []
      list.push(f.module.id)
      kids.set(f.module.parent, list)
    }
    const filter = args.parent as string | undefined
    const rows = files
      .filter(f => filter === undefined || filter === '' || f.module.parent === filter || f.module.id === filter || f.module.id.startsWith(filter + '.'))
      .sort((a, b) => a.module.id.localeCompare(b.module.id))
      .map(f => ({
        id: f.module.id,
        uid: f.module.uid,
        parent: f.module.parent,
        name: f.module.name,
        is_leaf: !kids.has(f.module.id),
        children_count: (kids.get(f.module.id) ?? []).length,
        api_count: f.module.apis?.length ?? 0,
        dep_count: f.module.deps?.length ?? 0,
      }))
    return { ok: true, count: rows.length, modules: rows }
  })

  register('normify.module.upsert', {
    description: '创建/更新一个模块（写时执行 L1 校验；幂等；自动晋升父模块文件形态）。',
    behavior: 'write',
    parameters: params({
      frontmatter: moduleParams(),
      body: strOpt('Markdown 正文（给人类读者的展开介绍，可选）'),
      ...projectParams(true),
    }, ['frontmatter']),
  }, async (args) => {
    const proj = await resolve(args, true)
    const fm = args.frontmatter as Record<string, unknown>
    // parent 允许传 null 字符串
    if (fm.parent === 'null') fm.parent = null
    const { module, errors, warnings } = l1Validate(fm, 'module.upsert')
    if (module === null) {
      return { ok: false, errors: errors.map(fmtDiag), warnings: warnings.map(fmtDiag), summary: errors.length + ' error（未写入）' }
    }
    const result = await writeModuleFile(proj.dir, module, args.body as string ?? '')
    return {
      ok: true,
      file: result.file,
      promoted: result.promoted,
      l1: { errors: errors.map(fmtDiag), warnings: warnings.map(fmtDiag) },
      hint: '写入完成。请继续创作其它模块；全部完成后运行 normify.validate 做全项目校验（L2），再 normify.build。',
    }
  })

  register('normify.module.delete', {
    description: '删除模块及其整棵子树（含悬空边预警清单，供后续修复）。',
    behavior: 'destroy',
    parameters: params({
      id: str('要删除的模块 id'),
      ...projectParams(true),
    }, ['id']),
  }, async (args) => {
    const proj = await resolve(args)
    const id = String(args.id)
    // 悬空边预警：全项目扫描指向该子树任何模块的箭头
    const before = (await loadAllModules(proj.dir)).files
    const affected = new Set<string>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const f of before) {
        if (f.module.parent !== null && affected.has(f.module.parent) && !affected.has(f.module.id)) {
          affected.add(f.module.id)
          grew = true
        }
      }
    }
    const dangling = before
      .filter(f => !affected.has(f.module.id))
      .flatMap(f => (f.module.deps ?? []).filter(d => affected.has(d.to)).map(d => ({ from: f.module.id, kind: d.kind, to: d.to })))
    const result = await deleteModuleTree(proj.dir, id)
    return {
      ok: true,
      deleted: result.deleted,
      demoted: result.demoted,
      dangling_edges: dangling,
      hint: dangling.length > 0 ? '存在悬空箭头（已列出）：请用 normify.module.upsert 修正或删除引用方的 deps，否则 normify.validate 将报错。' : '无悬空边。',
    }
  })

  register('normify.module.promote', {
    description: '把叶子模块晋升为容器（文件 x.md → x/index.md；为它创建子模块前调用）。',
    behavior: 'write',
    parameters: params({
      id: str('叶子模块 id'),
      ...projectParams(true),
    }, ['id']),
  }, async (args) => {
    const proj = await resolve(args)
    const result = await promoteModule(proj.dir, String(args.id))
    return { ok: true, file: result.file, hint: '晋升完成。现在可以为它创建子模块（子模块 parent 指向该 id）。' }
  })

  register('normify.validate', {
    description: '全项目校验（L2，零容忍）：结构/叶子/API/边/多树/文件映射/仓库证据。返回全部诊断（含 subject/evidence/supportedFixes）。',
    behavior: 'read',
    parameters: params({
      repoRoot: strOpt('仓库根目录（提供则校验 source 存在性与 fingerprint 一致性）'),
      ...projectParams(true),
    }, []),
  }, async (args) => {
    const proj = await resolve(args)
    const v = await validateProject(proj.dir, { repoRoot: args.repoRoot as string | undefined, requireBilingual: env.requireBilingual })
    return diagnosticsOut(v.errors, v.warnings)
  })

  register('normify.build', {
    description: '校验并编译：产出 tree.json / outline.md / api-index.json / receipt.json（含 SHA-256 冻结）。任何 error 不产产物。',
    behavior: 'idempotent',
    parameters: params({
      repoRoot: strOpt('仓库根目录（启用证据校验）'),
      ...projectParams(true),
    }, []),
  }, async (args) => {
    const proj = await resolve(args)
    const b = await buildProject(proj.dir, { repoRoot: args.repoRoot as string | undefined, requireBilingual: env.requireBilingual })
    if (!b.ok) {
      return { ok: false, errors: b.errors.map(fmtDiag), warnings: b.warnings.map(fmtDiag), summary: b.errors.length + ' error（未产出任何产物）' }
    }
    return { ok: true, receipt: b.receipt, warnings: b.warnings.map(fmtDiag), hint: '编译成功。可运行 normify.render 生成交互式 HTML。' }
  })

  register('normify.sync', {
    description: '增量再生成计划器（只读）：git diff → 脏子树定位 → 返回受影响/待复核/漂移模块清单，供 AI 按清单局部重建。',
    behavior: 'read',
    parameters: params({
      repoRoot: str('仓库根目录'),
      diff: strOpt('git diff 范围（默认 HEAD）'),
      ...projectParams(true),
    }, ['repoRoot']),
  }, async (args) => {
    const proj = await resolve(args)
    const repoRoot = String(args.repoRoot)
    const diff = args.diff as string | undefined
    const changed = gitChangedFiles(repoRoot, diff ?? '')
    if (changed.files === null) {
      return { ok: false, error: { code: 'sync/git-failed', message: changed.error ?? 'git 不可用' } }
    }
    const files = (await loadAllModules(proj.dir)).files
    const affected = files.filter(f => f.module.source.some(s => changed.files!.some(cf => cf === s.path || cf.startsWith(s.path + '/'))))
    const affectedSet = new Set(affected.map(f => f.module.id))
    const toReview = new Set<string>()
    for (const f of affected) {
      let p = f.module.parent
      while (p !== null) {
        toReview.add(p)
        const pf = files.find(x => x.module.id === p)
        p = pf?.module.parent ?? null
      }
    }
    const drift: string[] = []
    for (const f of affected) {
      const fp = await fingerprintOf(repoRoot, f.module.source)
      if (fp.hash !== null && fp.hash !== f.module.fingerprint) drift.push(f.module.id)
    }
    return {
      ok: true,
      changed_files: changed.files.slice(0, 500),
      changed_count: changed.files.length,
      affected: affected.map(f => f.module.id),
      to_review: [...toReview],
      drift_fingerprints: drift,
      plan: '按深度从深到浅重建 affected 模块（重读代码：增删 API、更新介绍、必要时拆分）；to_review 的祖先只复核介绍与统计。修复后 normify.validate + normify.build 必须 0 error。',
    }
  })

  register('normify.search', {
    description: '跨 id/名称/介绍/API 检索结构数据。',
    behavior: 'read',
    parameters: params({
      query: str('搜索关键词'),
      topK: numOpt('返回条数（默认 20）'),
      ...projectParams(true),
    }, ['query']),
  }, async (args) => {
    const proj = await resolve(args)
    const q = String(args.query).toLowerCase()
    const topK = typeof args.topK === 'number' ? args.topK : 20
    const files = (await loadAllModules(proj.dir)).files
    const hits: { id: string; name: string; snippet: string; api?: string }[] = []
    for (const f of files) {
      const m = f.module
      const hay = (m.id + ' ' + m.name.zh + ' ' + m.name.en + ' ' + m.description.zh + ' ' + m.description.en).toLowerCase()
      if (hay.includes(q)) {
        hits.push({ id: m.id, name: m.name.zh + ' / ' + m.name.en, snippet: m.description.zh.slice(0, 100) })
      }
      for (const a of m.apis ?? []) {
        const key = apiKey(a)
        const ahay = (key + ' ' + a.description.zh + ' ' + a.description.en).toLowerCase()
        if (ahay.includes(q)) {
          hits.push({ id: m.id, name: m.name.zh + ' / ' + m.name.en, snippet: a.description.zh.slice(0, 100), api: key })
        }
      }
    }
    return { ok: true, count: hits.length, results: hits.slice(0, topK) }
  })

  register('normify.deps.find', {
    description: '反查"谁依赖我"：列出所有指向指定模块（或其 API）的箭头（含跨树），删除/改名前的安全网。',
    behavior: 'read',
    parameters: params({
      to: str('目标模块 id'),
      ...projectParams(true),
    }, ['to']),
  }, async (args) => {
    const proj = await resolve(args)
    const target = String(args.to)
    const files = (await loadAllModules(proj.dir)).files
    const rows = files.flatMap(f => (f.module.deps ?? [])
      .filter(d => d.to === target || d.to.startsWith(target + '.'))
      .map(d => ({ from: f.module.id, kind: d.kind, to: d.to, from_api: d.from_api ?? null, to_api: d.to_api ?? null })))
    return { ok: true, target, count: rows.length, references: rows }
  })

  register('normify.outline', {
    description: '仅重建 outline.md 派生索引（不重新编译 tree.json）。',
    behavior: 'idempotent',
    parameters: params({
      ...projectParams(true),
    }, []),
  }, async (args) => {
    const proj = await resolve(args)
    const b = await buildProject(proj.dir, { requireBilingual: env.requireBilingual })
    if (!b.ok) {
      return { ok: false, errors: b.errors.map(fmtDiag), summary: 'outline 未更新（存在 error）' }
    }
    return { ok: true, hint: 'outline.md 已重建（随 build 一并更新）。' }
  })

  register('normify.render', {
    description: '把 tree.json 渲染成单文件交互式 HTML（逐层下钻/悬停介绍/深链接/双语切换/多树/API 聚合）。需先 normify.build。',
    behavior: 'idempotent',
    parameters: params({
      out: strOpt('输出文件名（默认 normify.html，写在结构数据目录下）'),
      ...projectParams(true),
    }, []),
  }, async (args) => {
    const proj = await resolve(args)
    const r = await renderProject(proj.dir, { out: args.out as string | undefined })
    if (!r.ok) return { ok: false, errors: r.errors.map(fmtDiag) }
    return {
      ok: true,
      html: r.htmlPath,
      bytes: r.bytes,
      sha256: r.sha256,
      stats: r.summary?.stats ?? null,
      hint: 'HTML 已生成。浏览器打开后：点击模块下钻；悬停看介绍；?lang=en 或 ?lang=zh 切换语言；#module=<id>、#api=<key>、#view=outline 深链直达。',
    }
  })

  register('normify.help', {
    description: 'Normify 模块字段速查（生成器写模块时的字段规范）。',
    behavior: 'read',
    parameters: params({}),
  }, async () => {
    return { ok: true, reference: fieldReference() }
  })
}
