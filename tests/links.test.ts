import { describe, it, expect } from 'vitest';
import { runWithLinks } from '../src/tools/helpers.js';

const presigned = 'https://bucket.s3.us-east-1.amazonaws.com/x.p7m?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef';
const plain = 'https://www.signdocs.com.br/x';

describe('runWithLinks (presigned URL shortening)', () => {
  it('replaces presigned URLs (deep) when shortenUrl is set, leaving plain ones', async () => {
    const shorten = async (u: string) => `https://mcp-hml.signdocs.com.br/d/SHORT_${u.length}`;
    const r = await runWithLinks({ shortenUrl: shorten }, async () => ({
      originalUrl: presigned,
      website: plain,
      nested: { signedUrl: presigned, n: 5 },
      list: [presigned, plain],
    }));
    const data = JSON.parse(r.content[0].text);
    expect(data.originalUrl).toMatch(/\/d\/SHORT_/);
    expect(data.nested.signedUrl).toMatch(/\/d\/SHORT_/);
    expect(data.list[0]).toMatch(/\/d\/SHORT_/);
    expect(data.website).toBe(plain);     // untouched
    expect(data.list[1]).toBe(plain);     // untouched
    expect(data.nested.n).toBe(5);
  });

  it('passes through unchanged when no shortener', async () => {
    const r = await runWithLinks({}, async () => ({ originalUrl: presigned }));
    expect(JSON.parse(r.content[0].text).originalUrl).toBe(presigned);
  });
});
