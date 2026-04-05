import type { ComputedLayout } from 'textura'
import type { UIElement } from '@geometra/core'
import WebSocket from 'ws'

/**
 * Connect to Geometra WebSocket endpoints, receive one frame from each,
 * and output the page content as plain text or JSON.
 */
export async function dumpPage(
  urls: string[],
  mode: 'text' | 'json',
): Promise<void> {
  const frames = await Promise.all(urls.map(url => fetchOneFrame(url)))

  if (mode === 'json') {
    const output = frames.map(f => ({
      url: f.url,
      layout: f.layout,
      tree: f.tree,
    }))
    process.stdout.write(JSON.stringify(output, null, 2) + '\n')
  } else {
    // Plain text — extract all text content in reading order
    for (const frame of frames) {
      if (frame.tree && frame.layout) {
        const lines = extractText(frame.tree, frame.layout)
        for (const line of lines) {
          if (line.trim()) process.stdout.write(line + '\n')
        }
      }
    }
  }
}

interface Frame {
  url: string
  layout: ComputedLayout | null
  tree: UIElement | null
}

function fetchOneFrame(url: string): Promise<Frame> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    const timeout = setTimeout(() => {
      ws.close()
      resolve({ url, layout: null, tree: null })
    }, 10000)

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'frame') {
          clearTimeout(timeout)
          ws.close()
          resolve({ url, layout: msg.layout, tree: msg.tree })
        }
      } catch { /* ignore */ }
    })

    ws.on('error', () => {
      clearTimeout(timeout)
      resolve({ url, layout: null, tree: null })
    })
  })
}

interface TextLine {
  y: number
  x: number
  text: string
}

function extractText(tree: UIElement, layout: ComputedLayout): string[] {
  const textLines: TextLine[] = []
  collectText(tree, layout, 0, 0, textLines)

  // Sort by y position then x
  textLines.sort((a, b) => a.y - b.y || a.x - b.x)

  // Group lines by approximate y position (within 5px = same line)
  const grouped: string[] = []
  let currentY = -999
  let currentLine = ''

  for (const tl of textLines) {
    if (Math.abs(tl.y - currentY) > 5) {
      if (currentLine.trim()) grouped.push(currentLine.trimEnd())
      currentLine = ''
      currentY = tl.y
    }
    // Add spacing between items on the same line
    if (currentLine.length > 0) currentLine += '  '
    currentLine += tl.text
  }
  if (currentLine.trim()) grouped.push(currentLine.trimEnd())

  return grouped
}

function collectText(
  element: UIElement,
  layout: ComputedLayout,
  offsetX: number,
  offsetY: number,
  out: TextLine[],
): void {
  const absX = offsetX + layout.x
  const absY = offsetY + layout.y

  if (element.kind === 'box') {
    const childOffsetX = absX
    const childOffsetY = absY
    for (let i = 0; i < element.children.length; i++) {
      const childLayout = layout.children[i]
      if (childLayout) {
        collectText(element.children[i]!, childLayout, childOffsetX, childOffsetY, out)
      }
    }
  } else if (element.kind !== 'scene3d' && element.kind !== 'image') {
    const text = (element.props as unknown as { text?: string }).text ?? ''
    if (text.trim()) {
      out.push({ y: absY, x: absX, text: text.trim() })
    }
  }
}
