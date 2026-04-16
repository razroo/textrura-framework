/**
 * Normalize agent/schema strings into values browsers accept on specialized
 * {@link HTMLInputElement} types. Keeps plain text/tel/email/password as-is.
 */

/**
 * Returns a value suitable for assigning to `HTMLInputElement.value` for the
 * given `input` type (from `el.type`, lowercased). Non-specialized kinds pass through.
 */
export function canonicalizeHtmlInputValue(inputType: string | undefined, raw: string): string {
  const t = (inputType || 'text').toLowerCase()
  if (
    t === ''
    || t === 'text'
    || t === 'search'
    || t === 'url'
    || t === 'tel'
    || t === 'email'
    || t === 'password'
    || t === 'textarea'
    || t === 'hidden'
  ) {
    return raw
  }

  const s = raw.trim()
  if (!s) return raw

  if (t === 'number' || t === 'range') {
    const cleaned = s.replace(/,/g, '').replace(/\s/g, '')
    const n = parseFloat(cleaned)
    if (Number.isFinite(n)) return String(n)
    return raw
  }

  if (t === 'date') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    return raw
  }

  if (t === 'datetime-local') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16)
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const h = String(d.getHours()).padStart(2, '0')
      const min = String(d.getMinutes()).padStart(2, '0')
      return `${y}-${m}-${day}T${h}:${min}`
    }
    return raw
  }

  if (t === 'time') {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s)
    if (m) {
      const hh = Math.min(23, Math.max(0, parseInt(m[1]!, 10)))
      const mm = m[2]!
      const ss = m[3]
      const h = String(hh).padStart(2, '0')
      return ss ? `${h}:${mm}:${ss}` : `${h}:${mm}`
    }
    return s
  }

  if (t === 'month') {
    if (/^\d{4}-\d{2}$/.test(s)) return s
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, '0')
      return `${y}-${mo}`
    }
    return raw
  }

  if (t === 'week') {
    const wm = /^(\d{4})-w(\d{2})$/i.exec(s)
    if (wm) return `${wm[1]}-W${wm[2]}`
    return raw
  }

  return raw
}
