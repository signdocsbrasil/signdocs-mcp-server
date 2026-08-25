/**
 * Read the principal out of a bearer token, without verifying it.
 *
 * Deliberately decode-only. This package is not the verifier and has no key: the
 * SignDocs API validates every token on every call and answers 401 if it is
 * forged, expired, revoked or paused. What is decided here is only *which
 * catalogue of tools to show*, and getting that wrong on a bad token is
 * harmless — a forged principal buys a smaller tool set whose every call the
 * API then rejects.
 *
 * The alternative, verifying here, would mean shipping JWKS fetching and key
 * rotation into a package that runs on people's laptops, for no security gain.
 */

export interface DecodedPrincipal {
  email: string;
  sub: string;
  name?: string;
  aiClient?: string;
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function decodePrincipal(bearer: string): DecodedPrincipal | null {
  const parts = bearer.split('.');
  if (parts.length !== 3) return null; // not a JWT — an opaque token has no principal
  const payload = decodeSegment(parts[1]);
  if (!payload) return null;

  const email = typeof payload.principal_email === 'string' ? payload.principal_email : '';
  const sub = typeof payload.principal_sub === 'string' ? payload.principal_sub : '';
  // Both halves required: an email with no subject is not an identity to act on.
  if (!email || !sub) return null;

  return {
    email,
    sub,
    ...(typeof payload.principal_name === 'string' ? { name: payload.principal_name } : {}),
    ...(typeof payload.ai_client === 'string' ? { aiClient: payload.ai_client } : {}),
  };
}
