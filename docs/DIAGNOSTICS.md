# 诊断码总表（DIAGNOSTICS）

> 本文件由 `scripts/gen-diagnostics.mjs` 从 `src/core` 的 `diag(...)` 调用自动生成，**不要手工编辑**。
> 重新生成：`node scripts/gen-diagnostics.mjs`；发布前防漂移校验：`node scripts/gen-diagnostics.mjs --check`。

- 扫描范围：`src/core` 下全部 `.ts`（共 20 个文件）
- 字面量诊断码：**235**（error 212，warning 23，error+warning 双级 0）
- 动态码族：**6**（实际码随字段/规则 id 变化，见「动态诊断码」）
- 诊断对象形状：`severity / code / message / subject / evidence / supportedFixes`（AI 可据此自修复）

## 使用方式

- 工具/CLI 返回的每条诊断都带 `code`（形如 `族/具体码`）；先按 `code` 查本表，再看 `evidence` 与 `supportedFixes`。
- `severity=error` 阻断 `build` / `change_close`；`warning` 不阻断，但收尾时应汇报。
- 架构规则违规的码是 `policy/<rule-id>`，级别由该条规则的 `severity` 决定（默认 error）。
- 同一 `code` 在不同上下文含义可能不同；以 `message` + `evidence` 为准。

## 按族索引

| 族 | 码数 | 诊断码 |
| --- | --- | --- |
| `api/` | 14 | `api/description-empty`、`api/description-shape`、`api/description-too-long`、`api/entry-shape`、`api/key-duplicate`、`api/leaf-empty`、`api/leaf-missing`、`api/method-forbidden`、`api/method-required`、`api/non-leaf`、`api/path-empty`、`api/protocol-unknown`、`api/type`、`api/unknown-field` |
| `args/` | 3 | `args/empty-batch`、`args/empty-patch`、`args/invalid-patch` |
| `build/` | 1 | `build/write-failed` |
| `change/` | 36 | `change/abandoned`、`change/acceptance`、`change/acceptance-too-many`、`change/api-already-removed`、`change/api-module-missing`、`change/api-ref`、`change/closed`、`change/closed-at`、`change/create-not-landed`、`change/created-at`、`change/delete-snapshot`、`change/delete-snapshot-duplicate`、`change/delete-snapshot-orphan`、`change/id-format`、`change/id-mismatch`、`change/intent`、`change/invalid`、`change/json-parse`、`change/module-id`、`change/module-id-duplicate`、`change/module-missing`、`change/modules`、`change/modules-unknown`、`change/multiple-in-progress`、`change/not-found`、`change/note`、`change/open-closed-at`、`change/revision`、`change/revision-sha`、`change/schema-version`、`change/shape`、`change/status`、`change/title`、`change/unknown-field`、`change/updated-at`、`change/verified-closed-at` |
| `dep/` | 16 | `dep/duplicate`、`dep/entry-shape`、`dep/from-api-invalid`、`dep/from-api-non-leaf`、`dep/kind-unknown`、`dep/label-empty`、`dep/label-shape`、`dep/label-too-long`、`dep/self-loop`、`dep/target-dropped`、`dep/target-missing`、`dep/to-api-invalid`、`dep/to-empty`、`dep/type`、`dep/unanchored`、`dep/unknown-field` |
| `deprecation/` | 4 | `deprecation/inbound`、`deprecation/no-replacement`、`deprecation/replacement-deprecated`、`deprecation/replacement-missing` |
| `diff/` | 1 | `diff/no-tree` |
| `evidence/` | 6 | `evidence/checks-skipped`、`evidence/fingerprint-drift`、`evidence/fingerprint-pending`、`evidence/fingerprint-unavailable`、`evidence/root-no-source`、`evidence/source-missing` |
| `input/` | 5 | `input/no-frontmatter`、`input/not-object`、`input/read`、`input/unclosed-frontmatter`、`input/yaml-parse` |
| `layout/` | 42 | `layout/file-name`、`layout/group-child`、`layout/group-child-duplicate`、`layout/group-children`、`layout/group-id`、`layout/group-id-duplicate`、`layout/group-shape`、`layout/group-title`、`layout/group-unknown-field`、`layout/groups-empty`、`layout/groups-shape`、`layout/hint-bundle`、`layout/hint-edge-missing`、`layout/hint-endpoint`、`layout/hint-kind`、`layout/hint-lane`、`layout/hint-priority`、`layout/hint-self`、`layout/hint-shape`、`layout/hint-style`、`layout/hint-unknown-field`、`layout/hints-shape`、`layout/id-duplicate`、`layout/id-mismatch`、`layout/json-parse`、`layout/max-api-rows`、`layout/max-columns`、`layout/missing`、`layout/missing-many`、`layout/mode`、`layout/not-container`、`layout/order-child`、`layout/order-duplicate`、`layout/order-incomplete`、`layout/order-shape`、`layout/orphan`、`layout/reading`、`layout/schema-version`、`layout/shape`、`layout/unknown-field`、`layout/unparsed-carried`、`layout/updated-at` |
| `module/` | 11 | `module/batch-duplicate`、`module/batch-write-failed`、`module/conflict`、`module/id-conflict`、`module/immutable-field`、`module/move-cycle`、`module/move-failed`、`module/move-noop`、`module/move-parent-mismatch`、`module/not-found`、`module/parent-patch` |
| `policy/` | 27 | `policy/missing`、`policy/rule-boolean`、`policy/rule-enabled`、`policy/rule-forbid-empty`、`policy/rule-id`、`policy/rule-id-duplicate`、`policy/rule-kind`、`policy/rule-layer-shape`、`policy/rule-layers`、`policy/rule-max-depth`、`policy/rule-max-depth-missing`、`policy/rule-message`、`policy/rule-mode`、`policy/rule-pattern`、`policy/rule-pattern-invalid`、`policy/rule-patterns`、`policy/rule-severity`、`policy/rule-shape`、`policy/rule-state`、`policy/rule-type`、`policy/rule-unknown-field`、`policy/rules-shape`、`policy/schema-version`、`policy/shape`、`policy/unknown-field`、`policy/updated-at`、`policy/yaml-parse` |
| `proposal/` | 8 | `proposal/from-missing`、`proposal/id-format`、`proposal/kind`、`proposal/parent-mismatch`、`proposal/parent-not-exist`、`proposal/parent-patch`、`proposal/self-loop`、`proposal/to-missing` |
| `refresh/` | 6 | `refresh/activate-no-source`、`refresh/activate-not-landed`、`refresh/git-unavailable`、`refresh/no-target`、`refresh/planned-not-landed`、`refresh/write-failed` |
| `render/` | 4 | `render/bad-tree`、`render/invalid-out`、`render/no-build`、`render/write-failed` |
| `structure/` | 43 | `structure/api-dropped-on-promote`、`structure/cycle`、`structure/dependency-cycle`、`structure/description-empty`、`structure/description-shape`、`structure/description-too-long`、`structure/file-id-mismatch`、`structure/fingerprint-invalid`、`structure/id-duplicate`、`structure/id-format`、`structure/id-reserved`、`structure/leaf-too-coarse`、`structure/leaf-too-coarse-many`、`structure/missing-field`、`structure/name-empty`、`structure/name-shape`、`structure/name-too-long`、`structure/no-root`、`structure/parent-dropped`、`structure/parent-mismatch`、`structure/parent-not-exist`、`structure/parent-type`、`structure/planned-source-missing`、`structure/replacement-invalid`、`structure/replacement-state`、`structure/repository-invalid`、`structure/repository-root-only`、`structure/revision-invalid`、`structure/root-single-segment`、`structure/shallow-hierarchy`、`structure/source-entry-shape`、`structure/source-path-invalid`、`structure/source-range-invalid`、`structure/source-type`、`structure/state-invalid`、`structure/tag-duplicate`、`structure/tag-invalid`、`structure/tags-shape`、`structure/tags-too-many`、`structure/uid-duplicate`、`structure/uid-format`、`structure/unknown-field`、`structure/updated-at-invalid` |
| `verify/` | 8 | `verify/artifact-missing`、`verify/empty-receipt`、`verify/hash-mismatch`、`verify/no-receipt`、`verify/prior-warning`、`verify/receipt-parse`、`verify/sidecar-mismatch`、`verify/sidecar-missing` |

## 全量诊断码

| 诊断码 | 级别 | 生成点 | 说明（message 首段） |
| --- | --- | --- | --- |
| `api/description-empty` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `api/description-shape` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `api/description-too-long` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `api/entry-shape` | error | `src/core/engine/frontmatter.ts:83` | apis 条目必须为对象 |
| `api/key-duplicate` | error | `src/core/engine/validate.ts:189` | API 键全项目重复 |
| `api/leaf-empty` | warning | `src/core/engine/validate.ts:137` | 叶子模块 apis 为空（无接口的功能单元） |
| `api/leaf-missing` | error | `src/core/engine/validate.ts:134` | 叶子模块必须写 apis 字段 |
| `api/method-forbidden` | error | `src/core/engine/frontmatter.ts:107` | 非 http 类 API 不能有 method 字段 |
| `api/method-required` | error | `src/core/engine/frontmatter.ts:102` | http 类 API 必须有大写 method |
| `api/non-leaf` | error | `src/core/engine/validate.ts:141` | 非叶子（含根）模块禁止 apis 字段；API 只定义在叶子上 |
| `api/path-empty` | error | `src/core/engine/frontmatter.ts:97` | path 不能为空 |
| `api/protocol-unknown` | error | `src/core/engine/frontmatter.ts:93` | protocol 不在允许枚举内 |
| `api/type` | error | `src/core/engine/frontmatter.ts:258` | apis 必须为数组 |
| `api/unknown-field` | error | `src/core/engine/frontmatter.ts:88` | （动态拼接） |
| `args/empty-batch` | error | `src/core/engine/edit.ts:233` | items 不能为空：空批次不会修改任何内容（也不会返回 count:0 的假成功） |
| `args/empty-patch` | error | `src/core/engine/edit.ts:200` | 没有任何字段要改：patch 里至少要有一个字段（或传 body） |
| `args/invalid-patch` | error | `src/core/engine/edit.ts:281` | patch 模式要求 items[i] = { patch: { id, patch: { ...要改的字段 } } } —— 内层 patch 才是字段补丁；当前内层缺失或为空（若直接放行，会"返回 ok 但一个字段都没改"） |
| `build/write-failed` | error | `src/core/engine/compile.ts:350` | （动态拼接） |
| `change/abandoned` | error | `src/core/engine/companion.ts:49` | （动态拼接） |
| `change/acceptance` | error | `src/core/engine/changes.ts:84` | （动态拼接） |
| `change/acceptance-too-many` | error | `src/core/engine/changes.ts:87` | acceptance 最多 20 条 |
| `change/api-already-removed` | warning | `src/core/engine/changes.ts:248` | 要移除的 API 当前不在模块上（可能已移除） |
| `change/api-module-missing` | error | `src/core/engine/changes.ts:245` | 变更引用的 API 所属模块不存在 |
| `change/api-ref` | error | `src/core/engine/changes.ts:126` | （动态拼接） |
| `change/closed` | error | `src/core/engine/companion.ts:47` | （动态拼接） |
| `change/closed-at` | error | `src/core/engine/changes.ts:65` | closed_at 必须为 ISO 8601 或 null |
| `change/create-not-landed` | error | `src/core/engine/companion.ts:73` | （动态拼接） |
| `change/created-at` | error | `src/core/engine/changes.ts:61` | created_at 必须为 ISO 8601 |
| `change/delete-snapshot` | error | `src/core/engine/changes.ts:132` | delete_snapshot 必须为合法模块 id 数组 |
| `change/delete-snapshot-duplicate` | error | `src/core/engine/changes.ts:135` | delete_snapshot 中存在重复模块 id |
| `change/delete-snapshot-orphan` | warning | `src/core/engine/changes.ts:238` | delete_snapshot 中的模块不在本次 delete 清单里 |
| `change/id-format` | error | `src/core/engine/changes.ts:48` | 变更 id 必须为 YYYY-MM-DD-<slug> |
| `change/id-mismatch` | error | `src/core/engine/changes.ts:52` | data.id 必须等于文件名 |
| `change/intent` | error | `src/core/engine/changes.ts:56` | intent 必须为 {zh,en} 非空双语 |
| `change/invalid` | error | `src/core/engine/changes.ts:192` | 变更文件无效 |
| `change/json-parse` | error | `src/core/engine/changes.ts:188` | （动态拼接） |
| `change/module-id` | error | `src/core/engine/changes.ts:115` | （动态拼接） |
| `change/module-id-duplicate` | error | `src/core/engine/changes.ts:118` | （动态拼接） |
| `change/module-missing` | error | `src/core/engine/changes.ts:226`<br>`src/core/engine/changes.ts:234` | 变更引用的模块不存在 |
| `change/modules` | error | `src/core/engine/changes.ts:103` | modules 必须为对象（create/modify/delete/api_add/api_remove） |
| `change/modules-unknown` | error | `src/core/engine/changes.ts:108` | （动态拼接） |
| `change/multiple-in-progress` | warning | `src/core/engine/changes.ts:254` | 同时存在多个 in_progress 变更 |
| `change/not-found` | error | `src/core/engine/companion.ts:45` | （动态拼接） |
| `change/note` | error | `src/core/engine/changes.ts:67` | note 必须为字符串 |
| `change/open-closed-at` | error | `src/core/engine/changes.ts:159` | 未关闭的变更 closed_at 必须为空 |
| `change/revision` | error | `src/core/engine/changes.ts:91` | revision 必须为 { before, after } |
| `change/revision-sha` | error | `src/core/engine/changes.ts:97` | （动态拼接） |
| `change/schema-version` | error | `src/core/engine/changes.ts:50` | （动态拼接） |
| `change/shape` | error | `src/core/engine/changes.ts:40` | 变更文件必须为 JSON 对象 |
| `change/status` | error | `src/core/engine/changes.ts:58` | （动态拼接） |
| `change/title` | error | `src/core/engine/changes.ts:54` | title 必须为 {zh,en} 非空双语 |
| `change/unknown-field` | error | `src/core/engine/changes.ts:45` | （动态拼接） |
| `change/updated-at` | error | `src/core/engine/changes.ts:63` | updated_at 必须为 ISO 8601 |
| `change/verified-closed-at` | error | `src/core/engine/changes.ts:156` | status=verified 的变更必须有 closed_at |
| `dep/duplicate` | error | `src/core/engine/validate.ts:180` | 重复的依赖箭头 |
| `dep/entry-shape` | error | `src/core/engine/frontmatter.ts:115` | deps 条目必须为对象 |
| `dep/from-api-invalid` | error | `src/core/engine/validate.ts:166` | from_api 不是本模块的 API 键 |
| `dep/from-api-non-leaf` | error | `src/core/engine/validate.ts:163` | from_api 只能引用本模块 API（非叶子没有 API） |
| `dep/kind-unknown` | error | `src/core/engine/frontmatter.ts:124` | kind 不在允许枚举内 |
| `dep/label-empty` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `dep/label-shape` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `dep/label-too-long` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `dep/self-loop` | error | `src/core/engine/edit.ts:311`<br>`src/core/engine/validate.ts:154` | 箭头不能指向自身 |
| `dep/target-dropped` | error | `src/core/engine/edit.ts:315` | （动态拼接） |
| `dep/target-missing` | error | `src/core/engine/edit.ts:317`<br>`src/core/engine/validate.ts:158` | 箭头目标不存在（批次内也找不到） |
| `dep/to-api-invalid` | error | `src/core/engine/validate.ts:172` | to_api 不是目标模块自身的 API 键 |
| `dep/to-empty` | error | `src/core/engine/frontmatter.ts:128` | to 必须为目标模块 id |
| `dep/type` | error | `src/core/engine/frontmatter.ts:261` | deps 必须为数组 |
| `dep/unanchored` | warning | `src/core/engine/validate.ts:234` | （动态拼接） |
| `dep/unknown-field` | error | `src/core/engine/frontmatter.ts:120` | （动态拼接） |
| `deprecation/inbound` | warning | `src/core/engine/validate.ts:212` | 依赖指向已废弃模块，建议迁移 |
| `deprecation/no-replacement` | warning | `src/core/engine/validate.ts:197` | 已废弃模块未提供 replacement，调用方无从迁移 |
| `deprecation/replacement-deprecated` | warning | `src/core/engine/validate.ts:204` | replacement 本身也是 deprecated |
| `deprecation/replacement-missing` | error | `src/core/engine/validate.ts:202` | replacement 指向的模块不存在 |
| `diff/no-tree` | error | `src/core/engine/diff.ts:64` | （动态拼接） |
| `evidence/checks-skipped` | warning | `src/core/engine/validate.ts:329` | 未提供 repoRoot，跳过 source 存在性与 fingerprint 一致性校验 |
| `evidence/fingerprint-drift` | error | `src/core/engine/validate.ts:324` | fingerprint 与仓库当前内容不一致（结构数据已过期） |
| `evidence/fingerprint-pending` | error | `src/core/engine/validate.ts:316` | 只有 planned 模块可以使用 fingerprint: pending |
| `evidence/fingerprint-unavailable` | error | `src/core/engine/validate.ts:321` | 无法计算 fingerprint（文件缺失） |
| `evidence/root-no-source` | warning | `src/core/engine/validate.ts:301` | 根模块无 source（纯文档根） |
| `evidence/source-missing` | error | `src/core/engine/edit.ts:714`<br>`src/core/engine/validate.ts:310` | source 指向的文件在仓库中不存在 |
| `input/no-frontmatter` | error | `src/core/engine/frontmatter.ts:312` | 模块文件必须以 --- 开头的 YAML frontmatter 开始 |
| `input/not-object` | error | `src/core/engine/frontmatter.ts:150` | frontmatter 解析结果必须为映射 |
| `input/read` | error | `src/core/engine/store.ts:127` | 无法读取模块文件 |
| `input/unclosed-frontmatter` | error | `src/core/engine/frontmatter.ts:327` | frontmatter 缺少结束行 --- |
| `input/yaml-parse` | error | `src/core/engine/frontmatter.ts:342` | （动态拼接） |
| `layout/file-name` | error | `src/core/engine/layout.ts:391` | 渲染数据文件名不符合 renders/<id>.json 约定 |
| `layout/group-child` | error | `src/core/engine/layout.ts:233` | group.children 只能包含直接子模块 id |
| `layout/group-child-duplicate` | error | `src/core/engine/layout.ts:237` | 子模块被分到多个 group |
| `layout/group-children` | error | `src/core/engine/layout.ts:227` | group.children 必须为非空数组 |
| `layout/group-id` | error | `src/core/engine/layout.ts:214` | group.id 必须为非空字符串 |
| `layout/group-id-duplicate` | error | `src/core/engine/layout.ts:218` | group.id 重复 |
| `layout/group-shape` | error | `src/core/engine/layout.ts:205` | group 必须为对象 |
| `layout/group-title` | error | `src/core/engine/layout.ts:223` | group.title 必须为 {zh, en} 非空双语 |
| `layout/group-unknown-field` | error | `src/core/engine/layout.ts:210` | （动态拼接） |
| `layout/groups-empty` | error | `src/core/engine/layout.ts:247` | mode=groups 时必须提供至少一个 group |
| `layout/groups-shape` | error | `src/core/engine/layout.ts:197` | groups 必须为数组 |
| `layout/hint-bundle` | error | `src/core/engine/layout.ts:308` | edge_hint.bundle 必须为非空字符串 |
| `layout/hint-edge-missing` | error | `src/core/engine/layout.ts:281` | edge_hint 指向的兄弟依赖边不存在 |
| `layout/hint-endpoint` | error | `src/core/engine/layout.ts:273` | edge_hint.from/to 必须是直接子模块 id |
| `layout/hint-kind` | error | `src/core/engine/layout.ts:287` | （动态拼接） |
| `layout/hint-lane` | error | `src/core/engine/layout.ts:294` | edge_hint.lane 必须为 0..9 整数 |
| `layout/hint-priority` | error | `src/core/engine/layout.ts:314` | edge_hint.priority 必须为整数 |
| `layout/hint-self` | error | `src/core/engine/layout.ts:277` | edge_hint 不能指向自身 |
| `layout/hint-shape` | error | `src/core/engine/layout.ts:263` | edge_hint 必须为对象 |
| `layout/hint-style` | error | `src/core/engine/layout.ts:301` | edge_hint.style 必须为 'orthogonal' \| 'curve' |
| `layout/hint-unknown-field` | error | `src/core/engine/layout.ts:268` | （动态拼接） |
| `layout/hints-shape` | error | `src/core/engine/layout.ts:254` | edge_hints 必须为数组 |
| `layout/id-duplicate` | error | `src/core/engine/layout.ts:395` | 同一模块出现多份渲染数据 |
| `layout/id-mismatch` | error | `src/core/engine/layout.ts:134` | 渲染数据的 id 必须等于对应模块 id |
| `layout/json-parse` | error | `src/core/engine/layout.ts:97` | （动态拼接） |
| `layout/max-api-rows` | error | `src/core/engine/layout.ts:156` | max_api_rows 必须为 0..48 的整数（0 = 全部展开） |
| `layout/max-columns` | error | `src/core/engine/layout.ts:151` | max_columns 必须为 1..6 的整数 |
| `layout/missing` | warning | `src/core/engine/layout.ts:428` | 容器模块缺少渲染数据（图谱将回退自动布局） |
| `layout/missing-many` | warning | `src/core/engine/layout.ts:431` | 还有更多容器缺少渲染数据 |
| `layout/mode` | error | `src/core/engine/layout.ts:143` | （动态拼接） |
| `layout/not-container` | error | `src/core/engine/layout.ts:406` | 叶子模块不需要渲染数据（没有可渲染的子层） |
| `layout/order-child` | error | `src/core/engine/layout.ts:178` | order 只能包含直接子模块 id |
| `layout/order-duplicate` | error | `src/core/engine/layout.ts:182` | order 中重复的子模块 id |
| `layout/order-incomplete` | warning | `src/core/engine/layout.ts:190` | order 未覆盖全部子模块（未列出的按启发式追加） |
| `layout/order-shape` | error | `src/core/engine/layout.ts:171` | order 必须为子模块 id 数组 |
| `layout/orphan` | error | `src/core/engine/layout.ts:401` | 渲染数据没有对应的模块 |
| `layout/reading` | error | `src/core/engine/layout.ts:162` | reading 必须为 {zh, en} 非空双语 |
| `layout/schema-version` | error | `src/core/engine/layout.ts:131` | （动态拼接） |
| `layout/shape` | error | `src/core/engine/layout.ts:122` | 渲染数据必须为 JSON 对象 |
| `layout/unknown-field` | error | `src/core/engine/layout.ts:127` | （动态拼接） |
| `layout/unparsed-carried` | warning | `src/core/engine/edit.ts:576` | （动态拼接） |
| `layout/updated-at` | error | `src/core/engine/layout.ts:137` | updated_at 必须为 ISO 8601 时间 |
| `module/batch-duplicate` | error | `src/core/engine/edit.ts:266`<br>`src/core/engine/edit.ts:288` | 同一批次中模块 id 重复 |
| `module/batch-write-failed` | error | `src/core/engine/edit.ts:339` | （动态拼接） |
| `module/conflict` | error | `src/core/engine/edit.ts:193` | 模块已被其他写入修改（updated_at 不一致），请先重新读取 |
| `module/id-conflict` | error | `src/core/engine/edit.ts:399` | 移动后 id 与现有模块冲突 |
| `module/immutable-field` | error | `src/core/engine/edit.ts:159` | （动态拼接） |
| `module/move-cycle` | error | `src/core/engine/edit.ts:391` | 目标父模块在被移动的子树内 |
| `module/move-failed` | error | `src/core/engine/edit.ts:643` | （动态拼接） |
| `module/move-noop` | error | `src/core/engine/edit.ts:373`<br>`src/core/engine/edit.ts:376` | 必须提供 new_id 或 new_parent |
| `module/move-parent-mismatch` | error | `src/core/engine/edit.ts:383` | new_parent 必须等于 new_id 去掉最后一段 |
| `module/not-found` | error | `src/core/engine/edit.ts:189`<br>`src/core/engine/edit.ts:275`<br>`src/core/engine/edit.ts:363`<br>… +1 | （动态拼接） |
| `module/parent-patch` | error | `src/core/engine/edit.ts:162` | parent 不可通过 patch 修改 |
| `policy/missing` | warning | `src/core/engine/validate.ts:271` | 项目未安装架构规则（policy.yml），结构演进缺少约束 |
| `policy/rule-boolean` | error | `src/core/engine/policy.ts:213`<br>`src/core/engine/policy.ts:218` | includeCrossTree 必须为布尔值 |
| `policy/rule-enabled` | error | `src/core/engine/policy.ts:176` | enabled 必须为布尔值 |
| `policy/rule-forbid-empty` | error | `src/core/engine/policy.ts:193` | forbid-dependency 至少需要 from/to/fromState/toState 之一 |
| `policy/rule-id` | error | `src/core/engine/policy.ts:160` | rule.id 必须为 kebab-case 字符串 |
| `policy/rule-id-duplicate` | error | `src/core/engine/policy.ts:164` | rule.id 重复 |
| `policy/rule-kind` | error | `src/core/engine/policy.ts:184` | （动态拼接） |
| `policy/rule-layer-shape` | error | `src/core/engine/policy.ts:207` | layer 需要 { name, match[] } |
| `policy/rule-layers` | error | `src/core/engine/policy.ts:199` | dependency-direction 需要 ≥2 个 layer |
| `policy/rule-max-depth` | error | `src/core/engine/policy.ts:222` | maxDepth 必须为 1..64 整数 |
| `policy/rule-max-depth-missing` | error | `src/core/engine/policy.ts:224` | max-depth 规则必须提供 maxDepth |
| `policy/rule-message` | error | `src/core/engine/policy.ts:178` | message 必须为 {zh,en} 非空双语 |
| `policy/rule-mode` | error | `src/core/engine/policy.ts:228` | cross-tree 的 mode 必须为 'forbid' \| 'allow' \| 'require-to-api' |
| `policy/rule-pattern` | error | `src/core/engine/policy.ts:232` | naming 规则必须提供 pattern 正则 |
| `policy/rule-pattern-invalid` | error | `src/core/engine/policy.ts:239` | pattern 不是合法正则 |
| `policy/rule-patterns` | error | `src/core/engine/policy.ts:181` | from/to/scope 必须为非空 id 模式数组（字符集 a-z0-9.*-） |
| `policy/rule-severity` | error | `src/core/engine/policy.ts:174` | severity 必须为 'error' \| 'warning' |
| `policy/rule-shape` | error | `src/core/engine/policy.ts:151` | rule 必须为对象 |
| `policy/rule-state` | error | `src/core/engine/policy.ts:188` | （动态拼接） |
| `policy/rule-type` | error | `src/core/engine/policy.ts:170` | （动态拼接） |
| `policy/rule-unknown-field` | error | `src/core/engine/policy.ts:156` | （动态拼接） |
| `policy/rules-shape` | error | `src/core/engine/policy.ts:140` | rules 必须为数组 |
| `policy/schema-version` | error | `src/core/engine/policy.ts:136` | （动态拼接） |
| `policy/shape` | error | `src/core/engine/policy.ts:128` | policy.yml 必须为映射对象 |
| `policy/unknown-field` | error | `src/core/engine/policy.ts:133` | （动态拼接） |
| `policy/updated-at` | error | `src/core/engine/policy.ts:138` | updated_at 必须为 ISO 8601 时间 |
| `policy/yaml-parse` | error | `src/core/engine/policy.ts:269` | （动态拼接） |
| `proposal/from-missing` | error | `src/core/engine/edit.ts:803` | 依赖源模块不存在 |
| `proposal/id-format` | error | `src/core/engine/edit.ts:772` | 拟建模块 id 非法 |
| `proposal/kind` | error | `src/core/engine/edit.ts:815` | （动态拼接） |
| `proposal/parent-mismatch` | error | `src/core/engine/edit.ts:787` | parent 必须等于 id 去掉最后一段 |
| `proposal/parent-not-exist` | error | `src/core/engine/edit.ts:785` | 拟建模块的 parent 不存在 |
| `proposal/parent-patch` | error | `src/core/engine/edit.ts:781` | 拟建/变更的 parent 与现有模块不一致（应使用 move） |
| `proposal/self-loop` | error | `src/core/engine/edit.ts:811` | 依赖不能指向自身 |
| `proposal/to-missing` | error | `src/core/engine/edit.ts:807` | 依赖目标不存在（可同时把它列入 modules） |
| `refresh/activate-no-source` | error | `src/core/engine/edit.ts:697` | （动态拼接） |
| `refresh/activate-not-landed` | error | `src/core/engine/edit.ts:707` | （动态拼接） |
| `refresh/git-unavailable` | warning | `src/core/engine/edit.ts:677` | （动态拼接） |
| `refresh/no-target` | error | `src/core/engine/edit.ts:672` | 必须提供 ids 或 all:true |
| `refresh/planned-not-landed` | warning | `src/core/engine/edit.ts:710` | （动态拼接） |
| `refresh/write-failed` | error | `src/core/engine/edit.ts:746` | （动态拼接） |
| `render/bad-tree` | error | `src/core/engine/render.ts:59` | （动态拼接） |
| `render/invalid-out` | error | `src/core/engine/render.ts:87` | （动态拼接） |
| `render/no-build` | error | `src/core/engine/render.ts:44` | 缺少 tree.json 编译产物 |
| `render/write-failed` | error | `src/core/engine/render.ts:101` | （动态拼接） |
| `structure/api-dropped-on-promote` | warning | `src/core/engine/store.ts:187` | （动态拼接） |
| `structure/cycle` | error | `src/core/engine/validate.ts:95` | parent 链存在环 |
| `structure/dependency-cycle` | error | `src/core/engine/validate.ts:275` | 依赖图存在环（未安装 policy.yml，由 L2 内置无环检查发现） |
| `structure/description-empty` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `structure/description-shape` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `structure/description-too-long` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `structure/file-id-mismatch` | error | `src/core/engine/validate.ts:125` | 文件路径与 id 映射不一致 |
| `structure/fingerprint-invalid` | error | `src/core/engine/frontmatter.ts:255` | fingerprint 必须为非空十六进制哈希（planned 或空 source 的模块可用 pending） |
| `structure/id-duplicate` | error | `src/core/engine/validate.ts:55` | 模块 id 重复 |
| `structure/id-format` | error | `src/core/engine/edit.ts:308`<br>`src/core/engine/edit.ts:379`<br>`src/core/engine/frontmatter.ts:174` | id 非法 |
| `structure/id-reserved` | error | `src/core/engine/frontmatter.ts:171` | （动态拼接） |
| `structure/leaf-too-coarse` | warning | `src/core/engine/validate.ts:238` | （动态拼接） |
| `structure/leaf-too-coarse-many` | warning | `src/core/engine/validate.ts:241` | 还有更多过粗的叶子模块 |
| `structure/missing-field` | error | `src/core/engine/frontmatter.ts:160` | （动态拼接） |
| `structure/name-empty` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `structure/name-shape` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `structure/name-too-long` | error | `src/core/engine/frontmatter.ts:32` | （@diag-codes 显式枚举：L1 文案校验；宽松模式在 L2 降级为 warning） |
| `structure/no-root` | error | `src/core/engine/validate.ts:83` | 全项目必须至少一个根模块（id 单段、parent: null） |
| `structure/parent-dropped` | error | `src/core/engine/edit.ts:300` | （动态拼接） |
| `structure/parent-mismatch` | error | `src/core/engine/edit.ts:305`<br>`src/core/engine/frontmatter.ts:185`<br>`src/core/engine/frontmatter.ts:189` | parent 必须等于 id 去掉最后一段 |
| `structure/parent-not-exist` | error | `src/core/engine/edit.ts:302`<br>`src/core/engine/edit.ts:386`<br>`src/core/engine/validate.ts:108` | parent 不存在（批次内也找不到） |
| `structure/parent-type` | error | `src/core/engine/frontmatter.ts:179` | parent 必须为字符串或 null |
| `structure/planned-source-missing` | warning | `src/core/engine/validate.ts:307` | 计划态模块的 source 尚未落地（实现后刷新即可） |
| `structure/replacement-invalid` | error | `src/core/engine/frontmatter.ts:231` | replacement 必须为合法模块 id |
| `structure/replacement-state` | error | `src/core/engine/frontmatter.ts:228` | replacement 只允许出现在 state=deprecated 的模块上 |
| `structure/repository-invalid` | error | `src/core/engine/frontmatter.ts:194` | repository 必须为 http(s) URL |
| `structure/repository-root-only` | error | `src/core/engine/frontmatter.ts:197` | repository 只允许出现在根模块 |
| `structure/revision-invalid` | error | `src/core/engine/frontmatter.ts:210` | revision 必须为 40 位 git SHA |
| `structure/root-single-segment` | error | `src/core/engine/validate.ts:87` | 根模块 id 必须为单段（树名） |
| `structure/shallow-hierarchy` | warning | `src/core/engine/validate.ts:245` | （动态拼接） |
| `structure/source-entry-shape` | error | `src/core/engine/frontmatter.ts:51` | source 条目必须为对象 |
| `structure/source-path-invalid` | error | `src/core/engine/frontmatter.ts:61`<br>`src/core/engine/frontmatter.ts:65` | source.path 必须为 1-240 字符的 repo 相对路径 |
| `structure/source-range-invalid` | error | `src/core/engine/frontmatter.ts:76` | source.end_line 不能小于 line |
| `structure/source-type` | error | `src/core/engine/frontmatter.ts:204` | source 必须为数组 |
| `structure/state-invalid` | error | `src/core/engine/frontmatter.ts:220` | （动态拼接） |
| `structure/tag-duplicate` | error | `src/core/engine/frontmatter.ts:246` | tag 重复 |
| `structure/tag-invalid` | error | `src/core/engine/frontmatter.ts:242` | tag 必须为非空字符串（≤24 字符） |
| `structure/tags-shape` | error | `src/core/engine/frontmatter.ts:236` | tags 必须为字符串数组 |
| `structure/tags-too-many` | error | `src/core/engine/frontmatter.ts:250` | tags 最多 12 个 |
| `structure/uid-duplicate` | error | `src/core/engine/validate.ts:66` | uid 重复 |
| `structure/uid-format` | error | `src/core/engine/frontmatter.ts:165` | uid 必须为 8 位小写 hex |
| `structure/unknown-field` | error | `src/core/engine/frontmatter.ts:56`<br>`src/core/engine/frontmatter.ts:155` | （动态拼接） |
| `structure/updated-at-invalid` | error | `src/core/engine/frontmatter.ts:214` | updated_at 必须为 ISO 8601 时间 |
| `verify/artifact-missing` | error | `src/core/engine/compile.ts:414` | （动态拼接） |
| `verify/empty-receipt` | error | `src/core/engine/compile.ts:423` | receipt.json 未登记任何产物 |
| `verify/hash-mismatch` | error | `src/core/engine/compile.ts:418` | （动态拼接） |
| `verify/no-receipt` | error | `src/core/engine/compile.ts:381` | 缺少 receipt.json（先运行 normify_build） |
| `verify/prior-warning` | warning | `src/core/engine/compile.ts:426` | （动态拼接） |
| `verify/receipt-parse` | error | `src/core/engine/compile.ts:399` | receipt.json 不是合法 JSON |
| `verify/sidecar-mismatch` | error | `src/core/engine/compile.ts:392` | receipt.sha256 与 receipt.json 实际字节不一致（回执被改动或产物不完整） |
| `verify/sidecar-missing` | error | `src/core/engine/compile.ts:389` | 缺少 receipt.sha256（无法自证回执） |

## 动态诊断码

> 这些码由字段名 / 规则 id 拼接而成，表里给出**码模板**；实际返回时变量部分会被替换。

| 码模板 | 级别 | 生成点 | 表达式（源码） |
| --- | --- | --- | --- |
| `<codePrefix>/<field>-empty` | error | `src/core/engine/frontmatter.ts:42` | `codePrefix + '/' + field + '-empty'` |
| `<codePrefix>/<field>-shape` | error | `src/core/engine/frontmatter.ts:36` | `codePrefix + '/' + field + '-shape'` |
| `<codePrefix>/<field>-too-long` | error | `src/core/engine/frontmatter.ts:45` | `codePrefix + '/' + field + '-too-long'` |
| `dep/<k>-invalid` | error | `src/core/engine/frontmatter.ts:133` | `'dep/' + k + '-invalid'` |
| `policy/<rule.id>` | 动态 | `src/core/engine/policy.ts:301` | `'policy/' + rule.id` |
| `structure/source-<k>-invalid` | error | `src/core/engine/frontmatter.ts:71` | `'structure/source-' + k + '-invalid'` |

---

*本表的唯一真源是 `src/core` 的 `diag(...)` 调用；如果工具返回了表里没有的码，说明生成脚本需要扩展或代码绕过了统一诊断构造。*
