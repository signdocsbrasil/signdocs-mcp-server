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

const POLICY_PROFILE = z
  .string()
  .describe(
    'Identity-assurance profile: CLICK_ONLY, CLICK_PLUS_OTP, BIOMETRIC, BIOMETRIC_PLUS_OTP. ' +
      'Read the signdocs://policy-profiles resource for the authoritative list — an invalid value returns 400.',
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
    cpf: z.string().optional().describe('Brazilian individual taxpayer ID, digits only. Required by CLICK_ONLY.'),
    cnpj: z.string().optional().describe('Brazilian company taxpayer ID, digits only.'),
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
