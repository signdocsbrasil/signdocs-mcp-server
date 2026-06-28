# Directory & registry submissions

Checklist for listing the SignDocs MCP server in public directories. Each needs a
SignDocs-owned account (npm/GitHub) and is a manual, gated step.

## 1. Official MCP Registry (registry.modelcontextprotocol.io)

Manifest: [`server.json`](./server.json) (namespace `io.github.signdocsbrasil/mcp-server`).

```bash
# Install the publisher CLI (see the registry's current publishing guide)
# https://github.com/modelcontextprotocol/registry  →  docs/guides/publishing
mcp-publisher login github          # verifies the io.github.signdocsbrasil namespace
mcp-publisher validate ./server.json
mcp-publisher publish               # reads ./server.json
```

Notes:
- Namespace `io.github.signdocsbrasil/*` is owned via the signdocsbrasil GitHub org.
- **Gate:** `server.json` `remotes[]` points at the PROD endpoint
  (`https://mcp.signdocs.com.br/mcp`). Publish only after `SigExtMcp-prod` is live,
  or temporarily change the remote URL to the HML endpoint.
- The `$schema` date (`2025-12-11`) and field names evolve — re-validate with the CLI
  at submission time.

## 2. Anthropic official plugin marketplace

Repo: https://github.com/anthropics/claude-plugins-official

Submit a PR adding an entry that points at the SignDocs plugin marketplace
(`signdocsbrasil/signdocs-mcp-plugin`). The plugin itself already validates with
`claude plugin validate --strict`. Follow that repo's contribution guidelines for
required metadata and review.

## 3. Other directories (optional)

- **Smithery** (smithery.ai) — submit the npm server / remote endpoint.
- **mcp.so / Glama / PulseMCP** community catalogs — submit the GitHub repo.
- **Claude connector directory (claude.ai web)** — BLOCKED until the SignDocs
  `/oauth2` server adds the OAuth `authorization_code` + PKCE + Dynamic Client
  Registration flow (the web "Add connector" UI requires it; the AS is
  `client_credentials`-only today). Track as the Phase 2 backend project.

## Already live (no submission needed)

- **npm:** `@signdocs-brasil/mcp-server`
- **Claude Code plugin + marketplace:** `signdocsbrasil/signdocs-mcp-plugin`
  (`/plugin marketplace add signdocsbrasil/signdocs-mcp-plugin`)
- **Claude Desktop extension:** `.mcpb` on the plugin repo's GitHub Releases
