import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CreateEnvelopeRequest, AddEnvelopeSessionRequest } from '@signdocs-brasil/api';
import type { ToolContext } from '../client.js';
import { buildSigningUrl } from '../client.js';
import { CONFIRM_WARNING, DESTRUCTIVE, READ_ONLY } from '../annotations.js';
import { run, idempotencyKey, resolveDocument } from './helpers.js';
import { createEnvelopeShape, envelopeIdShape, addEnvelopeSessionShape } from '../schemas.js';

export function registerEnvelopeTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'create_envelope',
    {
      title: 'Create envelope',
      description:
        CONFIRM_WARNING +
        'Create a multi-signer envelope around one PDF. After creating, add each signer with ' +
        'add_session_to_envelope. Consumes quota.',
      inputSchema: createEnvelopeShape,
      annotations: DESTRUCTIVE,
    },
    async (args) =>
      run(async () => {
        const document = await resolveDocument(args);
        if (!document) {
          throw new Error('An envelope requires a document — provide documentBase64 or documentUrl.');
        }
        const req: CreateEnvelopeRequest = {
          signingMode: args.signingMode,
          totalSigners: args.totalSigners,
          document,
          ...(args.metadata ? { metadata: args.metadata } : {}),
          ...(args.locale ? { locale: args.locale } : {}),
          ...(args.returnUrl ? { returnUrl: args.returnUrl } : {}),
          ...(args.cancelUrl ? { cancelUrl: args.cancelUrl } : {}),
          ...(args.expiresInMinutes ? { expiresInMinutes: args.expiresInMinutes } : {}),
          ...(args.owner ? { owner: args.owner } : {}),
        };
        return ctx.client.envelopes.create(req, idempotencyKey(args.idempotencyKey));
      }),
  );

  server.registerTool(
    'get_envelope',
    {
      title: 'Get envelope',
      description: 'Get envelope details including per-signer session summaries and completion counts.',
      inputSchema: envelopeIdShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => ctx.client.envelopes.get(args.envelopeId)),
  );

  server.registerTool(
    'add_session_to_envelope',
    {
      title: 'Add signer to envelope',
      description:
        CONFIRM_WARNING +
        'Add a signing session for one signer to an envelope. Returns IDs plus a ready-to-share `signingUrl`.',
      inputSchema: addEnvelopeSessionShape,
      annotations: DESTRUCTIVE,
    },
    async (args) =>
      run(async () => {
        const req: AddEnvelopeSessionRequest = {
          signer: args.signer,
          policy: { profile: args.policyProfile },
          signerIndex: args.signerIndex,
          ...(args.purpose ? { purpose: args.purpose } : {}),
          ...(args.returnUrl ? { returnUrl: args.returnUrl } : {}),
          ...(args.cancelUrl ? { cancelUrl: args.cancelUrl } : {}),
          ...(args.metadata ? { metadata: args.metadata } : {}),
        };
        const session = await ctx.client.envelopes.addSession(args.envelopeId, req);
        return { ...session, signingUrl: buildSigningUrl(session.url, session.clientSecret) };
      }),
  );

  server.registerTool(
    'get_envelope_combined_stamp',
    {
      title: 'Get envelope combined stamp',
      description:
        'Generate the combined stamped PDF (all signers) for a COMPLETED envelope and return a download URL.',
      inputSchema: envelopeIdShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => ctx.client.envelopes.combinedStamp(args.envelopeId)),
  );
}
