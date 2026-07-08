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

## 2. Anthropic plugin directory (claude-community marketplace)

There are TWO Anthropic marketplaces:
- **`claude-plugins-official`** — curated by Anthropic *at its discretion*. There is
  **no application process**; the submission form does NOT add plugins here. We can't
  submit to it — Anthropic decides.
- **`claude-plugins-community`** (`anthropics/claude-plugins-community`) — where
  third-party submissions land after review. Users add it with `/plugin marketplace add
  anthropics/claude-plugins-community` and install as `@claude-community`. **This is
  where we submit.**

Submit via one of the in-app forms (NOT a GitHub PR):
- **Console:** https://platform.claude.com/plugins/submit — for individual authors not
  in a Team/Enterprise org.
- **claude.ai:** https://claude.ai/admin-settings/directory/submissions/plugins/new —
  requires a Team/Enterprise org + directory-management access (org Owners have it).

Point the submission at `signdocsbrasil/signdocs-mcp-plugin`. Run `claude plugin
validate` locally first (the review pipeline runs the same check + automated safety
screening). Have ready a HML sandbox reviewer credential (the plugin's userConfig needs
client_id/client_secret) and the privacy-policy URL
(https://www.signdocs.com.br/politica-de-privacidade.html).

After approval, the plugin is pinned to a commit SHA in the community catalog; CI bumps
the pin as we push new commits, and the public `marketplace.json` syncs nightly (so
expect a delay before it's installable). Check by searching its name in the community
catalog.

## 3. Other directories (optional)

- **Smithery** (smithery.ai) — submit the npm server / remote endpoint.
- **mcp.so / Glama / PulseMCP** community catalogs — submit the GitHub repo.
- **Claude connector directory (claude.ai web)** — UNBLOCKED: the SignDocs OAuth
  server now supports `authorization_code` + PKCE + DCR + AS metadata, live in prod
  (`auth.signdocs.com.br`), and the custom connector is verified working in the
  claude.ai web UI. Directory listing still needs a privacy policy + reviewer test
  creds when submitting.

## Already live (no submission needed)

- **npm:** `@signdocs-brasil/mcp-server`
- **Claude Code plugin + marketplace:** `signdocsbrasil/signdocs-mcp-plugin`
  (`/plugin marketplace add signdocsbrasil/signdocs-mcp-plugin`)
- **Claude Desktop extension:** `.mcpb` on the plugin repo's GitHub Releases
