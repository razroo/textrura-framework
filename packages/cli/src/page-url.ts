/**
 * Parse a user-supplied page URL for HTTP(S) HTML discovery (`geometra` CLI).
 * Leading and trailing ASCII whitespace is stripped so pasted hosts work; empty input throws
 * (avoids `new URL('https://')`, which is invalid).
 * When no `://` is present, prepends `https://` so bare hosts (`example.com`, `localhost:5173`)
 * work without typing the scheme.
 *
 * @throws {Error} When `raw` is empty or whitespace-only after trim — message `page URL is empty`.
 * @throws {TypeError} When the WHATWG URL parser rejects the normalized `href` (e.g. `https://` with no host,
 *   invalid port, or spaces in the host after prepending the scheme).
 */
export function parseHttpPageUrl(raw: string): URL {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('page URL is empty')
  }
  const href = trimmed.includes('://') ? trimmed : `https://${trimmed}`
  return new URL(href)
}
