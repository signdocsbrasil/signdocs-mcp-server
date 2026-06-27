import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../client.js';
import { READ_ONLY, WRITE_SAFE } from '../annotations.js';
import { run } from './helpers.js';
import { uploadDocumentShape, transactionIdShape } from '../schemas.js';

export function registerDocumentTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'upload_document',
    {
      title: 'Upload document',
      description: 'Upload a base64-encoded PDF to an existing transaction (≤10MB inline; use presign for larger).',
      inputSchema: uploadDocumentShape,
      annotations: WRITE_SAFE,
    },
    async (args) =>
      run(() =>
        ctx.client.documents.upload(args.transactionId, {
          content: args.documentBase64,
          ...(args.filename ? { filename: args.filename } : {}),
        }),
      ),
  );

  server.registerTool(
    'download_document',
    {
      title: 'Download document',
      description: 'Get presigned download URLs for a transaction’s document and signed artifacts.',
      inputSchema: transactionIdShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => ctx.client.documents.download(args.transactionId)),
  );
}
