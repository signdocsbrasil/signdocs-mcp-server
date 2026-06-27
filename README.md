# SignDocs Brasil — MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for the
**SignDocs Brasil** e-signature API. It lets MCP-capable AI clients (Claude
Desktop, Claude Code, Cursor, …) create signing sessions, manage multi-signer
envelopes, upload/download documents, verify signatures, and manage webhooks —
the same action catalog as the official n8n, Zapier, and Make.com integrations.

It is a thin adapter over the official [`@signdocs-brasil/api`](https://www.npmjs.com/package/@signdocs-brasil/api)
SDK, which owns OAuth2 token exchange, caching, retries, and error handling.

## Install

```bash
npm install -g @signdocs-brasil/mcp-server   # or run on demand with npx
```

## Credentials

Create an API credential in the SignDocs dashboard (app.signdocs.com.br → API)
and expose it as environment variables:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `SIGNDOCS_CLIENT_ID` | yes | — | OAuth2 client id |
| `SIGNDOCS_CLIENT_SECRET` | yes | — | OAuth2 client secret |
| `SIGNDOCS_ENVIRONMENT` | no | `hml` | `hml` (staging) or `production` |
| `SIGNDOCS_BASE_URL` | no | derived | override the resolved base URL |
| `SIGNDOCS_SCOPES` | no | full set | space-separated scope override |

> Start in `hml`. HML data expires after ~7 days and is safe for testing.
> Switch to `production` only when you intend to create real, legally-binding
> signatures.

## Connect an AI client

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "signdocs": {
      "command": "npx",
      "args": ["-y", "@signdocs-brasil/mcp-server"],
      "env": {
        "SIGNDOCS_CLIENT_ID": "your_client_id",
        "SIGNDOCS_CLIENT_SECRET": "your_client_secret",
        "SIGNDOCS_ENVIRONMENT": "hml"
      }
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add signdocs \
  -e SIGNDOCS_CLIENT_ID=your_client_id \
  -e SIGNDOCS_CLIENT_SECRET=your_client_secret \
  -e SIGNDOCS_ENVIRONMENT=hml \
  -- npx -y @signdocs-brasil/mcp-server
```

## Tools

| Tool | Action | Safety |
|---|---|---|
| `create_signing_session` | Create single-signer session, returns `signingUrl` | ⚠️ binding + quota |
| `get_signing_session_status` | Poll session status | read |
| `get_signing_session` | Full session bootstrap | read |
| `list_signing_sessions` | List by status | read |
| `cancel_signing_session` | Cancel a session | ⚠️ irreversible |
| `resend_signing_session_otp` | Resend OTP | write |
| `create_envelope` | Multi-signer envelope | ⚠️ binding + quota |
| `get_envelope` | Envelope details | read |
| `add_session_to_envelope` | Add a signer, returns `signingUrl` | ⚠️ binding + quota |
| `get_envelope_combined_stamp` | Combined stamped PDF URL | read |
| `upload_document` | Attach a PDF to a transaction | write |
| `download_document` | Presigned download URLs | read |
| `list_transactions` | Search/list transactions | read |
| `get_transaction` | Transaction details | read |
| `cancel_transaction` | Cancel a transaction | ⚠️ irreversible |
| `get_evidence` | Cryptographic evidence | read |
| `verify_evidence` | Public evidence verification | read |
| `verify_envelope` | Public envelope verification | read |
| `verify_document` | Detect signatures in a PDF | ⚠️ PROD-only + quota |
| `register_webhook` / `list_webhooks` / `delete_webhook` / `test_webhook` | Webhook management | mixed |

⚠️ tools carry `destructiveHint` annotations **and** a warning in their
description so compliant clients prompt the human before invoking them.
Annotations are only hints — review your client's auto-approval settings.

### Not yet exposed
Trust sessions (`/v1/trust-sessions`) and `resend-invite` are not in
`@signdocs-brasil/api` v1.6.1 yet; they'll be added when the SDK supports them.
Digital ICP-Brasil A1 signing runs through the lower-level transaction/advance
flow rather than a hosted-session profile.

## Resources

The server exposes grounding resources the model can read on demand:

- `signdocs://quickstart` — the minimal signing flow + safety notes
- `signdocs://policy-profiles` — valid `policyProfile` values and CUSTOM steps
- `signdocs://webhook-events` — all subscribable event types

## Remote HTTP transport (multi-tenant)

The same tools are also served over **Streamable HTTP** so a single deployment
can serve many AI agents/tenants — each authenticates per session with its own
SignDocs credentials (no shared secret baked into the server).

```bash
npm run start:http        # or: signdocs-mcp-http   (listens on PORT, default 3000)
# or containerized:
docker build -t signdocs-mcp . && docker run -p 3000:3000 signdocs-mcp
```

**Endpoint:** `POST /mcp` (Streamable HTTP). Auth is required on the MCP
`initialize` request, via the `Authorization` header:

- `Authorization: Bearer <token>` — a SignDocs OAuth2 access token (from
  `/oauth2/token`), passed straight through to the API.
- `Authorization: Basic base64(clientId:clientSecret)` — the server runs the
  `client_credentials` exchange for you.

Pick the environment per session with `X-SignDocs-Environment: hml|production`
(defaults to the server's configured default).

The server behaves as an **OAuth 2.0 Resource Server**: it serves
`GET /.well-known/oauth-protected-resource` (RFC 9728, pointing at the SignDocs
authorization server) and answers an unauthenticated `initialize` with `401` +
`WWW-Authenticate`. The SignDocs API remains the authoritative token validator.
`GET /healthz` is an unauthenticated health probe.

Example client config (Bearer):

```json
{
  "mcpServers": {
    "signdocs-remote": {
      "type": "http",
      "url": "https://your-host.example/mcp",
      "headers": {
        "Authorization": "Bearer <signdocs_access_token>",
        "X-SignDocs-Environment": "hml"
      }
    }
  }
}
```

**Server env vars:** `PORT`, `HOST`, `SIGNDOCS_ENVIRONMENT` (default env),
`MCP_PUBLIC_URL` (for resource metadata behind a proxy), `MCP_CORS_ORIGIN`,
`MCP_DNS_REBINDING_PROTECTION=true` + `MCP_ALLOWED_HOSTS` / `MCP_ALLOWED_ORIGINS`
(recommended in production).

> Sessions are held in process memory, so run a single instance or use sticky
> routing. For multi-instance/serverless, front it with sticky sessions or swap
> the session map for a shared store + EventStore (resumability). Deploying onto
> the existing `external-api` Lambda + API Gateway as a NestedStack is the
> intended production path.

## Development

```bash
npm install
npm run build      # tsc → dist/
npm test           # vitest (pure unit tests, no network)
npm run inspect    # build + launch MCP Inspector against the stdio server
```

## Roadmap

- **v0.1:** local stdio server, full tool catalog, env credentials.
- **v0.2 (this release):** remote Streamable-HTTP transport with per-session,
  per-tenant auth (Bearer passthrough or Basic client-credentials) and OAuth
  Resource Server discovery. Tool layer is shared between both transports.
- **Next:** deploy the HTTP transport onto `external-api` (Lambda + API Gateway
  NestedStack); optional edge JWT validation + shared-store sessions for
  horizontal scale.
