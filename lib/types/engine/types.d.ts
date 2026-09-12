/** Normify core types（与正式规范 §2/§3 对齐） */
export interface LocalizedText {
    zh: string;
    en: string;
}
export interface SourceRef {
    path: string;
    line?: number;
    end_line?: number;
}
export declare const PROTOCOLS: readonly ["http", "ws", "rpc", "amqp", "kafka", "mysql", "redis", "file", "grpc", "graphql"];
export declare const DEP_KINDS: readonly ["call", "event", "dataflow", "reference"];
export interface Api {
    protocol: string;
    method?: string;
    path: string;
    description: LocalizedText;
}
export interface Dep {
    kind: string;
    to: string;
    from_api?: string;
    to_api?: string;
    label?: LocalizedText;
}
/** 模块生命周期状态：active=已实现；planned=计划态（先建树后实现）；deprecated=已废弃。 */
export declare const MODULE_STATES: readonly ["active", "planned", "deprecated"];
export type ModuleState = (typeof MODULE_STATES)[number];
/** 架构规则的完整规则集（policy.yml）。 */
export declare const POLICY_RULE_TYPES: readonly ["forbid-dependency", "dependency-direction", "acyclic", "max-depth", "cross-tree", "naming"];
export type PolicyRuleType = (typeof POLICY_RULE_TYPES)[number];
export interface PolicyLayer {
    name: string;
    match: string[];
}
export interface PolicyRule {
    id: string;
    type: PolicyRuleType;
    /** 默认 error；warning 只提示不阻断。 */
    severity?: 'error' | 'warning';
    /** 默认 true。 */
    enabled?: boolean;
    /** 自定义诊断文案（可选）。 */
    message?: LocalizedText;
    /** forbid-dependency：源/目标 id 模式（* 单段、** 多段）。 */
    from?: string[];
    to?: string[];
    /** forbid-dependency：只约束这些 kind。 */
    kind?: string[];
    /** forbid-dependency：目标模块必须是该 state 时才命中（如 deprecated）。 */
    toState?: ModuleState;
    /** forbid-dependency：源模块必须是该 state 时才命中。 */
    fromState?: ModuleState;
    /** dependency-direction：层的顺序 = 允许的依赖方向（只允许从前面的层指向后面的层）。 */
    layers?: PolicyLayer[];
    allowSameLayer?: boolean;
    allowBackward?: boolean;
    /** acyclic / max-depth / naming 的作用域（空 = 全项目）。 */
    scope?: string[];
    /** acyclic：是否把跨树依赖也纳入环检测。 */
    includeCrossTree?: boolean;
    /** max-depth：id 段数上限（含树名段）。 */
    maxDepth?: number;
    /** cross-tree：forbid=禁止跨树依赖；allow=允许；require-to-api=跨树依赖必须写 to_api。 */
    mode?: 'forbid' | 'allow' | 'require-to-api';
    /** naming：作用域内每个 id 段必须匹配的 JS 正则。 */
    pattern?: string;
}
export interface PolicyData {
    schema_version: number;
    updated_at: string;
    rules: PolicyRule[];
}
/** 开发变更日志（changes/<id>.json）：结构目录内，便于随工程回档。 */
export declare const CHANGE_STATUSES: readonly ["proposed", "in_progress", "verified", "abandoned"];
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export interface ChangeApiRef {
    module: string;
    key: string;
}
export interface ChangeModules {
    create?: string[];
    modify?: string[];
    delete?: string[];
    api_add?: ChangeApiRef[];
    api_remove?: ChangeApiRef[];
}
export interface ChangeData {
    schema_version: number;
    id: string;
    title: LocalizedText;
    status: ChangeStatus;
    intent: LocalizedText;
    modules: ChangeModules;
    acceptance: string[];
    note?: string;
    revision: {
        before: string | null;
        after: string | null;
    };
    created_at: string;
    updated_at: string;
    closed_at?: string | null;
}
/** 基本模块：全项目唯一的结构元素。children 不存储——由 parent 索引导出。 */
export interface Module {
    uid: string;
    id: string;
    parent: string | null;
    name: LocalizedText;
    description: LocalizedText;
    source: SourceRef[];
    revision: string;
    updated_at: string;
    fingerprint: string;
    /** 仅根模块允许：该树对应仓库 URL */
    repository?: string;
    /** 生命周期状态（默认 active）。planned = 先建树、后实现；deprecated = 已废弃。 */
    state?: ModuleState;
    /** state=deprecated 时的替代模块 id（必须存在）。 */
    replacement?: string;
    /** 自由标签（检索/分组/指引用，可选）。 */
    tags?: string[];
    /** 仅叶子允许 */
    apis?: Api[];
    /** 出向依赖箭头，只在源端存储 */
    deps?: Dep[];
}
/** 渲染数据集的布局模式：auto=自动选择；layers=按依赖分层（左→右流）；groups=分组块；grid=均衡网格。 */
export declare const LAYOUT_MODES: readonly ["auto", "layers", "groups", "grid"];
/** 渲染数据集里的一个视觉分组（同一块背景下的子模块集合）。 */
export interface LayoutGroup {
    id: string;
    title: LocalizedText;
    children: string[];
}
/** 渲染数据集里的单条边提示：车道 / 样式 / 捆扎，由 AI 或人工在渲染数据文件里指定。 */
export interface LayoutEdgeHint {
    from: string;
    to: string;
    kind?: string;
    lane?: number;
    style?: 'orthogonal' | 'curve';
    bundle?: string;
    priority?: number;
}
/**
 * 渲染数据集（renders/<id>.json）：与结构数据集并行的可读性数据，
 * 只存在于容器模块（有子级的模块），指导「本层子图」的排布与连线，
 * 不改变结构语义。
 */
export interface LayoutData {
    schema_version: number;
    id: string;
    updated_at: string;
    mode?: (typeof LAYOUT_MODES)[number];
    max_columns?: number;
    /** 叶子框内最多展示几行 API（0 = 全部展开；缺省 6）。项目越精细、每叶 API 越少，这一层越不需要截断。 */
    max_api_rows?: number;
    reading?: LocalizedText;
    order?: string[];
    groups?: LayoutGroup[];
    edge_hints?: LayoutEdgeHint[];
}
export interface ModuleFile {
    module: Module;
    body: string;
    /** project 目录下的相对路径（正斜杠），如 modules/demo/order/checkout/payment.md */
    file: string;
}
export interface Diagnostic {
    code: string;
    severity: 'error' | 'warning';
    message: string;
    subject?: Record<string, unknown>;
    evidence?: Record<string, unknown>;
    supportedFixes?: string[];
}
export interface ValidateResult {
    ok: boolean;
    errors: Diagnostic[];
    warnings: Diagnostic[];
}
