export declare const HELP_TOPICS: readonly ["fields", "deps", "renders", "flow", "tools", "policy", "errors", "all"];
export type HelpTopic = (typeof HELP_TOPICS)[number];
export interface ToolCatalogEntry {
    name: string;
    description: string;
    behavior: string;
    /** 该工具的 JSON Schema（help 的 tool:<name> 主题据此打印参数树）。 */
    parameters?: unknown;
}
export declare function topicReference(topic: HelpTopic, catalog?: ToolCatalogEntry[]): {
    title: string;
    text: string;
};
/** 单个工具的完整参数树（help 的 `tool:<name>` 主题）。 */
export declare function toolReference(entry: ToolCatalogEntry | undefined): {
    title: string;
    text: string;
};
