import { SignDocsBrasilClient } from '@signdocs-brasil/api';

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
