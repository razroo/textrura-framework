#!/usr/bin/env node
import { viewInTerminal } from './viewer.js'

const url = process.argv[2]

if (!url) {
  console.error('Usage: geometra <url>')
  console.error('')
  console.error('  View any Geometra-powered site in the terminal.')
  console.error('')
  console.error('Examples:')
  console.error('  geometra https://artemis-two.razroo.com/')
  console.error('  geometra http://localhost:5173/')
  console.error('  geometra ws://localhost:8080/geometra-ws')
  process.exit(1)
}

// Direct WebSocket URL — single view
if (url.startsWith('ws://') || url.startsWith('wss://')) {
  console.error(`Connecting to ${url}...`)
  const viewer = viewInTerminal({ url })
  process.on('SIGINT', () => { viewer.close(); process.exit(0) })
  process.on('SIGTERM', () => { viewer.close(); process.exit(0) })
} else {
  // HTTP(S) URL — discover all Geometra WebSocket endpoints from the page HTML
  ;(async () => {
    const parsed = new URL(url)
    const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    const baseWs = `${wsProto}//${parsed.host}`

    console.error(`Fetching ${url} to discover Geometra endpoints...`)

    try {
      const res = await fetch(url)
      const html = await res.text()

      // Find all geometra-ws paths in the HTML/JS source
      const wsPathRegex = /["'`](\/geometra-ws[^"'`]*?)["'`]/g
      const paths = new Set<string>()
      let match: RegExpExecArray | null
      while ((match = wsPathRegex.exec(html)) !== null) {
        paths.add(match[1]!)
      }

      // Fallback to default path
      if (paths.size === 0) {
        paths.add('/geometra-ws')
      }

      // Sort: header first, then main, then hud, then below
      const sorted = [...paths].sort((a, b) => {
        const order = (p: string) =>
          p.includes('header') ? 0 :
          p === '/geometra-ws' ? 1 :
          p.includes('hud') ? 2 :
          p.includes('below') ? 3 : 4
        return order(a) - order(b)
      })

      console.error(`Found ${sorted.length} Geometra view(s): ${sorted.join(', ')}`)

      const viewers = sorted.map(path => viewInTerminal({
        url: `${baseWs}${path}`,
        // Stack views vertically — divide terminal rows among views
        height: Math.max(6, Math.floor((process.stdout.rows || 24) / sorted.length)),
      }))

      process.on('SIGINT', () => { viewers.forEach(v => v.close()); process.exit(0) })
      process.on('SIGTERM', () => { viewers.forEach(v => v.close()); process.exit(0) })
    } catch (err) {
      // If fetch fails, fall back to default WS path
      console.error(`Could not fetch page, trying default /geometra-ws...`)
      const viewer = viewInTerminal({ url: `${baseWs}/geometra-ws` })
      process.on('SIGINT', () => { viewer.close(); process.exit(0) })
      process.on('SIGTERM', () => { viewer.close(); process.exit(0) })
    }
  })()
}
