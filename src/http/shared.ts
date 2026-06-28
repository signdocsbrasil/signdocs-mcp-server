import {
  buildClient,
  resolveEnvironment,
  DEFAULT_SCOPES,
  type Environment,
  type ToolContext,
} from '../client.js';

/**
 * Transport-agnostic auth/discovery helpers shared by the long-running HTTP
 * server (http/server.ts) and the Lambda adapter (lambda.ts). Everything here
 * works off a plain header map so it serves both Node IncomingMessage headers
 * and API Gateway event headers.
 */

export type AuthResult =
  | { mode: 'bearer'; bearer: string }
  | { mode: 'credentials'; clientId: string; clientSecret: string };

export type HeaderMap = Record<string, string | string[] | undefined>;

export function headerValue(headers: HeaderMap, name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Resolve auth from request headers. Precedence:
 *   1. `Authorization: Bearer <token>` — SignDocs OAuth2 access token (passthrough).
 *   2. `Authorization: Basic <base64(clientId:clientSecret)>` — client credentials.
 *   3. `X-SignDocs-Client-Id` + `X-SignDocs-Client-Secret` — client credentials as
 *      two plain headers (no base64). Lets header-only clients (e.g. the Claude
 *      Code plugin, whose config can't transform values) pass raw credentials.
 */
export function extractAuthFromHeaders(headers: HeaderMap): AuthResult | null {
  const auth = headerValue(headers, 'authorization');
  if (auth) {
    const space = auth.indexOf(' ');
    if (space > 0) {
      const scheme = auth.slice(0, space).toLowerCase();
      const value = auth.slice(space + 1).trim();
      if (value && scheme === 'bearer') return { mode: 'bearer', bearer: value };
      if (value && scheme === 'basic') {
        const decoded = Buffer.from(value, 'base64').toString('utf8');
        const sep = decoded.indexOf(':');
        if (sep >= 0) {
          return { mode: 'credentials', clientId: decoded.slice(0, sep), clientSecret: decoded.slice(sep + 1) };
        }
      }
    }
  }

  const clientId = headerValue(headers, 'x-signdocs-client-id');
  const clientSecret = headerValue(headers, 'x-signdocs-client-secret');
  if (clientId && clientSecret) {
    return { mode: 'credentials', clientId, clientSecret };
  }

  return null;
}

/** Resolve the SignDocs environment from the X-SignDocs-Environment header, else fallback. */
export function environmentFromHeaders(headers: HeaderMap, fallback: Environment): Environment {
  const value = headerValue(headers, 'x-signdocs-environment');
  if (value && value.trim()) {
    try {
      return resolveEnvironment(value);
    } catch {
      /* ignore invalid header, use fallback */
    }
  }
  return fallback;
}

/** Build a request-scoped tool context (fresh SDK client) from parsed auth. */
export function buildContextForAuth(auth: AuthResult, environment: Environment): ToolContext {
  const client =
    auth.mode === 'bearer'
      ? buildClient({ mode: 'bearer', bearer: auth.bearer, environment })
      : buildClient({ mode: 'credentials', clientId: auth.clientId, clientSecret: auth.clientSecret, environment });
  return { client, environment };
}

/**
 * The SignDocs OAuth authorization server for the given environment. This is the
 * dedicated AS that implements authorization_code + PKCE + DCR (SigExtOAuth), so
 * Claude.ai web can run interactive OAuth. (Direct client_credentials/Basic/Bearer
 * still work too — they bypass this discovery path.)
 */
export function authorizationServerUrl(environment: Environment): string {
  return environment === 'production'
    ? 'https://auth.signdocs.com.br'
    : 'https://auth-hml.signdocs.com.br';
}

/** RFC 9728 protected-resource metadata pointing at the SignDocs authorization server. */
export function protectedResourceMetadata(resourceUrl: string, environment: Environment): Record<string, unknown> {
  return {
    resource: resourceUrl,
    authorization_servers: [authorizationServerUrl(environment)],
    scopes_supported: DEFAULT_SCOPES,
    bearer_methods_supported: ['header'],
  };
}

/** WWW-Authenticate challenge value pointing a client at the resource metadata. */
export function wwwAuthenticate(metadataUrl: string): string {
  return `Bearer resource_metadata="${metadataUrl}"`;
}

export const UNAUTHORIZED_BODY = {
  error: 'unauthorized',
  error_description:
    'Provide a SignDocs OAuth2 access token (Authorization: Bearer <token>) or client ' +
    'credentials (Authorization: Basic base64(clientId:clientSecret)).',
};
