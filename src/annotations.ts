/**
 * MCP tool annotation presets. These are *hints* — clients MAY use them to
 * decide whether to auto-run a tool or prompt the human first. Because not
 * every client honors them, binding/quota tools ALSO carry an explicit warning
 * sentence in their `description` (see tools/*.ts).
 *
 * @see https://modelcontextprotocol.io/specification — Tool annotations
 */
export interface ToolAnnotations {
  title?: string;
  /** Tool does not modify state. */
  readOnlyHint?: boolean;
  /** Tool may perform irreversible / consequential changes → clients should confirm. */
  destructiveHint?: boolean;
  /** Repeated identical calls have no additional effect. */
  idempotentHint?: boolean;
  /** Tool talks to an external system (always true here — it's a remote API). */
  openWorldHint?: boolean;
}

/** Pure reads (status, get, list, public verification). */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/** Writes that are not legally binding nor irreversible (upload, resend OTP, register webhook). */
export const WRITE_SAFE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * Legally-binding, quota-consuming, or irreversible actions
 * (create signing session/envelope, cancel, verify-document).
 * Clients SHOULD prompt the human before invoking.
 */
export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/** Prefix prepended to descriptions of binding/quota tools so even annotation-blind clients surface the risk. */
export const CONFIRM_WARNING =
  '⚠️ This performs a consequential, possibly irreversible action (legally-binding signature ' +
  'request and/or quota consumption). Confirm with the human before calling. ';
