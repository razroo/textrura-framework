/**
 * Parse a user-supplied page URL for HTTP(S) HTML discovery (`geometra` CLI).
 * When no `://` is present, prepends `https://` so bare hosts (`example.com`, `localhost:5173`)
 * work without typing the scheme.
 */
export function parseHttpPageUrl(raw: string): URL {
  const href = raw.includes('://') ? raw : `https://${raw}`
  return new URL(href)
}
