import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer as createNodeServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createLambdaHandler, type ApiGatewayV2Event } from '../src/lambda.js';

const handler = createLambdaHandler({ defaultEnvironment: 'hml', publicUrl: 'https://mcp.example' });

function event(method: string, opts: { headers?: Record<string, string>; body?: unknown } = {}): ApiGatewayV2Event {
  return {
    version: '2.0',
    rawPath: '/mcp',
    rawQueryString: '',
    headers: { 'content-type': 'application/json', ...opts.headers },
    requestContext: { http: { method, path: '/mcp', sourceIp: '127.0.0.1' } },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    isBase64Encoded: false,
  };
}

describe('createLambdaHandler — direct invocation', () => {
  it('GET returns RFC 9728 resource metadata', async () => {
    const r = await handler(event('GET'));
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body!);
    expect(body.resource).toBe('https://mcp.example/mcp');
    expect(body.authorization_servers).toContain('https://auth-hml.signdocs.com.br');
  });

  it('POST without auth returns 401 + WWW-Authenticate', async () => {
    const r = await handler(
      event('POST', {
        body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      }),
    );
    expect(r.statusCode).toBe(401);
    expect(r.headers?.['WWW-Authenticate']).toContain('resource_metadata=');
  });

  it('OPTIONS returns 204 with CORS', async () => {
    const r = await handler(event('OPTIONS'));
    expect(r.statusCode).toBe(204);
    expect(r.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('rejects a non-initialize first call gracefully (stateless tolerated by client)', async () => {
    const r = await handler(
      event('POST', {
        headers: { authorization: 'Bearer dummy' },
        body: { jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} },
      }),
    );
    // Server responds (200 JSON-RPC) — stateless mode handles each request independently.
    expect(r.statusCode).toBe(200);
  });
});

// Bridge the Lambda handler behind a real HTTP server so the actual MCP SDK
// client can drive the full initialize -> tools/list handshake through it.
describe('createLambdaHandler — via real MCP client over a bridge', () => {
  let server: Server;
  let url: URL;

  beforeAll(async () => {
    server = createNodeServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks).toString('utf8');
      const evt: ApiGatewayV2Event = {
        version: '2.0',
        rawPath: req.url ?? '/mcp',
        rawQueryString: '',
        headers: req.headers as Record<string, string>,
        requestContext: { http: { method: req.method, path: req.url, sourceIp: '127.0.0.1' } },
        body: raw || undefined,
        isBase64Encoded: false,
      };
      const result = await handler(evt);
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body ?? '');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    url = new URL(`http://127.0.0.1:${port}/mcp`);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('initializes and lists 23 tools', async () => {
    const client = new Client({ name: 'lambda-bridge-test', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: 'Bearer dummy-handshake-token' } },
    });
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.length).toBe(24);
    expect(tools.tools.map((t) => t.name)).toContain('create_signing_session');
    await client.close();
  });
});
