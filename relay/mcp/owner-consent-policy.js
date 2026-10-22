/**
 * Fail-closed owner approval gate for Chat Router OAuth.
 * This module does NOT issue OAuth tokens. The official Cloudflare OAuth
 * provider must validate PKCE, client metadata, redirect URI, and state.
 * A trusted identity middleware must verify the user's identity BEFORE
 * calling this function; untrusted request headers are not identity.
 */
export function canApproveChatRouterGrant({ identity, ownerSubject, requestedScopes, resource, expectedResource, consent }) {
  if (!identity || identity.verified !== true ||
      typeof identity.subject !== "string" ||
      !ownerSubject || identity.subject !== ownerSubject) return false;
  if (typeof resource !== "string" || resource !== expectedResource ||
      !expectedResource?.startsWith("https://") ||
      !expectedResource.endsWith("/mcp")) return false;
  if (!Array.isArray(requestedScopes) || requestedScopes.length !== 1 ||
      requestedScopes[0] !== "beeper:read") return false;
  // Consent must be bound to the actual OAuth transaction by the provider.
  if (!consent || consent.verified !== true || consent.approved !== true ||
      typeof consent.transactionId !== "string" ||
      consent.transactionId.length < 16) return false;
  return true;
}
