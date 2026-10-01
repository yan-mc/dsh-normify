#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createNormifyServer } from './mcp-server.js';
const HELP = `Usage: normify-mcp [--root <directory>] [--help]

Run Normify's tools and bundled normify-gen skill over MCP stdio.

  --root <directory>  Default architecture-data root (default: current directory).
                      Relative paths resolve against the current directory.
  -h, --help          Show this help and exit.

The root must already exist. It is a default location, not a filesystem sandbox.
In server mode stdout is reserved for the MCP protocol; diagnostics use stderr.
`;
async function main() {
    const { values } = parseArgs({
        options: { root: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
        strict: true,
        allowPositionals: false,
    });
    if (values.help) {
        process.stdout.write(HELP);
        return;
    }
    if (values.root !== undefined && values.root.trim() === '')
        throw new Error('--root must be a non-empty directory path.');
    const server = await createNormifyServer({ rootDir: values.root });
    server.onerror = error => process.stderr.write('[normify-mcp] ' + error.message + '\n');
    const stop = () => {
        void server.close().catch(error => {
            process.stderr.write('[normify-mcp] ' + String(error) + '\n');
            process.exitCode = 1;
        });
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    await server.connect(new StdioServerTransport());
}
main().catch(error => {
    process.stderr.write('[normify-mcp] ' + (error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
});
//# sourceMappingURL=mcp.js.map