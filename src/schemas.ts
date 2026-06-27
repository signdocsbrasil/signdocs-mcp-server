import { z } from 'zod';

/**
 * Zod input shapes for every MCP tool. Each export is a ZodRawShape (a plain
 * object of Zod types) passed straight to `server.registerTool(...)`. They are
 * a flattened, AI-friendly projection of the SDK request types — handlers in
 * tools/*.ts assemble the nested SDK request objects from these.
 */

const PURPOSE = z
  .enum(['DOCUMENT_SIGNATURE', 'ACTION_AUTHENTICATION'])
  .describe('DOCUMENT_SIGNATURE to sign a PDF; ACTION_AUTHENTICATION to authenticate an action with no document.');

const LOCALE = z.enum(['pt-BR', 'en', 'es']).describe('UI/email language. Default pt-BR.');

const POLICY_PROFILE = z
  .string()
  .describe(
    'Identity-assurance profile: CLICK_ONLY, CLICK_PLUS_OTP, BIOMETRIC, BIOMETRIC_PLUS_OTP, or CUSTOM. ' +
      'Read the signdocs://policy-profiles resource for the authoritative list — an invalid value returns 400.',
  );

const signerObject = z
  .object({
    name: z.string().describe('Signer full name.'),
    userExternalId: z.string().describe('Stable per-signer ID in your system (used for biometric enrollment lookup).'),
    email: z.string().email().optional().describe('Required to email the signer their invite link.'),
    phone: z.string().optional().describe('E.164 phone, e.g. +5541999998888 (for SMS OTP).'),
    cpf: z.string().optional().describe('Brazilian individual taxpayer ID (digits only).'),
    cnpj: z.string().optional().describe('Brazilian company taxpayer ID (digits only).'),
    otpChannel: z.enum(['email', 'sms']).optional().describe('Preferred OTP delivery channel.'),
    otpChannelSelectable: z.boolean().optional().describe('Let the signer pick the OTP channel.'),
    birthDate: z.string().optional().describe('ISO date (YYYY-MM-DD), used by some gov-db validations.'),
  })
  .describe('The person who will sign / authenticate.');

const ownerObject = z
  .object({
    name: z.string().optional(),
    email: z.string().email().optional(),
  })
  .optional()
  .describe(
    'The requester (distinct from the signer). When set and signer.email differs, SignDocs auto-emails ' +
      'the signer an invite and notifies the owner on completion. Omit to deliver links yourself via webhooks.',
  );

const metadata = z.record(z.string()).optional().describe('Free-form key/value tags (keys ≤256, values ≤1024 chars).');

// ── Signing sessions ────────────────────────────────────────────────────────

export const createSigningSessionShape = {
  purpose: PURPOSE,
  policyProfile: POLICY_PROFILE,
  customSteps: z
    .array(z.string())
    .optional()
    .describe('Ordered step types — REQUIRED only when policyProfile=CUSTOM (e.g. ["CLICKWRAP","OTP"]).'),
  signer: signerObject,
  documentBase64: z
    .string()
    .optional()
    .describe('Base64-encoded PDF (≤10MB). Required when purpose=DOCUMENT_SIGNATURE.'),
  documentFilename: z.string().optional().describe('Original filename, e.g. contrato.pdf.'),
  action: z
    .object({
      type: z.string(),
      description: z.string(),
      reference: z.string().optional(),
    })
    .optional()
    .describe('What is being authenticated — used when purpose=ACTION_AUTHENTICATION.'),
  returnUrl: z.string().url().optional().describe('Redirect URL after completion (sessionId appended as query param).'),
  cancelUrl: z.string().url().optional().describe('Redirect URL if the signer cancels.'),
  metadata,
  locale: LOCALE.optional(),
  expiresInMinutes: z.number().int().min(5).max(1440).optional().describe('Session lifetime, 5–1440 min (default 60).'),
  owner: ownerObject,
  idempotencyKey: z.string().optional().describe('Idempotency key for safe retries; a UUID is generated if omitted.'),
};

export const sessionIdShape = {
  sessionId: z.string().describe('The signing session ID (sigex_…).'),
};

export const listSigningSessionsShape = {
  status: z
    .string()
    .describe('Filter by status: ACTIVE, COMPLETED, CANCELLED, EXPIRED, or FAILED.'),
  limit: z.number().int().min(1).max(100).optional().describe('Page size (default server value).'),
  cursor: z.string().optional().describe('Pagination cursor from a previous response (nextCursor).'),
};

export const resendOtpShape = {
  sessionId: z.string().describe('The signing session ID.'),
  channel: z.enum(['email', 'sms']).optional().describe('Override OTP delivery channel.'),
};

// ── Envelopes (multi-signer) ─────────────────────────────────────────────────

export const createEnvelopeShape = {
  signingMode: z.enum(['PARALLEL', 'SEQUENTIAL']).describe('PARALLEL: anyone signs in any order. SEQUENTIAL: ordered.'),
  totalSigners: z.number().int().min(1).describe('How many signers will be added to this envelope.'),
  documentBase64: z.string().describe('Base64-encoded PDF (≤10MB) shared by all signers.'),
  documentFilename: z.string().optional(),
  metadata,
  locale: LOCALE.optional(),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  expiresInMinutes: z.number().int().optional(),
  owner: ownerObject,
  idempotencyKey: z.string().optional().describe('Idempotency key for safe retries; a UUID is generated if omitted.'),
};

export const envelopeIdShape = {
  envelopeId: z.string().describe('The envelope ID (env_…).'),
};

export const addEnvelopeSessionShape = {
  envelopeId: z.string().describe('The envelope to add a signer to.'),
  signer: signerObject,
  policyProfile: POLICY_PROFILE,
  purpose: PURPOSE.optional(),
  signerIndex: z.number().int().min(0).describe('Zero-based position of this signer (0..totalSigners-1).'),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  metadata,
};

// ── Documents ────────────────────────────────────────────────────────────────

export const uploadDocumentShape = {
  transactionId: z.string().describe('Transaction to attach the document to (txn_…).'),
  documentBase64: z.string().describe('Base64-encoded PDF (≤10MB).'),
  filename: z.string().optional(),
};

export const transactionIdShape = {
  transactionId: z.string().describe('The transaction ID (txn_…).'),
};

// ── Transactions (low-level / search) ────────────────────────────────────────

export const listTransactionsShape = {
  status: z.string().optional().describe('Filter by transaction status (e.g. PENDING, COMPLETED, CANCELLED).'),
  userExternalId: z.string().optional().describe('Filter by signer external ID.'),
  documentGroupId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  nextToken: z.string().optional().describe('Pagination token from a previous response.'),
  startDate: z.string().optional().describe('ISO date lower bound.'),
  endDate: z.string().optional().describe('ISO date upper bound.'),
};

// ── Verification ─────────────────────────────────────────────────────────────

export const verifyEvidenceShape = {
  evidenceId: z.string().describe('Evidence ID (evd_…) to verify. Public — no signer PII is revealed.'),
};

export const verifyEnvelopeShape = {
  envelopeId: z.string().describe('Envelope ID to verify all signers for. Public endpoint.'),
};

export const verifyDocumentShape = {
  documentBase64: z.string().describe('Base64-encoded PDF to inspect for embedded signatures.'),
  filename: z.string().optional(),
};

// ── Webhooks ─────────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  'TRANSACTION.CREATED',
  'TRANSACTION.COMPLETED',
  'TRANSACTION.CANCELLED',
  'TRANSACTION.FAILED',
  'TRANSACTION.EXPIRED',
  'STEP.STARTED',
  'STEP.COMPLETED',
  'STEP.FAILED',
  'QUOTA.WARNING',
  'API.DEPRECATION_NOTICE',
  'SIGNING_SESSION.CREATED',
  'SIGNING_SESSION.COMPLETED',
  'SIGNING_SESSION.CANCELLED',
  'SIGNING_SESSION.EXPIRED',
  'ENVELOPE.CREATED',
  'ENVELOPE.ALL_SIGNED',
  'ENVELOPE.EXPIRED',
] as const;

export const registerWebhookShape = {
  url: z.string().url().describe('HTTPS endpoint that will receive event POSTs.'),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1)
    .describe('Event types to subscribe to. The response returns a signing secret for HMAC verification.'),
};

export const webhookIdShape = {
  webhookId: z.string().describe('The webhook ID to act on.'),
};
