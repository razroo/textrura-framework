#!/usr/bin/env node
import { viewInTerminal } from './viewer.js'
import { TerminalCompositor } from './compositor.js'

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
  // HTTP(S) URL — discover all Geometra WebSocket endpoints and composite
  ;(async () => {
    const parsed = new URL(url)
    const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    const baseWs = `${wsProto}//${parsed.host}`
    const baseHttp = `${parsed.protocol}//${parsed.host}`

    console.error(`Discovering Geometra views at ${parsed.host}...`)

    const paths = new Set<string>()
    let m: RegExpExecArray | null

    try {
      const res = await fetch(url)
      const html = await res.text()

      // Scan HTML for WS paths
      const wsPathRe = /(\/geometra-ws(?:-[a-z]+)*)/g
      while ((m = wsPathRe.exec(html)) !== null) paths.add(m[1]!)

      // Fetch and scan JS bundles
      const scriptRe = /src=["']([^"']+\.js)["']/g
      const scriptUrls: string[] = []
      while ((m = scriptRe.exec(html)) !== null) {
        const src = m[1]!
        scriptUrls.push(src.startsWith('http') ? src : `${baseHttp}${src.startsWith('/') ? '' : '/'}${src}`)
      }

      for (const jsUrl of scriptUrls) {
        try {
          const jsRes = await fetch(jsUrl)
          const js = await jsRes.text()
          const jsWsRe = /(\/geometra-ws(?:-[a-z]+)*)/g
          while ((m = jsWsRe.exec(js)) !== null) paths.add(m[1]!)
        } catch { /* skip */ }
      }
    } catch {
      console.error('Could not fetch page HTML.')
    }

    if (paths.size === 0) paths.add('/geometra-ws')

    // Sort: header → main → hud → below
    const sorted = [...paths].sort((a, b) => {
      const order = (p: string) =>
        p.includes('header') ? 0 :
        p === '/geometra-ws' ? 1 :
        p.includes('hud') ? 2 :
        p.includes('below') ? 3 : 4
      return order(a) - order(b)
    })

    const wsUrls = sorted.map(p => `${baseWs}${p}`)
    console.error(`Found ${sorted.length} view(s): ${sorted.join(', ')}`)

    const compositor = new TerminalCompositor(wsUrls)
    compositor.start()

    process.on('SIGINT', () => { compositor.close(); process.exit(0) })
    process.on('SIGTERM', () => { compositor.close(); process.exit(0) })
  })()
}
