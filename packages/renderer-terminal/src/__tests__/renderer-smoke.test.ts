import { describe, it, expect } from 'vitest'
import { TerminalRenderer } from '../renderer.js'
import { box, text } from '@geometra/core'
import { readFileSync } from 'node:fs'

class MemoryStream {
  public chunks: string[] = []
  write(chunk: string): boolean {
    this.chunks.push(chunk)
    return true
  }
  toString(): string {
    return this.chunks.join('')
  }
}

describe('terminal renderer smoke', () => {
  it('renders a basic tree to ANSI output buffer', () => {
    const output = new MemoryStream()
    const renderer = new TerminalRenderer({
      width: 20,
      height: 4,
      output: output as unknown as NodeJS.WritableStream,
    })
    const tree = box({ backgroundColor: '#111111' }, [
      text({ text: 'hello', font: '14px monospace', lineHeight: 18, color: '#ffffff' }),
    ])
    const layout = {
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      children: [{ x: 0, y: 0, width: 80, height: 20, children: [] }],
    }

    renderer.render(layout as any, tree)
    const ansi = output.toString()

    expect(ansi).toContain('\x1b[2J\x1b[H')
    expect(ansi).toContain('hello')
  })

  it('matches golden output for z-index, clipping, and overflow behavior', () => {
    const output = new MemoryStream()
    const renderer = new TerminalRenderer({
      width: 30,
      height: 6,
      output: output as unknown as NodeJS.WritableStream,
    })
    const tree = box({ backgroundColor: '#111111', overflow: 'hidden' }, [
      box({ backgroundColor: '#222222', zIndex: 0 }, [
        text({ text: 'low-layer', font: '14px monospace', lineHeight: 18, color: '#ffffff' }),
      ]),
      box({ backgroundColor: '#333333', zIndex: 2 }, [
        text({ text: 'HIGH', font: '14px monospace', lineHeight: 18, color: '#ffffff' }),
      ]),
    ])
    const layout = {
      x: 0, y: 0, width: 200, height: 80,
      children: [
        { x: 0, y: 0, width: 100, height: 40, children: [{ x: 0, y: 0, width: 70, height: 20, children: [] }] },
        { x: 20, y: 0, width: 100, height: 40, children: [{ x: 0, y: 0, width: 60, height: 20, children: [] }] },
      ],
    }
    renderer.render(layout as any, tree)
    const ansi = output.toString()
    const plain = ansi
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      .replace(/[^\x20-\x7E\n]/g, '')
      .trim()

    const fixture = readFileSync(new URL('./fixtures/zindex-clipping-overflow.txt', import.meta.url), 'utf8').trim()
    expect(plain.includes(fixture)).toBe(true)
  })
})
