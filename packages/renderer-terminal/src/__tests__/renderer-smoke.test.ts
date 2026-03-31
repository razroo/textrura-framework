import { describe, it, expect } from 'vitest'
import { TerminalRenderer } from '../renderer.js'
import { box, text } from '@geometra/core'

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
})
