import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './client.js';
import { registerSigningSessionTools } from './tools/signingSessions.js';
import { registerEnvelopeTools } from './tools/envelopes.js';
import { registerDocumentTools } from './tools/documents.js';
import { registerTransactionTools } from './tools/transactions.js';
import { registerEvidenceTools } from './tools/evidence.js';
import { registerVerifyTools } from './tools/verify.js';
import { registerWebhookTools } from './tools/webhooks.js';
import { registerUploadTools } from './tools/uploads.js';
import { registerResources } from './resources.js';
import { registerChannelTools } from './channel/tools.js';

export const SERVER_NAME = 'signdocs-brasil';
export const SERVER_VERSION = '0.8.0';

const INSTRUCTIONS = `SignDocs Brasil electronic-signature API.

Use signing sessions for single-signer flows and envelopes for multi-signer
documents. Read the signdocs://quickstart and signdocs://policy-profiles
resources before creating sessions.

Tools whose names start with create_, add_, cancel_, delete_, or verify_document
take real, quota-consuming, and often legally-binding actions — confirm with the
human before invoking them. All other tools are read-only or non-binding.`;

const CHANNEL_INSTRUCTIONS = `SignDocs Brasil electronic signatures, signed in with the
user's own SignDocs account.

Sending a document spends one document from their plan — per document, not per
signer, and it is NOT returned if the send is later cancelled. Say so before
sending, and call get_my_account if you are unsure any allowance is left.

To sign a file the user has locally, call request_document_upload and give them
the link: attached bytes never reach these tools. A multi-signer send is ONE
create_envelope call carrying every signer.

Read the signdocs://quickstart and signdocs://policy-profiles resources before
creating sessions. Tools named create_* and cancel_* are consequential and
often legally binding — confirm with the human first.`;

/**
 * Build a fully-wired MCP server bound to a request/session-scoped
 * {@link ToolContext}. Transport-agnostic: stdio (bin/stdio.ts) builds one
 * context from env; the HTTP transport (http/server.ts) builds one per request
 * so tenants stay isolated.
 */
export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: ctx.mode === 'channel' ? CHANNEL_INSTRUCTIONS : INSTRUCTIONS },
  );

  // Account mode gets its own, smaller catalogue. Registering it INSTEAD of the
  // tenant tools rather than alongside them is the point: on a shared tenant
  // the tenant-wide reads would show one user another user's documents, so they
  // must not exist on this server at all.
  if (ctx.mode === 'channel') {
    registerChannelTools(server, ctx);
    registerUploadTools(server, ctx);
    registerResources(server);
    return server;
  }

  registerSigningSessionTools(server, ctx);
  registerEnvelopeTools(server, ctx);
  registerDocumentTools(server, ctx);
  registerTransactionTools(server, ctx);
  registerEvidenceTools(server, ctx);
  registerVerifyTools(server, ctx);
  registerWebhookTools(server, ctx);
  registerUploadTools(server, ctx);
  registerResources(server);

  return server;
}
