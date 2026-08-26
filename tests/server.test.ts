import { describe, it, expect } from 'vitest';
import { READ_ONLY, WRITE_SAFE, DESTRUCTIVE } from '../src/annotations.js';
import { createServer } from '../src/server.js';
import { buildClient } from '../src/client.js';

describe('annotation presets', () => {
  it('READ_ONLY marks a non-destructive read', () => {
    expect(READ_ONLY.readOnlyHint).toBe(true);
    expect(READ_ONLY.destructiveHint).toBe(false);
  });
  it('WRITE_SAFE is a write, and says so with the only word available', () => {
    // It used to declare destructiveHint:false, which was semantically truer --
    // minting an upload link destroys nothing. But Anthropic's connector-directory
    // review rejects any tool where BOTH hints are false, and marking a write
    // read-only would suppress the confirmation prompt on a state change. Between
    // over-prompting and under-warning, over-prompting is the safe error.
    expect(WRITE_SAFE.readOnlyHint).toBe(false);
    expect(WRITE_SAFE.destructiveHint).toBe(true);
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
