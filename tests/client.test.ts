import { describe, it, expect } from 'vitest';
import {
  resolveEnvironment,
  getBaseUrl,
  readEnv,
  buildSigningUrl,
  DEFAULT_SCOPES,
  StaticTokenCache,
  buildClient,
} from '../src/client.js';

describe('resolveEnvironment', () => {
  it('defaults to hml when unset', () => {
    expect(resolveEnvironment(undefined)).toBe('hml');
  });
  it('accepts production and prod', () => {
    expect(resolveEnvironment('production')).toBe('production');
    expect(resolveEnvironment('PROD')).toBe('production');
  });
  it('accepts hml synonyms', () => {
    expect(resolveEnvironment('staging')).toBe('hml');
  });
  it('throws on unknown value', () => {
    expect(() => resolveEnvironment('mars')).toThrow();
  });
});

describe('getBaseUrl', () => {
  it('maps production', () => {
    expect(getBaseUrl('production')).toBe('https://api.signdocs.com.br');
  });
  it('maps hml to the dash form', () => {
    expect(getBaseUrl('hml')).toBe('https://api-hml.signdocs.com.br');
  });
  it('honors an explicit override', () => {
    expect(getBaseUrl('hml', 'https://local.test')).toBe('https://local.test');
  });
});

describe('readEnv', () => {
  const creds = { SIGNDOCS_CLIENT_ID: 'cid', SIGNDOCS_CLIENT_SECRET: 'sec' };

  it('throws when credentials are missing', () => {
    expect(() => readEnv({})).toThrow(/Missing SignDocs credentials/);
  });

  it('resolves defaults', () => {
    const cfg = readEnv({ ...creds });
    expect(cfg.environment).toBe('hml');
    expect(cfg.baseUrl).toBe('https://api-hml.signdocs.com.br');
    expect(cfg.scopes).toEqual(DEFAULT_SCOPES);
  });

  it('parses a custom space-separated scope list', () => {
    const cfg = readEnv({ ...creds, SIGNDOCS_SCOPES: 'transactions:read  evidence:read' });
    expect(cfg.scopes).toEqual(['transactions:read', 'evidence:read']);
  });

  it('selects production base URL', () => {
    const cfg = readEnv({ ...creds, SIGNDOCS_ENVIRONMENT: 'production' });
    expect(cfg.baseUrl).toBe('https://api.signdocs.com.br');
  });
});

describe('buildSigningUrl', () => {
  it('appends the embed token as ?cs=', () => {
    expect(buildSigningUrl('https://sign.example/s/abc', 'tok en/+1')).toBe(
      'https://sign.example/s/abc?cs=tok%20en%2F%2B1',
    );
  });
});

describe('StaticTokenCache', () => {
  it('returns the seeded token with a future expiry', () => {
    const cache = new StaticTokenCache('abc.def.ghi');
    const cached = cache.get();
    expect(cached?.accessToken).toBe('abc.def.ghi');
    expect(cached!.expiresAt).toBeGreaterThan(Date.now());
  });
  it('set/delete are no-ops (token stays fixed)', () => {
    const cache = new StaticTokenCache('tok');
    cache.set();
    cache.delete();
    expect(cache.get()?.accessToken).toBe('tok');
  });
});

describe('buildClient', () => {
  it('constructs a bearer-passthrough client exposing SDK resources', () => {
    const c = buildClient({ mode: 'bearer', bearer: 'tok', environment: 'hml' });
    expect(c.signingSessions).toBeDefined();
    expect(c.verification).toBeDefined();
  });
  it('constructs a credentials client', () => {
    const c = buildClient({ mode: 'credentials', clientId: 'id', clientSecret: 'sec', environment: 'production' });
    expect(c.envelopes).toBeDefined();
  });
});
