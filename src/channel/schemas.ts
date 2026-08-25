import { z } from 'zod';

/**
 * Input shapes for account mode.
 *
 * A flattened, deliberately narrower projection of the tenant-mode schemas.
 * Three things are gone on purpose:
 *
 *  - `owner` — set server-side from the signed-in account. Accepting it from
 *    the model would let a caller attribute a document to somebody else, which
 *    is exactly what the ownership guards are there to prevent.
 *  - `userExternalId` — derived from the signer's e-mail. There is no external
 *    system here to correlate with.
 *  - `idempotencyKey` — minted per call by the tool. Quota is one pool and is
 *    never refunded, so this is too important to leave to a model that may or
 *    may not pass a stable value on retry.
 */

/**
 * The profiles this channel offers — an enum, not a free string.
 *
 * The API itself accepts five, but two of them (BIOMETRIC, BIOMETRIC_PLUS_OTP)
 * need hosted facial liveness, which the shared channel tenant does not have
 * enabled. Offering them would let a model create a session that is charged and
 * then cannot be signed by anybody, which is the worst of both outcomes.
 *
 * Enumerated rather than described in prose because the failure modes are not
 * symmetric: a rejected value costs a validation error the model can correct for
 * free, while an accepted-but-unusable one costs a document that is never
 * refunded. Let the type system refuse it.
 */
const POLICY_PROFILE = z
  .enum(['CLICK_ONLY', 'CLICK_PLUS_OTP', 'DIGITAL_CERTIFICATE'])
  .describe(
    'How the signer proves who they are. CLICK_ONLY = accept by clicking. ' +
      'CLICK_PLUS_OTP = click plus a one-time code by e-mail or SMS. ' +
      'DIGITAL_CERTIFICATE = click plus an ICP-Brasil A1 certificate signature. ' +
      'Read the signdocs://policy-profiles resource before choosing.',
  );

const documentFields = {
  documentBase64: z.string().optional().describe('The PDF as base64. Prefer uploadToken for anything a human picked.'),
  uploadToken: z
    .string()
    .optional()
    .describe('Token from request_document_upload — the reliable path for a local file.'),
  documentUrl: z
    .string()
    .optional()
    .describe('Public https link to a PDF, fetched server-side. A Google Drive /view link will NOT work.'),
  documentFilename: z.string().optional().describe('Display filename, e.g. contrato.pdf.'),
};

const channelSigner = z
  .object({
    name: z.string().describe('Signer full name.'),
    email: z.string().email().optional().describe('Where the invite goes. Defaults to the signed-in account.'),
    // Not optional in practice. The API requires one or the other on EVERY
    // profile (signing-sessions/create.ts), and describing it as CLICK_ONLY-only
    // is what sent the first real ChatGPT session into a 400.
    cpf: z.string().optional().describe(
      'Brazilian individual taxpayer ID (CPF), digits only. REQUIRED unless you pass cnpj — ' +
        'the signature is attributed to this document, so ask the user for it before sending.',
    ),
    cnpj: z.string().optional().describe(
      'Brazilian company taxpayer ID (CNPJ), digits only. Use instead of cpf when the signer signs for a company.',
    ),
  })
  .describe('The person who will sign.');

export const channelCreateSessionShape = {
  ...documentFields,
  signer: channelSigner,
  policyProfile: POLICY_PROFILE,
  purpose: z
    .enum(['DOCUMENT_SIGNATURE', 'ACTION_AUTHENTICATION'])
    .optional()
    .describe('Defaults to DOCUMENT_SIGNATURE.'),
};

export const channelCreateEnvelopeShape = {
  ...documentFields,
  signers: z
    .array(
      channelSigner.extend({
        profile: POLICY_PROFILE.optional().describe('Per-signer profile. Defaults to CLICK_ONLY.'),
      }),
    )
    .min(1)
    .describe('Every signer, in order. One call carries the whole envelope — there is no add-signer step.'),
  signingMode: z
    .enum(['PARALLEL', 'SEQUENTIAL'])
    .optional()
    .describe('SEQUENTIAL makes each signer wait for the previous one. Defaults to PARALLEL.'),
};

export const channelSessionIdShape = {
  sessionId: z.string().describe('The signing session id.'),
};

export const channelEnvelopeIdShape = {
  envelopeId: z.string().describe('The envelope id.'),
};

export const channelSignedDocumentShape = {
  sessionId: z.string().optional().describe('For a single-signer send.'),
  envelopeId: z.string().optional().describe('For a multi-signer send — returns the combined stamped PDF.'),
};

export const channelEvidenceShape = {
  sessionId: z.string().describe('The signing session id, from the send.'),
};

export const channelVerifyEvidenceShape = {
  evidenceId: z.string().optional().describe('Evidence pack id, if you have it.'),
  sessionId: z.string().optional().describe('Your signing session id — the evidence id is looked up from it.'),
};

export const channelVerifyDocumentShape = {
  ...documentFields,
};

export const emptyShape = {};
