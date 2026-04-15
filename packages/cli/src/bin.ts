#!/usr/bin/env node
import { viewInTerminal } from './viewer.js'
import { TerminalCompositor } from './compositor.js'
import { dumpPage } from './text-dump.js'
import { parseHttpPageUrl } from './page-url.js'

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
const positional = args.filter(a => !a.startsWith('--'))
const url = positional[0]

const textMode = flags.has('--text')
const jsonMode = flags.has('--json')

if (!url) {
  console.error('Usage: geometra <url|host> [--text] [--json]')
  console.error('')
  console.error('  View any Geometra-powered site in the terminal.')
  console.error('  HTTPS is assumed when the scheme is omitted (e.g. example.com or localhost:5173).')
  console.error('')
  console.error('Options:')
  console.error('  --text   Output page content as plain text (pipeable to Claude Code)')
  console.error('  --json   Output raw UI tree + layout as JSON')
  console.error('')
  console.error('Examples:')
  console.error('  geometra https://artemis-two.razroo.com/')
  console.error('  geometra artemis-two.razroo.com/')
  console.error('  geometra https://artemis-two.razroo.com/ --text')
  console.error('  geometra https://artemis-two.razroo.com/ --json')
  console.error('  geometra https://artemis-two.razroo.com/ --text | claude')
  console.error('  geometra ws://localhost:8080/geometra-ws')
  process.exit(1)
}

// Direct WebSocket URL — single view
if (url.startsWith('ws://') || url.startsWith('wss://')) {
  if (textMode || jsonMode) {
    dumpPage([url], textMode ? 'text' : 'json').then(() => process.exit(0))
  } else {
    const viewer = viewInTerminal({ url })
    process.on('SIGINT', () => { viewer.close(); process.exit(0) })
    process.on('SIGTERM', () => { viewer.close(); process.exit(0) })
  }
} else {
  ;(async () => {
    const parsed = parseHttpPageUrl(url)
    const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    const baseWs = `${wsProto}//${parsed.host}`
    const baseHttp = `${parsed.protocol}//${parsed.host}`

    if (!textMode && !jsonMode) {
      process.stderr.write(`Discovering Geometra views at ${parsed.host}...\n`)
    }

    // Discover WebSocket paths
    const paths = new Set<string>()
    let m: RegExpExecArray | null

    try {
      const res = await fetch(url)
      const html = await res.text()

      const wsPathRe = /(\/geometra-ws(?:-[a-z]+)*)/g
      while ((m = wsPathRe.exec(html)) !== null) paths.add(m[1]!)

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
      process.stderr.write('Could not fetch page HTML.\n')
    }

    if (paths.size === 0) paths.add('/geometra-ws')

    // For --text/--json, use ALL views to get complete content
    // For terminal rendering, skip HUD and console panel
    let viewPaths: string[]
    if (textMode || jsonMode) {
      viewPaths = [...paths].sort((a, b) => {
        const order = (p: string) =>
          p.includes('header') ? 0 :
          p === '/geometra-ws' ? 1 :
          p.includes('hud') ? 2 :
          p.includes('below') ? 3 : 4
        return order(a) - order(b)
      })
    } else {
      const terminal = [...paths].filter(p => p.includes('header') || p.includes('below'))
      viewPaths = terminal.length > 0 ? terminal : [[...paths][0] ?? '/geometra-ws']
      viewPaths.sort((a, b) => {
        const order = (p: string) => p.includes('header') ? 0 : p.includes('below') ? 1 : 2
        return order(a) - order(b)
      })
    }

    const wsUrls = viewPaths.map(p => `${baseWs}${p}`)

    if (textMode || jsonMode) {
      await dumpPage(wsUrls, textMode ? 'text' : 'json')
      process.exit(0)
    }

    process.stderr.write(`Found ${viewPaths.length} view(s): ${viewPaths.join(', ')}\n`)
    const compositor = new TerminalCompositor(wsUrls)
    compositor.start()

    process.on('SIGINT', () => { compositor.close(); process.exit(0) })
    process.on('SIGTERM', () => { compositor.close(); process.exit(0) })
  })()
}
