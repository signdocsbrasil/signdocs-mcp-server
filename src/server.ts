import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './client.js';
import { registerSigningSessionTools } from './tools/signingSessions.js';
import { registerEnvelopeTools } from './tools/envelopes.js';
import { registerDocumentTools } from './tools/documents.js';
import { registerTransactionTools } from './tools/transactions.js';
import { registerEvidenceTools } from './tools/evidence.js';
import { registerVerifyTools } from './tools/verify.js';
import { registerWebhookTools } from './tools/webhooks.js';
import { registerResources } from './resources.js';

export const SERVER_NAME = 'signdocs-brasil';
export const SERVER_VERSION = '0.3.0';

const INSTRUCTIONS = `SignDocs Brasil electronic-signature API.

Use signing sessions for single-signer flows and envelopes for multi-signer
documents. Read the signdocs://quickstart and signdocs://policy-profiles
resources before creating sessions.

Tools whose names start with create_, add_, cancel_, delete_, or verify_document
take real, quota-consuming, and often legally-binding actions — confirm with the
human before invoking them. All other tools are read-only or non-binding.`;

/**
 * Build a fully-wired MCP server bound to a request/session-scoped
 * {@link ToolContext}. Transport-agnostic: stdio (bin/stdio.ts) builds one
 * context from env; the HTTP transport (http/server.ts) builds one per request
 * so tenants stay isolated.
 */
export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerSigningSessionTools(server, ctx);
  registerEnvelopeTools(server, ctx);
  registerDocumentTools(server, ctx);
  registerTransactionTools(server, ctx);
  registerEvidenceTools(server, ctx);
  registerVerifyTools(server, ctx);
  registerWebhookTools(server, ctx);
  registerResources(server);

  return server;
}
