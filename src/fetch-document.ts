import { lookup } from 'node:dns/promises';

/**
 * Fetch a PDF from a user-supplied URL and return it as base64, for the
 * `documentUrl` tool inputs. claude.ai never hands attached file bytes to MCP
 * tools, so a server-side fetch of a shareable link is the reliable path.
 *
 * Hardened against SSRF: https-only, every redirect hop re-validated, the
 * resolved IP(s) must be public (blocks loopback/private/link-local incl. the
 * 169.254.169.254 metadata endpoint), a hard size cap, and a %PDF- magic check.
 */

const MAX_BYTES = 10 * 1024 * 1024; // SignDocs inline document limit
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;

function ipv4Private(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = o;
  if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('::ffff:')) {
    const tail = v.slice(7);
    if (tail.includes('.')) return ipv4Private(tail);
  }
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(v)) return true; // link-local fe80::/10
  return ipv4Private(v);
}

async function assertPublicHost(host: string): Promise<void> {
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`Cannot resolve host: ${host}`);
  }
  if (!addrs.length) throw new Error(`Cannot resolve host: ${host}`);
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new Error(`Refusing to fetch a private/internal address (${a.address}) for ${host}`);
    }
  }
}

function filenameFrom(res: Response, finalUrl: string): string | undefined {
  const cd = res.headers.get('content-disposition');
  const m = cd && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  if (m) return decodeURIComponent(m[1]);
  try {
    const p = new URL(finalUrl).pathname.split('/').pop();
    if (p && p.toLowerCase().endsWith('.pdf')) return p;
  } catch {
    /* ignore */
  }
  return undefined;
}

export interface FetchedDocument {
  content: string; // base64
  filename?: string;
}

export async function fetchDocumentAsBase64(
  rawUrl: string,
  opts?: { timeoutMs?: number },
): Promise<FetchedDocument> {
  let url = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new Error(`Invalid documentUrl: ${url}`);
    }
    if (u.protocol !== 'https:') throw new Error('documentUrl must be an https URL');
    await assertPublicHost(u.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/pdf,*/*' } });
    } catch (err) {
      throw new Error(`Failed to fetch documentUrl: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('documentUrl redirected without a Location header');
      url = new URL(loc, url).toString();
      continue; // re-validate the next hop
    }
    if (!res.ok) throw new Error(`documentUrl fetch failed (HTTP ${res.status})`);

    const declared = res.headers.get('content-length');
    if (declared && Number(declared) > MAX_BYTES) {
      throw new Error(`Document exceeds the ${MAX_BYTES / (1024 * 1024)}MB limit`);
    }

    // Stream with a hard cap so a lying content-length can't OOM the Lambda.
    const reader = res.body?.getReader();
    if (!reader) throw new Error('documentUrl returned an empty body');
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new Error(`Document exceeds the ${MAX_BYTES / (1024 * 1024)}MB limit`);
      }
      chunks.push(Buffer.from(value));
    }
    const buf = Buffer.concat(chunks);
    if (buf.length < 5 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new Error('documentUrl did not return a PDF (missing %PDF- header)');
    }
    return { content: buf.toString('base64'), filename: filenameFrom(res, url) };
  }
  throw new Error('documentUrl exceeded the maximum number of redirects');
}
