/** Normify core types（与正式规范 §2/§3 对齐） */
export const PROTOCOLS = ['http', 'ws', 'rpc', 'amqp', 'kafka', 'mysql', 'redis', 'file', 'grpc', 'graphql'];
export const DEP_KINDS = ['call', 'event', 'dataflow', 'reference'];
/** 模块生命周期状态：active=已实现；planned=计划态（先建树后实现）；deprecated=已废弃。 */
export const MODULE_STATES = ['active', 'planned', 'deprecated'];
/** 架构规则的完整规则集（policy.yml）。 */
export const POLICY_RULE_TYPES = ['forbid-dependency', 'dependency-direction', 'acyclic', 'max-depth', 'cross-tree', 'naming'];
/** 开发变更日志（changes/<id>.json）：结构目录内，便于随工程回档。 */
export const CHANGE_STATUSES = ['proposed', 'in_progress', 'verified', 'abandoned'];
/** 渲染数据集的布局模式：auto=自动选择；layers=按依赖分层（左→右流）；groups=分组块；grid=均衡网格。 */
export const LAYOUT_MODES = ['auto', 'layers', 'groups', 'grid'];
//# sourceMappingURL=types.js.map