import { randomUUID } from 'node:crypto';
import { fetchDocumentAsBase64 } from '../fetch-document.js';

/**
 * Resolve a document from either inline base64 or a server-fetched URL.
 * Returns the SignDocs `{ content, filename }` shape, or undefined if neither
 * was provided (signing sessions allow no document for ACTION_AUTHENTICATION).
 */
export async function resolveDocument(
  args: {
    documentBase64?: string;
    documentUrl?: string;
    uploadToken?: string;
    documentFilename?: string;
    filename?: string;
  },
  ctx?: { resolveUpload?: (token: string) => Promise<{ content: string; filename?: string }> },
): Promise<{ content: string; filename?: string } | undefined> {
  const fname = args.documentFilename ?? args.filename;
  if (args.documentBase64) {
    return { content: args.documentBase64, ...(fname ? { filename: fname } : {}) };
  }
  if (args.uploadToken) {
    if (!ctx?.resolveUpload) {
      throw new Error('uploadToken is not supported on this server.');
    }
    const u = await ctx.resolveUpload(args.uploadToken);
    const filename = fname ?? u.filename;
    return { content: u.content, ...(filename ? { filename } : {}) };
  }
  if (args.documentUrl) {
    const fetched = await fetchDocumentAsBase64(args.documentUrl);
    const filename = fname ?? fetched.filename;
    return { content: fetched.content, ...(filename ? { filename } : {}) };
  }
  return undefined;
}

/** MCP tool result shape (subset we use). Index signature matches the SDK's CallToolResult. */
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

export function jsonContent(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Normalize any thrown value (SDK errors are RFC-7807 ProblemDetail-bearing)
 * into a clean, non-throwing MCP error result so the agent can read and react.
 */
export function errorContent(err: unknown): ToolResult {
  const e = err as { message?: string; status?: number; problem?: unknown; detail?: unknown };
  const parts: string[] = [];
  parts.push(`SignDocs API error: ${e?.message ?? String(err)}`);
  if (typeof e?.status === 'number') parts.push(`(HTTP ${e.status})`);
  const problem = e?.problem ?? e?.detail;
  if (problem) parts.push(`\n${JSON.stringify(problem, null, 2)}`);
  return { content: [{ type: 'text', text: parts.join(' ') }], isError: true };
}

/** Run an SDK call and wrap success/failure into a tool result. */
export async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return jsonContent(await fn());
  } catch (err) {
    return errorContent(err);
  }
}

/** A presigned (S3/etc.) URL — the kind LLMs corrupt when re-emitting as links. */
function isPresignedUrl(s: string): boolean {
  return /^https:\/\/\S+[?&]X-Amz-Signature=/.test(s);
}

/** Recursively replace presigned URLs in a value via the shortener. */
async function shortenDeep(value: unknown, shorten: (url: string) => Promise<string>): Promise<unknown> {
  if (typeof value === 'string') return isPresignedUrl(value) ? shorten(value) : value;
  if (Array.isArray(value)) return Promise.all(value.map((v) => shortenDeep(v, shorten)));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    await Promise.all(
      Object.entries(value as Record<string, unknown>).map(async ([k, v]) => {
        out[k] = await shortenDeep(v, shorten);
      }),
    );
    return out;
  }
  return value;
}

/**
 * Like {@link run}, but if the context has a `shortenUrl` hook, swap any presigned
 * download URLs in the result for short redirect links the model can reproduce.
 * Use for tools that return artifact URLs (download/evidence/verify/combined-stamp).
 */
export async function runWithLinks(
  ctx: { shortenUrl?: (url: string) => Promise<string> },
  fn: () => Promise<unknown>,
): Promise<ToolResult> {
  try {
    const data = await fn();
    return jsonContent(ctx.shortenUrl ? await shortenDeep(data, ctx.shortenUrl) : data);
  } catch (err) {
    return errorContent(err);
  }
}

/** Use the caller-supplied idempotency key, or mint a fresh UUID. */
export function idempotencyKey(provided?: string): string {
  return provided ?? randomUUID();
}
