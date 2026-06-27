import { randomUUID } from 'node:crypto';

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
