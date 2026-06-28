/**
 * Public API of @signdocs-brasil/mcp-server.
 *
 * - `createServer(ctx)` — transport-agnostic MCP server (tools + resources).
 * - `buildClient` / `getStdioContext` — request-scoped SignDocs SDK clients.
 * - `createHttpServer` — long-running remote Streamable-HTTP server (also at "./http").
 * - `createLambdaHandler` — API Gateway v2 adapter (also at "./lambda").
 */
export { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';
export {
  buildClient,
  getClient,
  getStdioContext,
  getBaseUrl,
  resolveEnvironment,
  buildSigningUrl,
  StaticTokenCache,
  DEFAULT_SCOPES,
  type Environment,
  type ToolContext,
  type BuildClientOptions,
  type ResolvedEnv,
} from './client.js';
export { createHttpServer, type HttpServerOptions } from './http/server.js';
export {
  createLambdaHandler,
  type LambdaHandler,
  type LambdaHandlerOptions,
  type ApiGatewayV2Event,
  type ApiGatewayV2Result,
} from './lambda.js';
