#!/usr/bin/env node
import { createHttpServer } from '../http/server.js';
import { resolveEnvironment, type Environment } from '../client.js';

/**
 * Remote HTTP entrypoint. Unlike the stdio server, credentials are NOT read
 * from env — each request carries its own (Bearer token or Basic client
 * credentials), so one deployment serves many tenants.
 */
function envDefault(): Environment {
  try {
    return resolveEnvironment(process.env.SIGNDOCS_ENVIRONMENT);
  } catch {
    return 'hml';
  }
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = createHttpServer({
  defaultEnvironment: envDefault(),
  corsOrigin: process.env.MCP_CORS_ORIGIN,
  publicUrl: process.env.MCP_PUBLIC_URL,
  enableDnsRebindingProtection: process.env.MCP_DNS_REBINDING_PROTECTION === 'true',
  allowedHosts: process.env.MCP_ALLOWED_HOSTS?.split(',').map((h) => h.trim()).filter(Boolean),
  allowedOrigins: process.env.MCP_ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean),
});

server.listen(port, host, () => {
  process.stderr.write(`[signdocs-mcp-http] listening on http://${host}:${port}/mcp (default env: ${envDefault()})\n`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
