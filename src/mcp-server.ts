import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import {
    CallToolRequestSchema,
    ErrorCode,
    GetPromptRequestSchema,
    ListPromptsRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    McpError,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation';
import { registerTools } from './tools.js';
import type { ToolRegistration } from './tools.js';

export const SKILL_URI = 'normify://skills/normify-gen';
const SKILL_NAME = 'normify-gen';
const SKILL_DESCRIPTION = 'Normify architecture generation and incremental maintenance workflow (original bundled skill).';

export interface NormifyServerOptions {
    rootDir?: string;
    requireBilingual?: boolean;
}

function toolResult(value: unknown): CallToolResult {
    const structuredContent = value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : { result: value ?? null };
    return {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) ?? 'null' }],
        structuredContent,
        isError: structuredContent.ok === false,
    };
}

function toolError(code: string, message: string): CallToolResult {
    return toolResult({ ok: false, error: { code, message } });
}

/** A transport-independent MCP server; importing this module never starts stdio. */
export async function createNormifyServer(options: NormifyServerOptions = {}): Promise<Server> {
    const rootDir = resolve(options.rootDir ?? process.cwd());
    if (!(await stat(rootDir)).isDirectory())
        throw new Error('Normify root must be a directory: ' + rootDir);
    const [skill, packageText] = await Promise.all([
        readFile(new URL('../skills/normify-gen/SKILL.md', import.meta.url), 'utf8'),
        readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ]);
    const packageInfo = JSON.parse(packageText) as { version: string };
    const definitions: ToolRegistration[] = [];
    registerTools({ tools: { register: definition => definitions.push(definition) } }, {
        rootDir,
        requireBilingual: options.requireBilingual ?? true,
    });
    const validator = new AjvJsonSchemaValidator();
    const tools = definitions.map(definition => {
        const inputSchema = { ...definition.parameters, type: 'object' } as Tool['inputSchema'];
        const metadata: Tool = {
            name: definition.name,
            description: definition.description,
            inputSchema,
            annotations: {
                readOnlyHint: definition.readOnly,
                destructiveHint: definition.destructive,
                idempotentHint: definition.idempotent,
                openWorldHint: false,
            },
        };
        return {
            definition,
            metadata,
            validate: validator.getValidator<Record<string, unknown>>(inputSchema as JsonSchemaType),
        };
    });
    const byName = new Map(tools.map(tool => [tool.metadata.name, tool]));
    const server = new Server({ name: 'normify', version: packageInfo.version }, {
        capabilities: { tools: {}, resources: {}, prompts: {} },
        instructions: 'Read the normify-gen prompt or resource ' + SKILL_URI + ' before architecture generation. ' +
            'Use normify_help for tool schemas and workflows. Default data root: ' + rootDir + '. ' +
            'This root is a default location, not a filesystem sandbox; explicit path arguments can access other locations.',
    });

    // Readers also join the queue, so they cannot observe a half-completed multi-file write.
    // The queue is per server process; rejected calls must not block subsequent requests.
    let pending: Promise<void> = Promise.resolve();
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map(tool => tool.metadata) }));
    server.setRequestHandler(CallToolRequestSchema, (request, extra) => {
        const result = pending.then(async (): Promise<CallToolResult> => {
            if (extra.signal.aborted)
                return toolError('request/cancelled', 'Tool call was cancelled before execution.');
            const tool = byName.get(request.params.name);
            if (tool === undefined)
                return toolError('tool/not-found', 'Unknown tool: ' + request.params.name);
            try {
                const checked = tool.validate(request.params.arguments ?? {});
                if (!checked.valid)
                    return toolError('args/schema', checked.errorMessage);
                return toolResult(await tool.definition.execute(checked.data));
            }
            catch (error) {
                return toolError('internal', error instanceof Error ? error.message : String(error));
            }
        });
        pending = result.then(() => undefined, () => undefined);
        return result;
    });
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: [{ uri: SKILL_URI, name: SKILL_NAME, description: SKILL_DESCRIPTION, mimeType: 'text/markdown' }],
    }));
    server.setRequestHandler(ReadResourceRequestSchema, async request => {
        if (request.params.uri !== SKILL_URI)
            throw new McpError(ErrorCode.InvalidParams, 'Unknown resource: ' + request.params.uri);
        return { contents: [{ uri: SKILL_URI, mimeType: 'text/markdown', text: skill }] };
    });
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
        prompts: [{ name: SKILL_NAME, description: SKILL_DESCRIPTION }],
    }));
    server.setRequestHandler(GetPromptRequestSchema, async request => {
        if (request.params.name !== SKILL_NAME)
            throw new McpError(ErrorCode.InvalidParams, 'Unknown prompt: ' + request.params.name);
        return {
            description: SKILL_DESCRIPTION,
            messages: [{ role: 'user', content: { type: 'text', text: skill } }],
        };
    });
    return server;
}
