/** Normify core types（与正式规范 §2/§3 对齐） */

export interface LocalizedText {
  zh: string
  en: string
}

export interface SourceRef {
  path: string
  line?: number
  end_line?: number
}

export const PROTOCOLS = ['http', 'ws', 'rpc', 'amqp', 'kafka', 'mysql', 'redis', 'file', 'grpc', 'graphql'] as const

export const DEP_KINDS = ['call', 'event', 'dataflow', 'reference'] as const

export interface Api {
  protocol: string
  method?: string
  path: string
  description: LocalizedText
}

export interface Dep {
  kind: string
  to: string
  from_api?: string
  to_api?: string
  label?: LocalizedText
}

/** 基本模块：全项目唯一的结构元素。children 不存储——由 parent 索引导出。 */
export interface Module {
  uid: string
  id: string
  parent: string | null
  name: LocalizedText
  description: LocalizedText
  source: SourceRef[]
  revision: string
  updated_at: string
  fingerprint: string
  /** 仅根模块允许：该树对应仓库 URL */
  repository?: string
  /** 仅叶子允许 */
  apis?: Api[]
  /** 出向依赖箭头，只在源端存储 */
  deps?: Dep[]
}

export interface ModuleFile {
  module: Module
  body: string
  /** project 目录下的相对路径（正斜杠），如 modules/demo/order/checkout/payment.md */
  file: string
}

export interface Diagnostic {
  code: string
  severity: 'error' | 'warning'
  message: string
  subject?: Record<string, unknown>
  evidence?: Record<string, unknown>
  supportedFixes?: string[]
}

export interface ValidateResult {
  ok: boolean
  errors: Diagnostic[]
  warnings: Diagnostic[]
}
