/**
 * The account-mode ("channel") contract.
 *
 * In tenant mode a tool calls the SignDocs API directly with the caller's own
 * tenant credentials, and the tenant boundary is the security boundary. Account
 * mode is different: every user of the AI-assistant channel shares ONE upstream
 * tenant, so the tenant boundary no longer separates anybody. What separates
 * them is the signed-in human, and that lives host-side — quota against their
 * plan, `owner` stamped from their verified email, ownership guards on every
 * read and every cancel.
 *
 * None of that belongs in this package: it needs the channel-quota service, the
 * sub-user directory and the idempotency store, all of which are the host's. So
 * the host injects an implementation of this interface and the channel tools
 * become thin argument-shaping wrappers over it.
 *
 * The catalogue is deliberately smaller than tenant mode's. Anything that reads
 * across a tenant — listing transactions or sessions, and every webhook
 * operation — would show one user another user's data on a shared tenant, so it
 * is not exposed here at all rather than filtered after the fact.
 */

export interface ChannelSigner {
  name: string;
  email?: string;
  cpf?: string;
  cnpj?: string;
  /** Policy profile for this signer, e.g. CLICK_ONLY, OTP_EMAIL. */
  profile?: string;
}

export interface ChannelDocument {
  /** Base64 PDF. Exactly one of content/uploadToken/documentUrl is required. */
  content?: string;
  /** Token from `request_document_upload`. */
  uploadToken?: string;
  /** Public https PDF link, fetched server-side. */
  documentUrl?: string;
  filename?: string;
}

export interface CreateSessionInput {
  document: ChannelDocument;
  signer: ChannelSigner;
  policyProfile: string;
  purpose?: 'DOCUMENT_SIGNATURE' | 'ACTION_AUTHENTICATION';
  /**
   * Required. Quota is one pool and is never refunded, so a retry without a
   * stable key bills the user a second time for one document. The tools mint
   * one per logical send and reuse it across retries within the call.
   */
  idempotencyKey: string;
}

export interface CreateSessionResult {
  sessionId: string;
  transactionId?: string;
  /**
   * Absent by design for a CLICK_ONLY send to somebody else: for that profile
   * the link IS the authentication, so it goes to the signer by e-mail and is
   * never handed back to the sender.
   */
  signingUrl?: string;
  inviteSent?: boolean;
}

export interface CreateEnvelopeInput {
  document: ChannelDocument;
  signers: ChannelSigner[];
  signingMode?: 'PARALLEL' | 'SEQUENTIAL';
  idempotencyKey: string;
}

export interface CreateEnvelopeResult {
  envelopeId: string;
  totalSigners: number;
  sessions: Array<{
    signerIndex: number;
    name: string;
    email?: string;
    sessionId?: string;
    signingUrl?: string;
    inviteSent?: boolean;
  }>;
}

export interface ChannelApi {
  /** Plan and remaining document allowance for the signed-in user. */
  initSession(): Promise<{
    allowed: boolean;
    quota: { used: number; remaining: number; limit: number };
    user: { email: string; plan: string; name?: string };
  }>;

  createSigningSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult>;

  getSessionStatus(sessionId: string): Promise<unknown>;
  getEnvelopeStatus(envelopeId: string): Promise<unknown>;

  cancelSession(sessionId: string): Promise<unknown>;
  cancelEnvelope(envelopeId: string): Promise<unknown>;

  /** Short-lived presigned URL for the signed PDF. Owner-guarded, fails closed. */
  getSignedDocument(target: { sessionId?: string; envelopeId?: string }): Promise<{ url: string; filename?: string }>;

  /**
   * The evidence pack for a send. Keyed on the SESSION, not the transaction:
   * the session status is what carries the owner, so it is what makes the
   * ownership check possible on a shared tenant.
   */
  getEvidence(sessionId: string): Promise<unknown>;

  /** Verification. Public by design — a signed document is verifiable by whoever holds it. */
  verifyEvidence(input: { evidenceId?: string; sessionId?: string }): Promise<unknown>;
  verifyEnvelope(input: { envelopeId: string }): Promise<unknown>;
  verifyDocument(input: { content?: string; uploadToken?: string; documentUrl?: string }): Promise<unknown>;
}
