import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpServer } from '../src/http/server.js';

let server: Server;
let base: string;

beforeAll(async () => {
  server = createHttpServer({ defaultEnvironment: 'hml' });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('health + discovery', () => {
  it('GET /healthz returns ok', async () => {
    const r = await fetch(`${base}/healthz`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.status).toBe('ok');
    expect(body.transport).toBe('streamable-http');
  });

  it('serves RFC 9728 protected-resource metadata', async () => {
    const r = await fetch(`${base}/.well-known/oauth-protected-resource`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.resource).toBe(`${base}/mcp`);
    expect(body.authorization_servers).toContain('https://auth-hml.signdocs.com.br');
    expect(body.scopes_supported).toContain('transactions:write');
  });
});

describe('auth challenge', () => {
  it('rejects an unauthenticated initialize with 401 + WWW-Authenticate', async () => {
    const r = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
      }),
    });
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toContain('resource_metadata=');
  });

  it('rejects an unknown method with a 404 for non-/mcp paths', async () => {
    const r = await fetch(`${base}/nope`);
    expect(r.status).toBe(404);
  });
});

describe('authenticated MCP session', () => {
  it('initializes, lists tools and reads a resource (no API calls hit the network)', async () => {
    const client = new Client({ name: 'http-test', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: 'Bearer dummy-token-for-handshake' } },
    });
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.length).toBe(24);
    expect(tools.tools.map((t) => t.name)).toContain('create_signing_session');

    const res = await client.listResources();
    expect(res.resources.map((r) => r.uri)).toContain('signdocs://policy-profiles');

    const doc = await client.readResource({ uri: 'signdocs://quickstart' });
    expect((doc.contents[0].text as string).length).toBeGreaterThan(0);

    await client.close();
  });
});
