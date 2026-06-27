import { describe, it, expect } from 'vitest';
import { READ_ONLY, WRITE_SAFE, DESTRUCTIVE } from '../src/annotations.js';
import { createServer } from '../src/server.js';
import { buildClient } from '../src/client.js';

describe('annotation presets', () => {
  it('READ_ONLY marks a non-destructive read', () => {
    expect(READ_ONLY.readOnlyHint).toBe(true);
    expect(READ_ONLY.destructiveHint).toBe(false);
  });
  it('WRITE_SAFE is a non-destructive write', () => {
    expect(WRITE_SAFE.readOnlyHint).toBe(false);
    expect(WRITE_SAFE.destructiveHint).toBe(false);
  });
  it('DESTRUCTIVE flags consequential actions', () => {
    expect(DESTRUCTIVE.readOnlyHint).toBe(false);
    expect(DESTRUCTIVE.destructiveHint).toBe(true);
  });
});

describe('createServer', () => {
  it('builds with an injected tool context', () => {
    const ctx = {
      client: buildClient({ mode: 'credentials', clientId: 'cid', clientSecret: 'sec', environment: 'hml' }),
      environment: 'hml' as const,
    };
    expect(() => createServer(ctx)).not.toThrow();
  });
});
