export declare const HELP_TOPICS: readonly ["fields", "deps", "renders", "flow", "tools", "policy", "errors", "all"];
export type HelpTopic = (typeof HELP_TOPICS)[number];
export interface ToolCatalogEntry {
    name: string;
    description: string;
    behavior: string;
}
export declare function topicReference(topic: HelpTopic, catalog?: ToolCatalogEntry[]): {
    title: string;
    text: string;
};
