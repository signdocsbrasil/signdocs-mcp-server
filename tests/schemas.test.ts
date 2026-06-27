import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createSigningSessionShape,
  createEnvelopeShape,
  listSigningSessionsShape,
  registerWebhookShape,
} from '../src/schemas.js';

const signingSession = z.object(createSigningSessionShape);

describe('createSigningSessionShape', () => {
  it('accepts a minimal valid payload', () => {
    const parsed = signingSession.parse({
      purpose: 'DOCUMENT_SIGNATURE',
      policyProfile: 'CLICK_PLUS_OTP',
      signer: { name: 'Maria', userExternalId: 'u-1', email: 'maria@example.com' },
      documentBase64: 'JVBERi0=',
    });
    expect(parsed.signer.name).toBe('Maria');
  });

  it('rejects a missing signer', () => {
    expect(() =>
      signingSession.parse({ purpose: 'DOCUMENT_SIGNATURE', policyProfile: 'CLICK_ONLY' }),
    ).toThrow();
  });

  it('rejects an invalid signer email', () => {
    expect(() =>
      signingSession.parse({
        purpose: 'DOCUMENT_SIGNATURE',
        policyProfile: 'CLICK_ONLY',
        signer: { name: 'X', userExternalId: 'u', email: 'not-an-email' },
      }),
    ).toThrow();
  });

  it('rejects an invalid purpose enum', () => {
    expect(() =>
      signingSession.parse({
        purpose: 'NOPE',
        policyProfile: 'CLICK_ONLY',
        signer: { name: 'X', userExternalId: 'u' },
      }),
    ).toThrow();
  });

  it('enforces expiresInMinutes bounds', () => {
    expect(() =>
      signingSession.parse({
        purpose: 'DOCUMENT_SIGNATURE',
        policyProfile: 'CLICK_ONLY',
        signer: { name: 'X', userExternalId: 'u' },
        expiresInMinutes: 5000,
      }),
    ).toThrow();
  });
});

describe('createEnvelopeShape', () => {
  it('requires signingMode, totalSigners and document', () => {
    const env = z.object(createEnvelopeShape);
    expect(() => env.parse({ signingMode: 'PARALLEL' })).toThrow();
    const ok = env.parse({ signingMode: 'SEQUENTIAL', totalSigners: 2, documentBase64: 'JVBERi0=' });
    expect(ok.totalSigners).toBe(2);
  });
});

describe('listSigningSessionsShape', () => {
  it('requires a status', () => {
    const s = z.object(listSigningSessionsShape);
    expect(() => s.parse({})).toThrow();
    expect(s.parse({ status: 'ACTIVE' }).status).toBe('ACTIVE');
  });
});

describe('registerWebhookShape', () => {
  it('validates url and known event enums', () => {
    const w = z.object(registerWebhookShape);
    expect(w.parse({ url: 'https://h.example/hook', events: ['TRANSACTION.COMPLETED'] }).events).toHaveLength(1);
    expect(() => w.parse({ url: 'not-a-url', events: ['TRANSACTION.COMPLETED'] })).toThrow();
    expect(() => w.parse({ url: 'https://h.example/hook', events: ['BOGUS.EVENT'] })).toThrow();
    expect(() => w.parse({ url: 'https://h.example/hook', events: [] })).toThrow();
  });
});
