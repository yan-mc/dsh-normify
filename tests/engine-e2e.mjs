// engine e2e：结构数据全链路（写入 → L2 校验 → 编译 → 渲染）+ 负例。
// 直接调用 lib/engine/*，不经过 dsh 工具层与 profile，便于在任意环境复跑。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import { writeModuleFile } from '../lib/engine/store.js'
import { writeLayoutFile } from '../lib/engine/layout.js'
import { l1Validate } from '../lib/engine/frontmatter.js'
import { validateProject } from '../lib/engine/validate.js'
import { buildProject } from '../lib/engine/compile.js'
import { renderProject } from '../lib/engine/render.js'
import { fmtDiag } from '../lib/engine/diag.js'

const REV = 'e2e0000000000000000000000000000000000000'
const AT = new Date().toISOString()

function mod(id, parent, zhName, enName, zhDesc, extra = {}) {
  return {
    uid: createHash('md5').update('normify-e2e:' + id).digest('hex').slice(0, 8),
    id,
    parent,
    name: { zh: zhName, en: enName },
    description: { zh: zhDesc, en: zhDesc },
    source: [{ path: 'src/' + id.split('.').slice(1).join('/') + '.ts' }],
    revision: REV,
    updated_at: AT,
    fingerprint: '0'.repeat(64),
    ...extra,
  }
}

const work = mkdtempSync(join(tmpdir(), 'normify-engine-e2e-'))
const dir = join(work, 'normify-demo-repo')

async function main() {
  // ---- 建树：两棵树（demo / helper-lib），8 模块，叶子带 API，含跨树箭头 ----
  await writeModuleFile(dir, mod('demo', null, '演示项目', 'Demo', '演示用结构树。', { repository: 'https://example.com/demo' }), '')
  await writeModuleFile(dir, mod('demo.auth', 'demo', '鉴权', 'Auth', '登录与令牌校验。', {
    apis: [{ protocol: 'http', method: 'POST', path: '/login', description: { zh: '登录', en: 'Login' } }],
  }), '')
  await writeModuleFile(dir, mod('demo.order', 'demo', '订单', 'Order', '订单域。'), '')
  await writeModuleFile(dir, mod('demo.order.checkout', 'demo.order', '结算', 'Checkout', '结算流程。', {
    deps: [{ kind: 'reference', to: 'demo.auth' }],
  }), '')
  await writeModuleFile(dir, mod('demo.order.checkout.invoice', 'demo.order.checkout', '发票', 'Invoice', '发票开具。', {
    apis: [
      { protocol: 'http', method: 'POST', path: '/invoice', description: { zh: '开票', en: 'Issue invoice' } },
      { protocol: 'mysql', path: 'invoices', description: { zh: '发票表', en: 'Invoice table' } },
    ],
  }), '')
  await writeModuleFile(dir, mod('demo.order.checkout.payment', 'demo.order.checkout', '支付', 'Payment', '支付渠道编排。', {
    apis: [
      { protocol: 'http', method: 'POST', path: '/pay', description: { zh: '发起支付', en: 'Start payment' } },
      { protocol: 'amqp', path: 'payment.settled', description: { zh: '支付完成事件', en: 'Payment settled event' } },
    ],
    deps: [{ kind: 'call', to: 'helper-lib.utils' }],
  }), '')
  await writeModuleFile(dir, mod('helper-lib', null, '工具库', 'Helper Lib', '被复用的工具库。', { repository: 'https://example.com/helper' }), '')
  await writeModuleFile(dir, mod('helper-lib.utils', 'helper-lib', '通用工具', 'Utils', '通用工具函数。', {
    // 故意给两个 source：触发 structure/leaf-too-coarse 提示（warning，不阻断）
    source: [{ path: 'src/utils/a.ts' }, { path: 'src/utils/b.ts' }],
    apis: [
      { protocol: 'rpc', path: 'formatMoney', description: { zh: '金额格式化', en: 'Format money' } },
      { protocol: 'rpc', path: 'retry', description: { zh: '重试', en: 'Retry' } },
    ],
  }), '')

  // ---- 渲染数据：只给「有 ≥2 个子模块」的容器写，避免 layout/missing ----
  const layouts = [
    ['demo', ['demo.auth', 'demo.order'], [{ id: 'core', title: { zh: '核心', en: 'Core' }, children: ['demo.auth', 'demo.order'] }]],
    ['demo.order.checkout', ['demo.order.checkout.invoice', 'demo.order.checkout.payment'], null],
  ]
  for (const [id, order, groups] of layouts) {
    const layout = { schema_version: 1, id, updated_at: new Date().toISOString(), order, reading: { zh: '左 → 右', en: 'Left → right' } }
    if (groups) layout.groups = groups
    await writeLayoutFile(dir, layout)
  }

  const files = await listFiles(dir)
  console.log('=== 模块文件清单 ===')
  for (const f of files) console.log('  ' + f)

  console.log('\n=== L2 校验 ===')
  const v = await validateProject(dir, { requireBilingual: true })
  console.log('ok: ' + v.ok + ' | errors: ' + v.errors.length + ' | warnings: ' + v.warnings.length)
  for (const e of v.errors) console.log('  ERR  ' + e.code + ' ' + fmtDiag(e))
  for (const w of v.warnings) console.log('  WARN ' + w.code)
  assert(v.ok && v.errors.length === 0, 'L2 校验应 0 error')

  console.log('\n=== 编译 ===')
  const b = await buildProject(dir, {})
  assert(b.ok, '编译应成功')
  console.log('build ok: ' + b.ok + ' | receipt stats: ' + JSON.stringify(b.receipt.stats))

  console.log('\n=== 渲染 ===')
  const r = await renderProject(dir, {})
  assert(r.ok, '渲染应成功')
  console.log('render ok: ' + r.ok + ' | path: ' + r.htmlPath + ' | bytes: ' + r.bytes)

  console.log('\n=== 负例：parent 错位应被 L1 拒绝 ===')
  const bad = l1Validate({ ...mod('demo.auth', 'demo.order', '鉴权', 'Auth', 'x') }, 'e2e')
  console.log('L1 module: ' + bad.module + ' | errors: ' + JSON.stringify(bad.errors.map(e => e.code)))
  assert(bad.module === null && bad.errors.some(e => e.code === 'structure/parent-mismatch'), 'parent 错位应被拒绝')

  console.log('\n=== engine e2e PASS ===')
}

async function listFiles(projectDir) {
  const { readdirSync, statSync } = await import('node:fs')
  const out = []
  const walk = (d, base) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p, join(base, e))
      else if (e.endsWith('.md')) out.push(join(base, e).split(String.fromCharCode(92)).join('/'))
    }
  }
  walk(join(projectDir, 'modules'), '')
  return out.sort()
}

function assert(cond, msg) {
  if (!cond) { console.error('断言失败: ' + msg); process.exit(1) }
}

try {
  await main()
} finally {
  rmSync(work, { recursive: true, force: true })
}
