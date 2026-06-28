import { randomUUID } from 'node:crypto';
import { fetchDocumentAsBase64 } from '../fetch-document.js';

/**
 * Resolve a document from either inline base64 or a server-fetched URL.
 * Returns the SignDocs `{ content, filename }` shape, or undefined if neither
 * was provided (signing sessions allow no document for ACTION_AUTHENTICATION).
 */
export async function resolveDocument(args: {
  documentBase64?: string;
  documentUrl?: string;
  documentFilename?: string;
  filename?: string;
}): Promise<{ content: string; filename?: string } | undefined> {
  const fname = args.documentFilename ?? args.filename;
  if (args.documentBase64) {
    return { content: args.documentBase64, ...(fname ? { filename: fname } : {}) };
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

/** Use the caller-supplied idempotency key, or mint a fresh UUID. */
export function idempotencyKey(provided?: string): string {
  return provided ?? randomUUID();
}
