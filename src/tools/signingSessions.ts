import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CreateSigningSessionRequest } from '@signdocs-brasil/api';
import type { ToolContext } from '../client.js';
import { buildSigningUrl } from '../client.js';
import { CONFIRM_WARNING, DESTRUCTIVE, READ_ONLY, WRITE_SAFE } from '../annotations.js';
import { run, idempotencyKey } from './helpers.js';
import {
  createSigningSessionShape,
  sessionIdShape,
  listSigningSessionsShape,
  resendOtpShape,
} from '../schemas.js';

export function registerSigningSessionTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'create_signing_session',
    {
      title: 'Create signing session',
      description:
        CONFIRM_WARNING +
        'Create a single-signer "express" signing (or action-authentication) session and return its ' +
        'IDs plus a ready-to-share `signingUrl` (url + embed token). Consumes signature quota.',
      inputSchema: createSigningSessionShape,
      annotations: DESTRUCTIVE,
    },
    async (args) =>
      run(async () => {
        const req: CreateSigningSessionRequest = {
          purpose: args.purpose,
          policy: {
            profile: args.policyProfile,
            ...(args.customSteps ? { customSteps: args.customSteps } : {}),
          },
          signer: args.signer,
          ...(args.documentBase64
            ? { document: { content: args.documentBase64, filename: args.documentFilename } }
            : {}),
          ...(args.action ? { action: args.action } : {}),
          ...(args.returnUrl ? { returnUrl: args.returnUrl } : {}),
          ...(args.cancelUrl ? { cancelUrl: args.cancelUrl } : {}),
          ...(args.metadata ? { metadata: args.metadata } : {}),
          ...(args.locale ? { locale: args.locale } : {}),
          ...(args.expiresInMinutes ? { expiresInMinutes: args.expiresInMinutes } : {}),
          ...(args.owner ? { owner: args.owner } : {}),
        };
        const session = await ctx.client.signingSessions.create(req, idempotencyKey(args.idempotencyKey));
        return { ...session, signingUrl: buildSigningUrl(session.url, session.clientSecret) };
      }),
  );

  server.registerTool(
    'get_signing_session_status',
    {
      title: 'Get signing session status',
      description: 'Poll the current status of a signing session (ACTIVE/COMPLETED/CANCELLED/EXPIRED/FAILED).',
      inputSchema: sessionIdShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => ctx.client.signingSessions.getStatus(args.sessionId)),
  );

  server.registerTool(
    'get_signing_session',
    {
      title: 'Get signing session details',
      description: 'Get full bootstrap data for a signing session (signer, steps, document, appearance).',
      inputSchema: sessionIdShape,
      annotations: READ_ONLY,
    },
    async (args) => run(() => ctx.client.signingSessions.get(args.sessionId)),
  );

  server.registerTool(
    'list_signing_sessions',
    {
      title: 'List signing sessions',
      description: 'List signing sessions filtered by status, with cursor pagination.',
      inputSchema: listSigningSessionsShape,
      annotations: READ_ONLY,
    },
    async (args) =>
      run(() =>
        ctx.client.signingSessions.list({
          status: args.status,
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
          ...(args.cursor ? { cursor: args.cursor } : {}),
        }),
      ),
  );

  server.registerTool(
    'cancel_signing_session',
    {
      title: 'Cancel signing session',
      description: CONFIRM_WARNING + 'Cancel an active signing session. This cannot be undone.',
      inputSchema: sessionIdShape,
      annotations: DESTRUCTIVE,
    },
    async (args) => run(() => ctx.client.signingSessions.cancel(args.sessionId)),
  );

  server.registerTool(
    'resend_signing_session_otp',
    {
      title: 'Resend signing session OTP',
      description: 'Resend the OTP challenge for a signing session, optionally over a specific channel (email/sms).',
      inputSchema: resendOtpShape,
      annotations: WRITE_SAFE,
    },
    async (args) =>
      run(() =>
        ctx.client.signingSessions.resendOtp(args.sessionId, args.channel ? { channel: args.channel } : undefined),
      ),
  );
}
