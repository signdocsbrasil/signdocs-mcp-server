import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../client.js';
import { WRITE_SAFE } from '../annotations.js';
import { run, errorContent } from './helpers.js';
import { requestUploadShape } from '../schemas.js';

export function registerUploadTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'request_document_upload',
    {
      title: 'Request a document upload link',
      description:
        'Get a one-time drag-and-drop upload page URL to give the user so they can upload a PDF ' +
        'directly to SignDocs (file bytes never pass through the chat). Use this when the document ' +
        'is a local file or a private Google Drive file — the user downloads it and drops it on the ' +
        'page. After they confirm the upload, pass the returned uploadToken to create_signing_session, ' +
        'create_envelope, or upload_document.',
      inputSchema: requestUploadShape,
      annotations: WRITE_SAFE,
    },
    async (args) => {
      if (!ctx.createUpload) {
        return errorContent(
          new Error('Document uploads are not configured on this server. Use documentUrl with a public PDF link instead.'),
        );
      }
      const createUpload = ctx.createUpload;
      return run(async () => {
        const { uploadToken, uploadPageUrl } = await createUpload(args.filename ? { filename: args.filename } : {});
        return {
          uploadToken,
          uploadPageUrl,
          instructions:
            'Share uploadPageUrl with the user and ask them to open it, drag in the PDF, and confirm when it says ' +
            'the upload is complete. Then create the signing session/envelope using this uploadToken.',
        };
      });
    },
  );
}
