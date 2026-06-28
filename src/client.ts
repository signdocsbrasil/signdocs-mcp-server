import { SignDocsBrasilClient } from '@signdocs-brasil/api';
import type { TokenCache, CachedToken } from '@signdocs-brasil/api';

/**
 * Thin wrapper that turns environment variables into a configured
 * {@link SignDocsBrasilClient}. The official SDK owns the OAuth2
 * `client_credentials` exchange, token caching, retries and RFC-7807
 * error parsing — this module only resolves config and memoizes the client.
 */

export type Environment = 'production' | 'hml';

const BASE_URLS: Record<Environment, string> = {
  production: 'https://api.signdocs.com.br',
  // NOTE: HML uses the dash form (api-hml), NOT api.hml.
  hml: 'https://api-hml.signdocs.com.br',
};

/**
 * Full read/write scope set. `verification:write` is only authorized for
 * PRODUCTION credentials, but the token endpoint silently filters out any
 * scope the credential isn't entitled to, so requesting it everywhere is safe.
 */
export const DEFAULT_SCOPES = [
  'transactions:read',
  'transactions:write',
  'steps:write',
  'evidence:read',
  'webhooks:write',
  'verification:write',
];

export interface ResolvedEnv {
  clientId: string;
  clientSecret: string;
  environment: Environment;
  baseUrl: string;
  scopes: string[];
}

export function resolveEnvironment(raw?: string): Environment {
  const v = (raw ?? 'hml').trim().toLowerCase();
  if (v === 'production' || v === 'prod') return 'production';
  if (v === 'hml' || v === 'homologacao' || v === 'homologação' || v === 'staging') return 'hml';
  throw new Error(`Invalid SIGNDOCS_ENVIRONMENT "${raw}". Use "production" or "hml".`);
}

export function getBaseUrl(environment: Environment, override?: string): string {
  const trimmed = override?.trim();
  return trimmed ? trimmed : BASE_URLS[environment];
}

export function readEnv(env: NodeJS.ProcessEnv = process.env): ResolvedEnv {
  const clientId = env.SIGNDOCS_CLIENT_ID?.trim();
  const clientSecret = env.SIGNDOCS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing SignDocs credentials. Set SIGNDOCS_CLIENT_ID and SIGNDOCS_CLIENT_SECRET ' +
        '(get them from app.signdocs.com.br → API).',
    );
  }
  const environment = resolveEnvironment(env.SIGNDOCS_ENVIRONMENT);
  const baseUrl = getBaseUrl(environment, env.SIGNDOCS_BASE_URL);
  const scopesRaw = env.SIGNDOCS_SCOPES?.trim();
  const scopes = scopesRaw ? scopesRaw.split(/\s+/) : DEFAULT_SCOPES;
  return { clientId, clientSecret, environment, baseUrl, scopes };
}

let cached: SignDocsBrasilClient | undefined;
let cachedEnv: ResolvedEnv | undefined;

/** Lazily build and memoize the SDK client. Throws if credentials are missing. */
export function getClient(env: NodeJS.ProcessEnv = process.env): SignDocsBrasilClient {
  if (cached) return cached;
  const cfg = readEnv(env);
  cachedEnv = cfg;
  cached = new SignDocsBrasilClient({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    baseUrl: cfg.baseUrl,
    scopes: cfg.scopes,
  });
  return cached;
}

/** The resolved environment behind the active client (for diagnostics/guards). */
export function getResolvedEnv(env: NodeJS.ProcessEnv = process.env): ResolvedEnv {
  if (cachedEnv) return cachedEnv;
  cachedEnv = readEnv(env);
  return cachedEnv;
}

/** Reset memoized state — used by tests. */
export function resetClientCache(): void {
  cached = undefined;
  cachedEnv = undefined;
}

/**
 * Assemble the shareable signing link. A session's `url` alone is NOT the
 * link — it must carry the one-time embed token (`clientSecret`) as `?cs=`.
 */
export function buildSigningUrl(url: string, clientSecret: string): string {
  return `${url}?cs=${encodeURIComponent(clientSecret)}`;
}

// ── Per-request client construction (used by the remote HTTP transport) ───────

/**
 * What every tool handler needs to talk to SignDocs. In the stdio server this
 * is built once from env; in the remote HTTP server it is built per-request so
 * each tenant is fully isolated (no shared client/token across requests).
 */
export interface ToolContext {
  client: SignDocsBrasilClient;
  environment: Environment;
  /**
   * Optional hook to turn a long presigned download URL into a short, stable link
   * the model can reproduce verbatim (LLMs garble ~2KB signed-URL tokens when
   * re-emitting them as links). Injected by the hosting layer (e.g. the Lambda
   * adapter, backed by a store + a /d/{id} redirect). Undefined ⇒ URLs unchanged.
   */
  shortenUrl?: (url: string) => Promise<string>;
  /**
   * Optional hook backing the `request_document_upload` tool: returns a one-time
   * drag-and-drop upload page URL the user opens to upload a PDF (browser→S3),
   * plus the token to reference it. Lets users sign a local/Drive file without
   * passing bytes through the model. Undefined ⇒ the upload tool is unavailable.
   */
  createUpload?: (opts: { filename?: string }) => Promise<{ uploadToken: string; uploadPageUrl: string }>;
  /**
   * Optional hook to resolve an `uploadToken` (from createUpload) to the staged
   * PDF as base64. Used by create_signing_session/create_envelope/upload_document.
   */
  resolveUpload?: (token: string) => Promise<{ content: string; filename?: string }>;
}

/** Hooks the hosting layer can inject into a tool context. */
export interface ContextHooks {
  shortenUrl?: ToolContext['shortenUrl'];
  createUpload?: ToolContext['createUpload'];
  resolveUpload?: ToolContext['resolveUpload'];
}

/**
 * A {@link TokenCache} pre-seeded with a caller-supplied access token. The SDK's
 * AuthHandler checks the cache before exchanging credentials, so seeding it makes
 * the SDK use the presented bearer directly and never call `/oauth2/token`.
 * The SignDocs API remains the real validator — an invalid/expired token yields
 * a 401 from the API, surfaced to the caller.
 */
export class StaticTokenCache implements TokenCache {
  private readonly token: CachedToken;
  constructor(accessToken: string, ttlMs = 60 * 60 * 1000) {
    this.token = { accessToken, expiresAt: Date.now() + ttlMs };
  }
  get(): CachedToken | null {
    return this.token;
  }
  set(): void {
    /* no-op: the token is fixed for this request */
  }
  delete(): void {
    /* no-op */
  }
}

export type BuildClientOptions =
  | {
      mode: 'credentials';
      clientId: string;
      clientSecret: string;
      environment: Environment;
      baseUrlOverride?: string;
      scopes?: string[];
    }
  | {
      mode: 'bearer';
      bearer: string;
      environment: Environment;
      baseUrlOverride?: string;
      scopes?: string[];
    };

/**
 * Build a fresh, request-scoped SDK client. `credentials` mode lets the SDK run
 * the OAuth2 client_credentials exchange; `bearer` mode passes a pre-issued
 * access token straight through via {@link StaticTokenCache}.
 */
export function buildClient(opts: BuildClientOptions): SignDocsBrasilClient {
  const baseUrl = getBaseUrl(opts.environment, opts.baseUrlOverride);
  const scopes = opts.scopes ?? DEFAULT_SCOPES;
  if (opts.mode === 'bearer') {
    return new SignDocsBrasilClient({
      clientId: 'mcp-bearer-passthrough',
      clientSecret: 'unused', // never used: the token cache short-circuits exchange
      baseUrl,
      scopes,
      tokenCache: new StaticTokenCache(opts.bearer),
    });
  }
  return new SignDocsBrasilClient({
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    baseUrl,
    scopes,
  });
}

/**
 * A client proxy that defers construction until first use, so the stdio server
 * can start and list tools/resources even with no credentials — a missing-cred
 * error surfaces only when a tool actually calls the API.
 */
function lazyClient(factory: () => SignDocsBrasilClient): SignDocsBrasilClient {
  let instance: SignDocsBrasilClient | undefined;
  return new Proxy({} as SignDocsBrasilClient, {
    get(_target, prop, receiver) {
      instance ??= factory();
      return Reflect.get(instance as object, prop, receiver);
    },
  });
}

/**
 * Build the tool context for the stdio server from environment variables.
 * Credentials are resolved lazily (on first API call); the environment is read
 * eagerly but does not require credentials.
 */
export function getStdioContext(env: NodeJS.ProcessEnv = process.env): ToolContext {
  return {
    client: lazyClient(() => getClient(env)),
    environment: resolveEnvironment(env.SIGNDOCS_ENVIRONMENT),
  };
}
