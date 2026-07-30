import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createSigningSessionShape,
  createEnvelopeShape,
  addEnvelopeSessionShape,
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

describe('addEnvelopeSessionShape', () => {
  const addSession = z.object(addEnvelopeSessionShape);
  const base = {
    envelopeId: 'env_1',
    signer: { name: 'Maria', userExternalId: 'u-1', cpf: '12345678901' },
    policyProfile: 'CLICK_ONLY',
  };

  // The API validates `signerIndex >= 1` and rejects 0 with
  // "signerIndex must be a positive integer (1-based)".
  it('rejects signerIndex 0 — the API is one-based', () => {
    expect(() => addSession.parse({ ...base, signerIndex: 0 })).toThrow();
  });

  it('accepts a one-based signerIndex', () => {
    expect(addSession.parse({ ...base, signerIndex: 1 }).signerIndex).toBe(1);
  });

  // CUSTOM is a valid profile here, and the API 422s without customSteps.
  it('carries customSteps for the CUSTOM profile', () => {
    const parsed = addSession.parse({
      ...base,
      policyProfile: 'CUSTOM',
      signerIndex: 2,
      customSteps: ['CLICK_ACCEPT', 'OTP_CHALLENGE', 'OTP_VERIFY'],
    });
    expect(parsed.customSteps).toEqual(['CLICK_ACCEPT', 'OTP_CHALLENGE', 'OTP_VERIFY']);
  });

  it('leaves customSteps optional for the built-in profiles', () => {
    expect(addSession.parse({ ...base, signerIndex: 1 }).customSteps).toBeUndefined();
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
