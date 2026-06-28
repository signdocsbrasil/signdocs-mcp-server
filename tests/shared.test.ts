import { describe, it, expect } from 'vitest';
import { extractAuthFromHeaders } from '../src/http/shared.js';

describe('extractAuthFromHeaders', () => {
  it('parses Bearer', () => {
    expect(extractAuthFromHeaders({ authorization: 'Bearer abc.def' })).toEqual({
      mode: 'bearer',
      bearer: 'abc.def',
    });
  });

  it('parses Basic client credentials', () => {
    const basic = Buffer.from('cid:sec').toString('base64');
    expect(extractAuthFromHeaders({ authorization: `Basic ${basic}` })).toEqual({
      mode: 'credentials',
      clientId: 'cid',
      clientSecret: 'sec',
    });
  });

  it('parses X-SignDocs-Client-Id/Secret headers (no base64)', () => {
    expect(
      extractAuthFromHeaders({
        'x-signdocs-client-id': 'cid',
        'x-signdocs-client-secret': 'sec',
      }),
    ).toEqual({ mode: 'credentials', clientId: 'cid', clientSecret: 'sec' });
  });

  it('Authorization takes precedence over the X-SignDocs-* headers', () => {
    expect(
      extractAuthFromHeaders({
        authorization: 'Bearer tok',
        'x-signdocs-client-id': 'cid',
        'x-signdocs-client-secret': 'sec',
      }),
    ).toEqual({ mode: 'bearer', bearer: 'tok' });
  });

  it('returns null when nothing usable is present', () => {
    expect(extractAuthFromHeaders({})).toBeNull();
    expect(extractAuthFromHeaders({ 'x-signdocs-client-id': 'cid' })).toBeNull(); // secret missing
  });
});
