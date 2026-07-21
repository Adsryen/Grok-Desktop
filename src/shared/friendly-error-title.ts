/**
 * Map agent / provider error text → short friendly title key (i18n).
 * Titles only — no action suggestions.
 */

export type FriendlyErrorTitleKey =
  | "err.apiKeyInvalid"
  | "err.unauthorized"
  | "err.forbidden"
  | "err.modelNotFound"
  | "err.rateLimited"
  | "err.providerUnavailable"
  | "err.badRequest"
  | "err.toolCallInvalid"
  | "err.timeout"
  | "err.network"
  | "err.internal";

/**
 * Return i18n key for a known error pattern, or null if unmapped.
 */
export function matchFriendlyErrorTitleKey(
  text: string,
): FriendlyErrorTitleKey | null {
  const s = text.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  if (
    /invalid[_\s-]?api[_\s-]?key/i.test(s) ||
    /api[_\s-]?key.*(invalid|incorrect|wrong|expired)/i.test(s) ||
    /code["']?\s*:\s*["']?invalid_api_key/i.test(s)
  ) {
    return "err.apiKeyInvalid";
  }
  if (
    /\b401\b/.test(s) ||
    /unauthorized/i.test(s) ||
    /authentication failed/i.test(s)
  ) {
    return "err.unauthorized";
  }
  if (/\b403\b/.test(s) || /forbidden/i.test(s) || /permission denied/i.test(s)) {
    return "err.forbidden";
  }
  if (
    /model_not_found/i.test(s) ||
    /model .*not (found|supported)/i.test(s) ||
    /is not supported by any configured/i.test(s)
  ) {
    return "err.modelNotFound";
  }
  if (/\b429\b/.test(s) || /rate limit/i.test(s) || /too many requests/i.test(s)) {
    return "err.rateLimited";
  }
  if (
    /\b502\b/.test(s) ||
    /\b503\b/.test(s) ||
    /\b504\b/.test(s) ||
    /\b524\b/.test(s) ||
    /bad gateway/i.test(s) ||
    /service (temporarily )?unavailable/i.test(s) ||
    /gateway timeout/i.test(s) ||
    /cloudflare/i.test(s) && /timeout|524/i.test(s)
  ) {
    return "err.providerUnavailable";
  }
  if (
    /name\s*不能为空/i.test(s) ||
    /tool not found/i.test(s) ||
    /parse_failure/i.test(s) ||
    /tool_error/i.test(s)
  ) {
    return "err.toolCallInvalid";
  }
  if (
    /timed?\s*out/i.test(s) ||
    /\btimeout\b/i.test(lower) ||
    /请求超时/i.test(s)
  ) {
    return "err.timeout";
  }
  if (
    /network/i.test(s) ||
    /econnrefused/i.test(s) ||
    /enotfound/i.test(s) ||
    /fetch failed/i.test(s) ||
    /socket hang up/i.test(s)
  ) {
    return "err.network";
  }
  if (/^internal error/i.test(s) || lower === "internal error") {
    return "err.internal";
  }
  if (/\b400\b/.test(s) || /bad request/i.test(s) || /invalid_request/i.test(s)) {
    return "err.badRequest";
  }

  return null;
}
