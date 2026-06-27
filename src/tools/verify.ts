import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../client.js';
import { CONFIRM_WARNING, DESTRUCTIVE, READ_ONLY } from '../annotations.js';
import { run, errorContent } from './helpers.js';
import { verifyEvidenceShape, verifyEnvelopeShape, verifyDocumentShape } from '../schemas.js';

export function registerVerifyTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'verify_evidence',
    {
      title: 'Verify evidence (public)',
      description:
        'Publicly verify a completed signature by its evidenceId. Returns status, document/evidence hashes, ' +
        'steps and signer display info. No authentication needed.',
      inputSchema: verifyEvidenceShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => ctx.client.verification.verify(args.evidenceId)),
  );

  server.registerTool(
    'verify_envelope',
    {
      title: 'Verify envelope (public)',
      description: 'Publicly verify all signers of an envelope and get consolidated download URLs.',
      inputSchema: verifyEnvelopeShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => ctx.client.verification.verifyEnvelope(args.envelopeId)),
  );

  server.registerTool(
    'verify_document',
    {
      title: 'Verify document signatures',
      description:
        CONFIRM_WARNING +
        'Inspect an uploaded PDF for embedded electronic/digital signatures. ' +
        'Requires PRODUCTION credentials + the verification:write scope and CONSUMES verification quota. ' +
        'Not available in HML.',
      inputSchema: verifyDocumentShape,
      annotations: DESTRUCTIVE,
    },
    async (args) => {
      if (ctx.environment !== 'production') {
        return errorContent(
          new Error(
            'verify_document is PRODUCTION-only — the signature-detection backend is not provisioned in HML. ' +
              'Set SIGNDOCS_ENVIRONMENT=production with a production credential to use it.',
          ),
        );
      }
      return run(() =>
        ctx.client.verification.verifyDocument({
          content: args.documentBase64,
          ...(args.filename ? { filename: args.filename } : {}),
        }),
      );
    },
  );
}
