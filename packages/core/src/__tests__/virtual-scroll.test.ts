import { describe, it, expect } from 'vitest'
import { syncVirtualWindow } from '../virtual-scroll.js'

describe('syncVirtualWindow', () => {
  it('keeps selection visible while moving down rapidly', () => {
    let start = 0
    for (let selected = 0; selected < 500; selected++) {
      const next = syncVirtualWindow(2000, 12, selected, start)
      start = next.start
      expect(next.selected).toBe(selected)
      expect(next.selected >= next.start && next.selected <= next.end).toBe(true)
    }
  })

  it('keeps selection visible while moving up rapidly', () => {
    let start = 1988
    for (let selected = 1999; selected >= 0; selected -= 3) {
      const next = syncVirtualWindow(2000, 12, selected, start)
      start = next.start
      expect(next.selected).toBe(selected)
      expect(next.selected >= next.start && next.selected <= next.end).toBe(true)
    }
  })
})
