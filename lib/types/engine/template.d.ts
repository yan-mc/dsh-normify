/** 单文件自包含 HTML（内联 CSS/JS，无外部依赖）。 */
export interface RenderSummary {
    name: string;
    stats: Record<string, unknown>;
    compiledAt: string;
    treeSha12: string;
}
export declare function renderTemplate(dataJson: string, summary: RenderSummary): string;
