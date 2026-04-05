/**
 * Pretext measures text via `OffscreenCanvas`. Node may expose a native implementation whose
 * `measureText()` depends on host fonts (darwin vs linux), which breaks geometry snapshots and
 * cross-platform parity. Install a deterministic mock in every Vitest worker before test files
 * import `textura` / Pretext (which caches the first measure context).
 */
class DeterministicOffscreenCanvas {
  constructor(_width: number, _height: number) {}

  getContext(type: string) {
    if (type !== '2d') return null
    return {
      font: '',
      measureText(value: string) {
        // Textura reports `Math.ceil(contentWidth) + 1` for nowrap text (anti-clip buffer). Snapshots were
        // recorded against ~7px/grapheme effective widths (linux sans-serif), i.e. ceil(7)+1=8 per
        // single-char label and ceil(15)+1=16 for "Hi". Pure `length * 8` overshoots after the +1 buffer.
        const n = value.length
        const w = n === 0 ? 0 : n * 8 - 1
        return { width: w }
      },
    }
  }
}

;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = DeterministicOffscreenCanvas
