import {
  createServer as createNodeHttpServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer as createMcpServer } from '../server.js';
import { type Environment } from '../client.js';
import {
  extractAuthFromHeaders,
  environmentFromHeaders,
  buildContextForAuth,
  protectedResourceMetadata as buildProtectedResourceMetadata,
  wwwAuthenticate,
  headerValue,
  UNAUTHORIZED_BODY,
  type AuthResult,
} from './shared.js';

/**
 * Phase 2 — remote Streamable-HTTP transport (stateful sessions).
 *
 * One deployment serves many tenants. A session is established on the MCP
 * `initialize` request, which MUST carry credentials:
 *   - `Authorization: Bearer <token>`  → a SignDocs OAuth2 access token, passed through.
 *   - `Authorization: Basic <base64(clientId:clientSecret)>` → server runs client_credentials.
 * Environment via `X-SignDocs-Environment: hml|production` (default = server default).
 *
 * The tenant's SDK client is bound to that session; follow-up requests are routed
 * by the `Mcp-Session-Id` header. Acts as an OAuth Resource Server: advertises the
 * SignDocs authorization server (RFC 9728) and challenges unauthenticated initialize
 * requests with WWW-Authenticate. The SignDocs API is the real token validator.
 *
 * Sessions live in process memory, so a single instance (or sticky routing) is
 * assumed. For multi-instance/serverless, front with sticky sessions or swap this
 * map for a shared store + an EventStore for resumability.
 */

export interface HttpServerOptions {
  /** Environment when a request doesn't specify one. Default 'hml'. */
  defaultEnvironment?: Environment;
  /** CORS Access-Control-Allow-Origin. Default '*'. */
  corsOrigin?: string;
  /** Public base URL for resource metadata (e.g. https://mcp.signdocs.com.br). Derived from the request if unset. */
  publicUrl?: string;
  /** DNS-rebinding protection — enable in production and pair with allowedHosts/Origins. Default false. */
  enableDnsRebindingProtection?: boolean;
  allowedHosts?: string[];
  allowedOrigins?: string[];
}

interface ResolvedOptions extends HttpServerOptions {
  defaultEnvironment: Environment;
  corsOrigin: string;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

function applyCors(res: ServerResponse, opts: ResolvedOptions): void {
  res.setHeader('Access-Control-Allow-Origin', opts.corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, X-SignDocs-Environment',
  );
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
}

function sendJson(res: ServerResponse, status: number, body: unknown, extra?: Record<string, string>): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extra });
  res.end(JSON.stringify(body));
}

function publicBase(req: IncomingMessage, opts: ResolvedOptions): string {
  if (opts.publicUrl) return opts.publicUrl.replace(/\/$/, '');
  const fwd = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0] ?? 'http';
  const host = req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
}

function challenge(req: IncomingMessage, res: ServerResponse, opts: ResolvedOptions): void {
  res.setHeader('WWW-Authenticate', wwwAuthenticate(`${publicBase(req, opts)}/.well-known/oauth-protected-resource`));
  sendJson(res, 401, UNAUTHORIZED_BODY);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function startSession(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ResolvedOptions,
  sessions: Map<string, Session>,
  body: unknown,
): Promise<void> {
  const auth: AuthResult | null = extractAuthFromHeaders(req.headers);
  if (!auth) {
    challenge(req, res, opts);
    return;
  }
  const environment = environmentFromHeaders(req.headers, opts.defaultEnvironment);
  const ctx = buildContextForAuth(auth, environment);
  const server = createMcpServer(ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    enableDnsRebindingProtection: opts.enableDnsRebindingProtection ?? false,
    ...(opts.allowedHosts ? { allowedHosts: opts.allowedHosts } : {}),
    ...(opts.allowedOrigins ? { allowedOrigins: opts.allowedOrigins } : {}),
    onsessioninitialized: (sid) => {
      sessions.set(sid, { transport, server });
    },
    onsessionclosed: (sid) => {
      sessions.delete(sid);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };

  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

async function handlePost(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ResolvedOptions,
  sessions: Map<string, Session>,
): Promise<void> {
  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    sendJson(res, 400, { error: 'invalid_json', error_description: 'Request body is not valid JSON.' });
    return;
  }

  const sessionId = headerValue(req.headers, 'mcp-session-id');
  const existing = sessionId ? sessions.get(sessionId) : undefined;
  if (existing) {
    await existing.transport.handleRequest(req, res, body);
    return;
  }

  if (isInitializeRequest(body)) {
    await startSession(req, res, opts, sessions, body);
    return;
  }

  sendJson(res, 400, {
    error: 'invalid_session',
    error_description: 'Missing or unknown Mcp-Session-Id. Send an initialize request first.',
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ResolvedOptions,
  sessions: Map<string, Session>,
): Promise<void> {
  applyCors(res, opts);
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (method === 'GET' && path === '/healthz') {
    sendJson(res, 200, { status: 'ok', transport: 'streamable-http', sessions: sessions.size });
    return;
  }
  if (method === 'GET' && path === '/.well-known/oauth-protected-resource') {
    sendJson(res, 200, buildProtectedResourceMetadata(`${publicBase(req, opts)}/mcp`, opts.defaultEnvironment));
    return;
  }

  if (path !== '/mcp') {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  if (method === 'POST') {
    await handlePost(req, res, opts, sessions);
    return;
  }

  // GET (SSE stream) and DELETE (session teardown) require an established session.
  if (method === 'GET' || method === 'DELETE') {
    const sessionId = headerValue(req.headers, 'mcp-session-id');
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session) {
      sendJson(res, 400, { error: 'invalid_session', error_description: 'Unknown or missing Mcp-Session-Id.' });
      return;
    }
    await session.transport.handleRequest(req, res);
    return;
  }

  sendJson(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, DELETE, OPTIONS' });
}

/** Build (but do not start) the remote HTTP MCP server. Call `.listen(port)`. */
export function createHttpServer(options: HttpServerOptions = {}): Server {
  const opts: ResolvedOptions = {
    ...options,
    defaultEnvironment: options.defaultEnvironment ?? 'hml',
    corsOrigin: options.corsOrigin ?? '*',
  };
  const sessions = new Map<string, Session>();
  return createNodeHttpServer((req, res) => {
    handle(req, res, opts, sessions).catch((err) => {
      try {
        if (!res.headersSent) {
          sendJson(res, 500, { error: 'internal_error', message: err instanceof Error ? err.message : String(err) });
        } else {
          res.end();
        }
      } catch {
        /* response already torn down */
      }
    });
  });
}
