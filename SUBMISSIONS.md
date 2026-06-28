# Directory & registry submissions

Checklist for listing the SignDocs MCP server in public directories. Each needs a
SignDocs-owned account (npm/GitHub) and is a manual, gated step.

## 1. Official MCP Registry (registry.modelcontextprotocol.io) — ✅ DONE

**Live:** `br.com.signdocs/mcp-server@0.3.2` (published 2026-06-28).
Namespace is **DNS-based** (signdocs.com.br apex TXT proof) — chosen over
`io.github.*` so no interactive GitHub login is needed. To publish a new version:
bump `server.json` + `package.json` (keep `mcpName: br.com.signdocs/mcp-server`),
publish to npm, then `mcp-publisher login dns --domain signdocs.com.br
--private-key <ed25519 seed hex>` and `mcp-publisher publish`. The Route53 apex
TXT proof (`v=MCPv1; k=ed25519; p=…`) must remain in the signdocs.com.br zone.

Manifest: [`server.json`](./server.json) (namespace `br.com.signdocs/mcp-server`).

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
