import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SignDocsBrasilClient } from '@signdocs-brasil/api';
import { registerEnvelopeTools } from '../src/tools/envelopes.js';
import type { ToolContext } from '../src/client.js';

type Handler = (args: any) => Promise<unknown>;

/**
 * Register the envelope tools against a stub server + client so we can assert
 * exactly what gets sent to the SignDocs API — the tool schemas alone can't
 * prove the handler forwards a field.
 */
function harness() {
  const handlers = new Map<string, Handler>();
  const calls: Array<{ envelopeId: string; request: any }> = [];

  const server = {
    registerTool(name: string, _config: unknown, handler: Handler) {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;

  const client = {
    envelopes: {
      async addSession(envelopeId: string, request: any) {
        calls.push({ envelopeId, request });
        return { sessionId: 'sess_1', url: 'https://sign.example/s/1', clientSecret: 'cs-token' };
      },
    },
  } as unknown as SignDocsBrasilClient;

  const ctx: ToolContext = { client, environment: 'hml' };
  registerEnvelopeTools(server, ctx);
  return { handlers, calls };
}

const baseArgs = {
  envelopeId: 'env_1',
  signer: { name: 'Maria', userExternalId: 'u-1', cpf: '12345678901' },
  signerIndex: 1,
};

describe('add_session_to_envelope', () => {
  it('forwards customSteps under policy for the CUSTOM profile', async () => {
    const { handlers, calls } = harness();
    await handlers.get('add_session_to_envelope')!({
      ...baseArgs,
      policyProfile: 'CUSTOM',
      customSteps: ['CLICK_ACCEPT', 'OTP_CHALLENGE', 'OTP_VERIFY'],
    });
    expect(calls[0].request.policy).toEqual({
      profile: 'CUSTOM',
      customSteps: ['CLICK_ACCEPT', 'OTP_CHALLENGE', 'OTP_VERIFY'],
    });
  });

  it('omits customSteps entirely when not supplied', async () => {
    const { handlers, calls } = harness();
    await handlers.get('add_session_to_envelope')!({ ...baseArgs, policyProfile: 'CLICK_ONLY' });
    expect(calls[0].request.policy).toEqual({ profile: 'CLICK_ONLY' });
    expect('customSteps' in calls[0].request.policy).toBe(false);
  });

  it('passes signerIndex through unchanged (the API is one-based)', async () => {
    const { handlers, calls } = harness();
    await handlers.get('add_session_to_envelope')!({ ...baseArgs, signerIndex: 3, policyProfile: 'CLICK_ONLY' });
    expect(calls[0].request.signerIndex).toBe(3);
  });
});
