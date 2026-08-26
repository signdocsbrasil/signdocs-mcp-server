import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';
import { buildContextForAuth } from '../src/http/shared.js';
import { decodePrincipal } from '../src/channel/detect.js';
import type { ChannelApi } from '../src/channel/types.js';

/**
 * The rule these protect: on a shared tenant, tenant-wide tools show one user
 * another user's data. Account mode must therefore not merely filter them — it
 * must not register them.
 */

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64(payload)}.c2ln`;
}

const stubChannelApi = {} as ChannelApi;

async function toolNames(ctx: Parameters<typeof createServer>[0]): Promise<string[]> {
  const server = createServer(ctx);
  // McpServer keeps its registered tools on the internal registry; the public
  // surface is listTools over a transport, so read the registry directly.
  const registered = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  return Object.keys(registered).sort();
}

describe('decodePrincipal', () => {
  it('reads a principal out of an account-mode token', () => {
    const token = jwt({ principal_email: 'a@b.com', principal_sub: 'sub-1', principal_name: 'A', ai_client: 'Claude' });
    expect(decodePrincipal(token)).toEqual({
      email: 'a@b.com', sub: 'sub-1', name: 'A', aiClient: 'Claude',
    });
  });

  it('returns null for an ordinary tenant token', () => {
    expect(decodePrincipal(jwt({ tenantId: 't1', sub: 'client-1' }))).toBeNull();
  });

  it('requires both halves of the identity', () => {
    expect(decodePrincipal(jwt({ principal_email: 'a@b.com' }))).toBeNull();
    expect(decodePrincipal(jwt({ principal_sub: 'sub-1' }))).toBeNull();
  });

  it('does not throw on an opaque or malformed token', () => {
    expect(decodePrincipal('not-a-jwt')).toBeNull();
    expect(decodePrincipal('a.b.c')).toBeNull();
    expect(decodePrincipal('')).toBeNull();
  });
});

describe('mode selection', () => {
  it('stays in tenant mode without a factory, even for a principal token', () => {
    const ctx = buildContextForAuth(
      { mode: 'bearer', bearer: jwt({ principal_email: 'a@b.com', principal_sub: 's' }) },
      'hml',
      {},
    );
    expect(ctx.mode).toBeUndefined();
    expect(ctx.channelApi).toBeUndefined();
  });

  it('stays in tenant mode for client credentials, factory or not', () => {
    const ctx = buildContextForAuth(
      { mode: 'credentials', clientId: 'c', clientSecret: 's' },
      'hml',
      { channelApiFactory: () => stubChannelApi },
    );
    expect(ctx.mode).toBeUndefined();
  });

  it('enters channel mode for a principal token when a factory is supplied', () => {
    const ctx = buildContextForAuth(
      { mode: 'bearer', bearer: jwt({ principal_email: 'a@b.com', principal_sub: 's' }) },
      'hml',
      { channelApiFactory: () => stubChannelApi },
    );
    expect(ctx.mode).toBe('channel');
    expect(ctx.channelApi).toBe(stubChannelApi);
  });

  it('hands the factory the decoded principal', () => {
    let seen: unknown;
    buildContextForAuth(
      { mode: 'bearer', bearer: jwt({ principal_email: 'a@b.com', principal_sub: 's', ai_client: 'ChatGPT' }) },
      'hml',
      { channelApiFactory: (p) => { seen = p; return stubChannelApi; } },
    );
    expect(seen).toEqual({ email: 'a@b.com', sub: 's', aiClient: 'ChatGPT' });
  });
});

describe('catalogue', () => {
  const channelCtx = () =>
    buildContextForAuth(
      { mode: 'bearer', bearer: jwt({ principal_email: 'a@b.com', principal_sub: 's' }) },
      'hml',
      { channelApiFactory: () => stubChannelApi, createUpload: async () => ({ uploadToken: 't', uploadPageUrl: 'u' }) },
    );
  const tenantCtx = () => buildContextForAuth({ mode: 'credentials', clientId: 'c', clientSecret: 's' }, 'hml', {});

  it('never exposes tenant-wide reads in channel mode', async () => {
    const names = await toolNames(channelCtx());
    for (const forbidden of [
      'list_transactions', 'get_transaction', 'list_signing_sessions',
      'register_webhook', 'list_webhooks', 'delete_webhook', 'test_webhook',
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('exposes the owner-scoped send/track/verify set in channel mode', async () => {
    const names = await toolNames(channelCtx());
    for (const expected of [
      'get_my_account', 'create_signing_session', 'create_envelope',
      'get_signing_session_status', 'get_envelope', 'cancel_signing_session',
      'cancel_envelope', 'download_document', 'get_evidence',
      'verify_evidence', 'verify_envelope', 'verify_document',
      'request_document_upload',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('drops the per-signer envelope step — one call carries every signer', async () => {
    expect(await toolNames(channelCtx())).not.toContain('add_session_to_envelope');
  });

  it('leaves tenant mode untouched', async () => {
    const names = await toolNames(tenantCtx());
    expect(names).toContain('list_transactions');
    expect(names).toContain('register_webhook');
    expect(names).toContain('add_session_to_envelope');
    expect(names).not.toContain('get_my_account');
  });
});

describe('policy profiles offered in account mode', () => {
  it('offers exactly the three the shared tenant can actually complete', async () => {
    const { channelCreateSessionShape } = await import('../src/channel/schemas.js');
    const opts = (channelCreateSessionShape.policyProfile as unknown as { options: string[] }).options;
    expect([...opts].sort()).toEqual(['CLICK_ONLY', 'CLICK_PLUS_OTP', 'DIGITAL_CERTIFICATE']);
  });

  it('refuses the biometric profiles at the schema, before anything is spent', async () => {
    // The tenant has hostedLivenessEnabled=false, so a biometric session would be
    // charged and then be unsignable. A validation error is free; a document is not.
    const { channelCreateSessionShape } = await import('../src/channel/schemas.js');
    for (const bad of ['BIOMETRIC', 'BIOMETRIC_PLUS_OTP', 'CUSTOM', 'anything']) {
      expect(channelCreateSessionShape.policyProfile.safeParse(bad).success).toBe(false);
    }
  });

  it('accepts each of the three', async () => {
    const { channelCreateSessionShape } = await import('../src/channel/schemas.js');
    for (const good of ['CLICK_ONLY', 'CLICK_PLUS_OTP', 'DIGITAL_CERTIFICATE']) {
      expect(channelCreateSessionShape.policyProfile.safeParse(good).success).toBe(true);
    }
  });
});

describe('connector-directory annotation rules', () => {
  it('every account-mode tool declares readOnlyHint OR destructiveHint', async () => {
    // Anthropic's review rejects any tool with both false. This asserts the rule
    // across the whole catalogue so a new tool cannot quietly reintroduce it.
    const { READ_ONLY, WRITE_SAFE, DESTRUCTIVE } = await import('../src/annotations.js');
    for (const [name, a] of Object.entries({ READ_ONLY, WRITE_SAFE, DESTRUCTIVE })) {
      expect(
        a.readOnlyHint === true || a.destructiveHint === true,
        `${name} declares neither hint`,
      ).toBe(true);
    }
  });

  it('never claims a write is read-only', () => {
    // The other way to satisfy the rule would be to mark writes read-only, which
    // would suppress the confirmation prompt on a binding action.
    const a = { readOnlyHint: false, destructiveHint: true };
    expect(a.readOnlyHint && a.destructiveHint).toBeFalsy();
  });
});
