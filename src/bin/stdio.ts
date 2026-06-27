#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../server.js';

/**
 * stdio entrypoint. AI clients (Claude Desktop/Code, Cursor, …) launch this
 * binary and speak MCP over stdin/stdout. NEVER write to stdout here — it is
 * the protocol channel; diagnostics go to stderr.
 */
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[signdocs-mcp] server started on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`[signdocs-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
