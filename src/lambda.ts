import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer as createMcpServer } from './server.js';
import type { Environment } from './client.js';
import {
  extractAuthFromHeaders,
  environmentFromHeaders,
  buildContextForAuth,
  protectedResourceMetadata,
  wwwAuthenticate,
  UNAUTHORIZED_BODY,
} from './http/shared.js';

/**
 * AWS Lambda (API Gateway HTTP API v2) adapter for the MCP server.
 *
 * Runs the transport in STATELESS mode — a fresh server + transport per
 * invocation — which works with standard MCP clients and needs no shared
 * session store (a perfect fit for Lambda's per-request isolation). Auth is
 * per request: Bearer access-token passthrough or Basic client_credentials.
 *
 * Built on the SDK's Web-Standard transport (Request → Response), so no
 * Node req/res shim is needed; Node 18+ provides global Request/Response.
 *
 * Minimal local event/result types avoid an `aws-lambda` dependency; the
 * returned handler is structurally compatible with `APIGatewayProxyHandlerV2`.
 */

export interface ApiGatewayV2Event {
  version?: string;
  routeKey?: string;
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  requestContext?: { http?: { method?: string; path?: string; sourceIp?: string } };
  body?: string;
  isBase64Encoded?: boolean;
}

export interface ApiGatewayV2Result {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

export type LambdaHandler = (event: ApiGatewayV2Event) => Promise<ApiGatewayV2Result>;

export interface LambdaHandlerOptions {
  /** Environment when a request doesn't send X-SignDocs-Environment. Default 'hml'. */
  defaultEnvironment?: Environment;
  /** Public base origin (e.g. https://mcp-hml.signdocs.com.br) for resource metadata. Derived from headers if unset. */
  publicUrl?: string;
  /** CORS Access-Control-Allow-Origin. Default '*'. */
  corsOrigin?: string;
  /**
   * Optional shortener for presigned download URLs (see ToolContext.shortenUrl).
   * The host supplies a store-backed implementation; without it, URLs pass through.
   */
  shortenUrl?: (url: string) => Promise<string>;
  /** Optional upload hooks (see ToolContext.createUpload / resolveUpload). */
  createUpload?: (opts: { filename?: string }) => Promise<{ uploadToken: string; uploadPageUrl: string }>;
  resolveUpload?: (token: string) => Promise<{ content: string; filename?: string }>;
}

const CORS_ALLOW_HEADERS =
  'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, X-SignDocs-Environment, X-SignDocs-Client-Id, X-SignDocs-Client-Secret';

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate',
  };
}

function lowercaseHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) out[k.toLowerCase()] = v;
  }
  return out;
}

function baseOrigin(headers: Record<string, string>, opts: LambdaHandlerOptions): string {
  if (opts.publicUrl) return opts.publicUrl.replace(/\/$/, '');
  const proto = headers['x-forwarded-proto']?.split(',')[0] ?? 'https';
  const host = headers['x-forwarded-host'] ?? headers['host'] ?? 'localhost';
  return `${proto}://${host}`;
}

function json(statusCode: number, body: unknown, headers: Record<string, string> = {}): ApiGatewayV2Result {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) };
}

/**
 * Build an API Gateway v2 Lambda handler that serves the MCP endpoint.
 * Routes: `POST /mcp` (MCP), `GET /mcp` (resource metadata), `OPTIONS` (CORS).
 */
export function createLambdaHandler(options: LambdaHandlerOptions = {}): LambdaHandler {
  const defaultEnvironment: Environment = options.defaultEnvironment ?? 'hml';
  const corsOrigin = options.corsOrigin ?? '*';

  return async (event: ApiGatewayV2Event): Promise<ApiGatewayV2Result> => {
    const headers = lowercaseHeaders(event.headers ?? {});
    const method = (event.requestContext?.http?.method ?? 'POST').toUpperCase();
    const base = baseOrigin(headers, options);
    const resourceUrl = `${base}/mcp`;
    // RFC 9728: protected-resource metadata for resource /mcp lives at this path.
    const metadataUrl = `${base}/.well-known/oauth-protected-resource/mcp`;
    const cors = corsHeaders(corsOrigin);

    if (method === 'OPTIONS') return { statusCode: 204, headers: cors };
    if (method === 'GET') return json(200, protectedResourceMetadata(resourceUrl, defaultEnvironment), cors);
    if (method !== 'POST') return json(405, { error: 'method_not_allowed' }, { ...cors, Allow: 'GET, POST, OPTIONS' });

    const auth = extractAuthFromHeaders(headers);
    if (!auth) {
      return json(401, UNAUTHORIZED_BODY, { ...cors, 'WWW-Authenticate': wwwAuthenticate(metadataUrl) });
    }

    const rawBody = event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : undefined;
    let parsedBody: unknown;
    try {
      parsedBody = rawBody && rawBody.length ? JSON.parse(rawBody.toString('utf8')) : undefined;
    } catch {
      return json(400, { error: 'invalid_json', error_description: 'Request body is not valid JSON.' }, cors);
    }

    const environment = environmentFromHeaders(headers, defaultEnvironment);
    const ctx = buildContextForAuth(auth, environment, {
      shortenUrl: options.shortenUrl,
      createUpload: options.createUpload,
      resolveUpload: options.resolveUpload,
    });
    const server = createMcpServer(ctx);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Build a Web-Standard Request. Ensure Accept satisfies the transport
    // (it requires application/json and/or text/event-stream).
    const requestHeaders = new Headers();
    for (const [k, v] of Object.entries(headers)) requestHeaders.set(k, v);
    if (!requestHeaders.has('accept')) requestHeaders.set('accept', 'application/json, text/event-stream');

    const request = new Request(resourceUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: rawBody ? rawBody.toString('utf8') : undefined,
    });

    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request, { parsedBody });
      const outHeaders: Record<string, string> = { ...cors };
      response.headers.forEach((value, key) => {
        outHeaders[key] = value;
      });
      const body = await response.text();
      return { statusCode: response.status, headers: outHeaders, body };
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  };
}
