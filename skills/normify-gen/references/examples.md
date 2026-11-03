# 示例（examples）

> SKILL 的参考文件之一。字段规则见 [format.md](format.md)；这些示例可直接改后用 `normify_module_upsert` 写入。

## 1. 完整模块文件（叶子）

`modules/demo/order/checkout/payment.md`（根 id = `demo`）：

```markdown
---
uid: 8f3a9c2e
id: demo.order.checkout.payment
parent: demo.order.checkout
revision: 9f1a1cf0b6e9e2a3d4c5b6a7f8e9d0c1b2a3f4e5
updated_at: 2026-11-03T12:00:00Z
fingerprint: e3b0c44298fc1c149afbf4c8996fb924
source:
  - path: src/order/checkout/payment.ts
    line: 12
    end_line: 340
name:
  zh: 支付
  en: Payment
description:
  zh: >
    负责订单支付：对接支付渠道、处理回调、维护支付状态机，
    并向发票模块发起开票请求。
  en: >
    Handles order payment: channel integration, callback processing,
    payment state machine, and invoice requests.
apis:
  - protocol: http
    method: POST
    path: /api/v1/orders/{order_id}/pay
    description:
      zh: 发起支付请求。
      en: Initiates a payment for an order.
  - protocol: kafka
    path: payment.completed
    description:
      zh: 支付完成后发布的事件。
      en: Event published after a successful payment.
deps:
  - kind: call
    to: demo.order.checkout.invoice
    from_api: POST:/api/v1/orders/{order_id}/pay
    to_api: POST:/internal/invoices
    label: { zh: 开票, en: Create invoice }
---
（正文给人类读者，可选；渲染器不消费。）
```

## 2. 容器模块（有子模块）

`modules/demo/order/checkout/index.md`：

```markdown
---
uid: 6b1d0e44
id: demo.order.checkout
parent: demo.order
revision: 9f1a1cf0b6e9e2a3d4c5b6a7f8e9d0c1b2a3f4e5
updated_at: 2026-11-03T12:00:00Z
fingerprint: 4a7d1ed414474e4033ac29ccb8653d9b
source: []
name: { zh: 结算, en: Checkout }
description:
  zh: 结算流程编排：计价、支付、开票。
  en: Checkout orchestration: pricing, payment, invoicing.
---
```

> 容器**不写 `apis`**（会 `api/non-leaf`）；容器缺渲染数据会 warning `layout/missing`。

## 3. 渲染数据（容器 `demo` 这一层）

`renders/demo.json`：

```json
{
  "schema_version": 1,
  "id": "demo",
  "updated_at": "2026-11-03T12:00:00Z",
  "mode": "layers",
  "max_columns": 4,
  "max_api_rows": 0,
  "reading": { "zh": "从左到右：入口 → 订单 → 结算 → 发票", "en": "Left to right: entry → order → checkout → invoice" },
  "order": ["demo.api", "demo.order", "demo.order.checkout", "demo.order.invoice"],
  "groups": [
    { "id": "edge", "title": { "zh": "接入层", "en": "Edge" }, "children": ["demo.api"] },
    { "id": "core", "title": { "zh": "领域层", "en": "Domain" }, "children": ["demo.order", "demo.order.checkout", "demo.order.invoice"] }
  ],
  "edge_hints": [{ "from": "demo.order", "to": "demo.order.invoice", "lane": 3, "style": "curve" }]
}
```

## 4. 变更记录（`changes/2026-11-03-rate-limit.json`，由工具生成，示意）

```json
{
  "schema_version": 1,
  "id": "2026-11-03-rate-limit",
  "title": { "zh": "新增限流模块", "en": "Add rate-limit module" },
  "status": "verified",
  "intent": "给 gateway 增加令牌桶限流",
  "modules": { "create": ["demo.gateway.rate-limit"], "modify": ["demo.gateway"], "delete": [] },
  "acceptance": ["单元测试覆盖桶容量与突发", "validate 0 error"],
  "delete_snapshot": [],
  "revision": "9f1a1cf0b6e9e2a3d4c5b6a7f8e9d0c1b2a3f4e5",
  "created_at": "2026-11-03T09:00:00Z",
  "updated_at": "2026-11-03T10:20:00Z",
  "closed_at": "2026-11-03T10:20:00Z"
}
```

## 5. CLI 最小闭环（终端）

```bash
NODE="node"   # 本机无 node PATH 时用 DSH 自带 runtime 的 node.exe
$NODE lib/cli/index.js init --project demo --root-id demo --name-zh "演示" --name-en "Demo"
# → {"ok":true,...}

$NODE lib/cli/index.js validate --project demo --repo-root F:/repo
# → {"ok":true,"errors":[],"warnings":[...]}  退出码 0
#   有 error 时退出码 2；参数错 4；安全拒绝 6；其它失败 5

$NODE lib/cli/index.js build --project demo
$NODE lib/cli/index.js verify --project demo      # 回执链自证（0 = 一致）
$NODE lib/cli/index.js render --project demo --out normify.html
# 产物：normify-demo/{tree.json, outline.md, api-index.json, structure-manifest.json, receipt.json, receipt.sha256, normify.html}
```

## 6. 多树（一组互相调用的仓库）

```text
normify-modpack/
├── modules/mod-a/index.md          # 树 A 根
├── modules/mod-b/index.md          # 树 B 根
└── modules/mod-a/client.md         # deps: [{kind: call, to: mod-b.api}]
```

多树 = 多个 `parent: null` 根；跨树箭头就是普通 `deps`（`to` 指向另一棵树的模块/API），零新语法。
