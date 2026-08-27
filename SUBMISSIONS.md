# Directory & registry submissions

Checklist for listing the SignDocs MCP server in public directories. Each needs a
SignDocs-owned account (npm/GitHub) and is a manual, gated step.

## 1. Official MCP Registry (registry.modelcontextprotocol.io) — ✅ DONE

**Live:** `br.com.signdocs/mcp-server@0.9.1` (published 2026-08-27; 0.3.2 before that).
Namespace is **DNS-based** (signdocs.com.br apex TXT proof) — chosen over
`io.github.*` so no interactive GitHub login is needed.

Manifest: [`server.json`](./server.json) (namespace `br.com.signdocs/mcp-server`).

```bash
# The CLI is not preinstalled. Binary releases:
# https://github.com/modelcontextprotocol/registry/releases  (mcp-publisher_linux_amd64.tar.gz)
mcp-publisher validate ./server.json     # hits the live registry, not just $schema
mcp-publisher login dns --domain signdocs.com.br --private-key <ed25519 seed hex>
mcp-publisher publish                    # reads ./server.json
```

To ship a new version: bump `server.json` + `package.json` (keep
`mcpName: br.com.signdocs/mcp-server`), publish to npm **first**, then login+publish.

Notes:
- ⚠️ **`description` has a hard 100-character cap.** Over it, the registry answers
  `422 expected length <= 100` and nothing publishes. This bit the 0.9.1 submission
  (the description was 234 chars). Always `validate` before anything else.
  The cap also means the PF/PJ dual-audience framing does **not** fit here — it lives
  on the page behind `websiteUrl`. What survives is tuned for search: the catalogue
  matches on name first and description second, and every SignDocs user needs a CPF,
  so the copy is pt-BR with `ICP-Brasil` kept because it reads in both languages.
- **DNS auth key.** The seed hex lives in Secrets Manager as
  `signdocs-mcp-registry-key` (`.seedHex`), us-east-1. The matching public key is the
  `p=` in the apex TXT, Route53 zone `Z02450102AMXJRGRPF47L`, TTL 60. The apex TXT is
  **one record set with three values** — UPSERT all three or you drop SPF (mail) or
  the Google site verification (Search Console).
  Lost the seed? Don't hunt for it: DNS auth only proves domain control, so generate a
  fresh keypair, swap the `p=` value, and log in again. Rotated 2026-08-27 for exactly
  this reason.
- Login tokens last **5 minutes** — `login` immediately before `publish`.
- A `400 … failed to fetch package metadata from NPM: context deadline exceeded` is
  the registry timing out against npm on its own side. Just retry.
- Namespace `io.github.signdocsbrasil/*` is also owned via the signdocsbrasil GitHub org.
- **Gate:** `server.json` `remotes[]` points at the PROD endpoint
  (`https://mcp.signdocs.com.br/mcp`). Publish only after `SigExtMcp-prod` is live,
  or temporarily change the remote URL to the HML endpoint.
- `packages[].environmentVariables` stay `isRequired: true` on purpose — the stdio/npx
  path is credential-only. Account mode is browser-OAuth, so it is the
  `remotes[].headers` that are optional.
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
