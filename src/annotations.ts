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

/**
 * Writes that are not legally binding nor irreversible (upload, resend OTP,
 * register webhook).
 *
 * `destructiveHint` is true here even though none of these destroys anything,
 * and that is deliberate. Anthropic's connector-directory review requires every
 * tool to carry `readOnlyHint: true` OR `destructiveHint: true`; a tool with
 * both false is an automatic rejection. These tools modify state, so read-only
 * would be a lie, which leaves destructive as the only honest option available.
 *
 * The cost is a confirmation prompt on actions that did not strictly need one.
 * That is the safe direction to be wrong in, and it is the price of the two-state
 * vocabulary the directory offers.
 */
export const WRITE_SAFE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
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
