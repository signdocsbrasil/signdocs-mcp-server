import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ToolContext } from '../client.js';
import { CONFIRM_WARNING, DESTRUCTIVE, READ_ONLY } from '../annotations.js';
import { run, runWithLinks } from '../tools/helpers.js';
import {
  channelCreateEnvelopeShape,
  channelCreateSessionShape,
  channelEnvelopeIdShape,
  channelEvidenceShape,
  channelSessionIdShape,
  channelSignedDocumentShape,
  channelVerifyDocumentShape,
  channelVerifyEvidenceShape,
  emptyShape,
} from './schemas.js';
import type { ChannelApi, ChannelDocument } from './types.js';

/**
 * Account-mode tools.
 *
 * Thin wrappers over the host's {@link ChannelApi}: everything that makes
 * account mode safe — quota, ownership, sub-user rules, the `owner` stamp —
 * lives host-side, so these do argument shaping and nothing else.
 *
 * What is NOT here is as deliberate as what is. `list_transactions`,
 * `get_transaction`, `list_signing_sessions` and all four webhook tools read
 * across a tenant, and in account mode the tenant is shared by every user of
 * the channel — so exposing them would hand one user another user's data. They
 * are omitted rather than filtered, because a filter is something you can
 * forget to apply to the next endpoint.
 */

function channel(ctx: ToolContext): ChannelApi {
  if (!ctx.channelApi) {
    throw new Error('This server is not configured for account mode.');
  }
  return ctx.channelApi;
}

/**
 * No `documentBase64` here on purpose — see channel/schemas.ts. Dropping the
 * mapping as well as the field means a client still sending the OLD cached
 * schema cannot smuggle model-authored bytes through this path either.
 */
function documentFrom(args: {
  uploadToken?: string;
  documentUrl?: string;
  documentFilename?: string;
}): ChannelDocument {
  return {
    ...(args.uploadToken ? { uploadToken: args.uploadToken } : {}),
    ...(args.documentUrl ? { documentUrl: args.documentUrl } : {}),
    ...(args.documentFilename ? { filename: args.documentFilename } : {}),
  };
}

export function registerChannelTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_my_account',
    {
      title: 'Get my SignDocs account and quota',
      description:
        'Show the signed-in account, its plan, and how many documents remain this period. ' +
        'Call this before a send if you are unsure whether there is quota left. ' +
        'Also returns `user.profile` — the nome/razão social and CPF/CNPJ the account is ' +
        'registered under. When the user is signing their OWN document, copy those values into ' +
        'the signer row verbatim: the server refuses a self-signer row that disagrees with the ' +
        'cadastro, and a chat has no form to correct it in.',
      inputSchema: emptyShape,
      annotations: READ_ONLY,
    },
    async () => run(() => channel(ctx).initSession()),
  );

  server.registerTool(
    'create_signing_session',
    {
      title: 'Create signing session',
      description:
        CONFIRM_WARNING +
        'Send a PDF to ONE signer and return the session id plus, where the profile allows it, a ' +
        'ready-to-share `signingUrl`. Consumes one document from your plan. ' +
        'Note: for CLICK_ONLY the link IS the authentication, so when the signer is somebody else ' +
        'it is e-mailed to them and deliberately not returned here.',
      inputSchema: channelCreateSessionShape,
      annotations: DESTRUCTIVE,
    },
    async (args) =>
      run(() =>
        channel(ctx).createSigningSession({
          document: documentFrom(args),
          signer: args.signer,
          policyProfile: args.policyProfile,
          ...(args.purpose ? { purpose: args.purpose } : {}),
          // Minted here, not asked of the model. Quota is one pool and is never
          // refunded, so a retry that arrives without a stable key bills a
          // second document for the same send.
          idempotencyKey: randomUUID(),
        }),
      ),
  );

  server.registerTool(
    'create_envelope',
    {
      title: 'Create multi-signer envelope',
      description:
        CONFIRM_WARNING +
        'Send ONE PDF to several signers in a single call — there is no separate add-signer step. ' +
        'Costs one document from your plan for the whole envelope, no matter how many signers.',
      inputSchema: channelCreateEnvelopeShape,
      annotations: DESTRUCTIVE,
    },
    async (args) =>
      run(() =>
        channel(ctx).createEnvelope({
          document: documentFrom(args),
          signers: args.signers,
          ...(args.signingMode ? { signingMode: args.signingMode } : {}),
          idempotencyKey: randomUUID(),
        }),
      ),
  );

  server.registerTool(
    'get_signing_session_status',
    {
      title: 'Get signing session status',
      description: 'Poll one of your signing sessions (ACTIVE/COMPLETED/CANCELLED/EXPIRED/FAILED).',
      inputSchema: channelSessionIdShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => channel(ctx).getSessionStatus(args.sessionId)),
  );

  server.registerTool(
    'get_envelope',
    {
      title: 'Get envelope status',
      description: 'Poll one of your envelopes: overall status and how many signers have completed.',
      inputSchema: channelEnvelopeIdShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => channel(ctx).getEnvelopeStatus(args.envelopeId)),
  );

  server.registerTool(
    'cancel_signing_session',
    {
      title: 'Cancel signing session',
      description:
        CONFIRM_WARNING +
        'Cancel a pending signing session. This does NOT return the document to your quota — ' +
        'cancelling and re-sending costs a second document.',
      inputSchema: channelSessionIdShape,
      annotations: DESTRUCTIVE,
    },
    async (args) => run(() => channel(ctx).cancelSession(args.sessionId)),
  );

  server.registerTool(
    'cancel_envelope',
    {
      title: 'Cancel envelope',
      description:
        CONFIRM_WARNING +
        'Cancel every still-pending signature in an envelope. Quota is not returned.',
      inputSchema: channelEnvelopeIdShape,
      annotations: DESTRUCTIVE,
    },
    async (args) => run(() => channel(ctx).cancelEnvelope(args.envelopeId)),
  );

  server.registerTool(
    'download_document',
    {
      title: 'Download the signed document',
      description:
        'Get a short-lived link to the signed PDF. Pass sessionId for a single-signer send, or ' +
        'envelopeId for the combined stamped PDF of a multi-signer one.',
      inputSchema: channelSignedDocumentShape,
      annotations: READ_ONLY,
    },
    async (args) =>
      // runWithLinks so the presigned URL comes back shortened: models corrupt
      // the ~2KB signature token when re-emitting a long URL as a link.
      runWithLinks(ctx, () =>
        channel(ctx).getSignedDocument({
          ...(args.sessionId ? { sessionId: args.sessionId } : {}),
          ...(args.envelopeId ? { envelopeId: args.envelopeId } : {}),
        }),
      ),
  );

  server.registerTool(
    'get_evidence',
    {
      title: 'Get the evidence pack',
      description:
        'Retrieve the signed evidence pack (.p7m) for one of your sends — who signed, when, ' +
        'from where, and how they were authenticated.',
      inputSchema: channelEvidenceShape,
      annotations: READ_ONLY,
    },
    async (args) => runWithLinks(ctx, () => channel(ctx).getEvidence(args.sessionId)),
  );

  server.registerTool(
    'verify_evidence',
    {
      title: 'Verify an evidence pack',
      description: 'Check that an evidence pack is authentic and unmodified. Read-only, no quota.',
      inputSchema: channelVerifyEvidenceShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => channel(ctx).verifyEvidence(args)),
  );

  server.registerTool(
    'verify_envelope',
    {
      title: 'Verify an envelope',
      description: 'Check every signature in an envelope at once. Read-only, no quota.',
      inputSchema: channelEnvelopeIdShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => channel(ctx).verifyEnvelope({ envelopeId: args.envelopeId })),
  );

  server.registerTool(
    'verify_document',
    {
      title: 'Verify a signed PDF',
      description:
        'Check whether a signed PDF is authentic and who signed it. Works on any SignDocs-signed ' +
        'document, not only your own. Rate-limited per account.',
      inputSchema: channelVerifyDocumentShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => channel(ctx).verifyDocument(documentFrom(args))),
  );
}
