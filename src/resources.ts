import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Static MCP resources that ground the agent so it calls tools correctly
 * without guessing. Content is inlined (no filesystem/sibling-repo coupling)
 * so the published package is self-contained.
 */

const POLICY_PROFILES = `# SignDocs policy profiles

Pass one of these as \`policyProfile\` when creating a signing session or
adding an envelope signer. An invalid value returns HTTP 400.

| profile               | steps                                   | typical use |
|-----------------------|-----------------------------------------|-------------|
| CLICK_ONLY            | clickwrap acceptance                    | low-risk consent |
| CLICK_PLUS_OTP        | clickwrap + e-mail/SMS one-time code    | standard e-signature |
| BIOMETRIC             | facial liveness + match                 | high-assurance identity |
| BIOMETRIC_PLUS_OTP    | biometric + OTP                         | strongest hosted assurance |
| CUSTOM                | caller-defined ordered steps            | supply \`customSteps\` |

When \`policyProfile=CUSTOM\`, set \`customSteps\` to an ordered list of step
types, e.g. ["CLICKWRAP","OTP","BIOMETRIC_LIVENESS","BIOMETRIC_MATCH"].

Digital ICP-Brasil A1 certificate signing is exposed through the transaction/
advance flow (step type DIGITAL_CERTIFICATE), not as a hosted-session profile.
`;

const QUICKSTART = `# SignDocs MCP quickstart

Most integrations need only the high-level **signing session** flow:

1. \`create_signing_session\` with purpose=DOCUMENT_SIGNATURE, a policyProfile,
   the signer, and the base64 PDF (\`documentBase64\`). The result includes a
   ready-to-share **signingUrl** (the session url + one-time embed token).
2. Deliver the signingUrl to the signer (or pass \`owner.email\` so SignDocs
   e-mails them automatically), or subscribe to webhooks for completion.
3. Poll \`get_signing_session_status\` (or rely on webhooks) until COMPLETED.
4. The COMPLETED status carries an \`evidenceId\` — verify it publicly with
   \`verify_evidence\`.

Multiple signers on one document → use \`create_envelope\` then
\`add_session_to_envelope\` once per signer (signerIndex 0..N-1).

Environment: set SIGNDOCS_ENVIRONMENT=hml (default) for testing or
=production for live, binding signatures. HML data expires after ~7 days and
the verify_document tool is production-only.

⚠️ create_/add_/cancel_ tools take real, quota-consuming, often
legally-binding actions. Confirm with the human before invoking them.
`;

const WEBHOOK_EVENTS = `# SignDocs webhook events

Subscribe via \`register_webhook\`. Payloads are signed with HMAC-SHA256 using
the secret returned at registration (300s replay tolerance).

TRANSACTION.CREATED, TRANSACTION.COMPLETED, TRANSACTION.CANCELLED,
TRANSACTION.FAILED, TRANSACTION.EXPIRED
STEP.STARTED, STEP.COMPLETED, STEP.FAILED
SIGNING_SESSION.CREATED, SIGNING_SESSION.COMPLETED, SIGNING_SESSION.CANCELLED,
SIGNING_SESSION.EXPIRED
ENVELOPE.CREATED, ENVELOPE.ALL_SIGNED, ENVELOPE.EXPIRED
QUOTA.WARNING, API.DEPRECATION_NOTICE
`;

interface StaticResource {
  uri: string;
  name: string;
  title: string;
  description: string;
  text: string;
}

const RESOURCES: StaticResource[] = [
  {
    uri: 'signdocs://policy-profiles',
    name: 'policy-profiles',
    title: 'SignDocs policy profiles',
    description: 'Valid policyProfile values and CUSTOM step types.',
    text: POLICY_PROFILES,
  },
  {
    uri: 'signdocs://quickstart',
    name: 'quickstart',
    title: 'SignDocs MCP quickstart',
    description: 'The minimal signing-session flow and safety notes.',
    text: QUICKSTART,
  },
  {
    uri: 'signdocs://webhook-events',
    name: 'webhook-events',
    title: 'SignDocs webhook events',
    description: 'All subscribable webhook event types.',
    text: WEBHOOK_EVENTS,
  },
];

export function registerResources(server: McpServer): void {
  for (const r of RESOURCES) {
    server.registerResource(
      r.name,
      r.uri,
      { title: r.title, description: r.description, mimeType: 'text/markdown' },
      async (uri: URL) => ({
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: r.text }],
      }),
    );
  }
}
