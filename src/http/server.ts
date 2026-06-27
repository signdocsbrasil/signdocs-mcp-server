/**
 * Phase 2 — remote Streamable-HTTP transport (designed, not yet built).
 *
 * The tool/resource layer in ../server.ts is deliberately transport-agnostic,
 * so going remote is purely an entrypoint + auth concern:
 *
 *   import { StreamableHTTPServerTransport } from
 *     '@modelcontextprotocol/sdk/server/streamableHttp.js';
 *   const server = createServer();
 *   const transport = new StreamableHTTPServerTransport({ ...});
 *   await server.connect(transport);
 *   // node:http handler → transport.handleRequest(req, res, body)
 *
 * Open design decisions to settle before implementing (see plan):
 *
 *  1. AUTH / MULTI-TENANCY. Unlike stdio (one set of env credentials), a
 *     hosted server serves many tenants. The MCP server should act as an
 *     OAuth Resource Server: each connecting AI presents its own SignDocs
 *     bearer token (issued by the existing /oauth2/token AS). Validate it with
 *     the same ES256/KMS verifier external-api uses (auth-middleware.ts) and
 *     build a PER-REQUEST SDK client scoped to that tenant — do NOT reuse the
 *     process-wide getClient() singleton, which would cross tenant boundaries.
 *
 *  2. DEPLOYMENT. Reuse the external-api Lambda + API Gateway pattern via a new
 *     NestedStack (the Core stack is at the CFN 500-resource limit — follow the
 *     EnvelopeHandlersStack precedent), or a small container behind the same WAF.
 *
 *  3. SESSION MODE. Stateless (sessionIdGenerator: undefined) fits serverless;
 *     confirm against the MCP spec version current at build time, plus DCR /
 *     protected-resource metadata discovery needs.
 *
 * Intentionally not wired up yet so the v0.1 stdio package stays dependency-light.
 */
export function createHttpServer(): never {
  throw new Error(
    'Remote HTTP transport is not implemented in v0.1. Use the stdio entrypoint (bin/stdio.ts). ' +
      'See src/http/server.ts for the Phase 2 design.',
  );
}
