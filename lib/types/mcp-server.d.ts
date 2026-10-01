import { Server } from '@modelcontextprotocol/sdk/server/index.js';
export declare const SKILL_URI = "normify://skills/normify-gen";
export interface NormifyServerOptions {
    rootDir?: string;
    requireBilingual?: boolean;
}
/** A transport-independent MCP server; importing this module never starts stdio. */
export declare function createNormifyServer(options?: NormifyServerOptions): Promise<Server>;
