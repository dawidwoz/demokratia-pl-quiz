const MAX_TOKEN_LENGTH = 200;

/**
 * Reads `token` from a URL fragment such as `token=abc` (mail links look like `/weryfikacja#token=abc`).
 * One-time tokens live in the fragment, not the query string, so the browser never sends them to the
 * server and they stay out of its logs. Returns null for a missing, empty or implausibly long value.
 */
export function readFragmentToken(fragment: string | null): string | null {
  if (!fragment) return null;
  const token = new URLSearchParams(fragment).get('token');
  return token !== null && token.length > 0 && token.length <= MAX_TOKEN_LENGTH ? token : null;
}
