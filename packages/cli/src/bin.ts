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

// Resolve WebSocket URL from input
let wsUrl: string

if (url.startsWith('ws://') || url.startsWith('wss://')) {
  // Direct WebSocket URL
  wsUrl = url
} else {
  // HTTP(S) URL — derive WebSocket endpoint
  const parsed = new URL(url)
  const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  // Default Geometra WS path
  wsUrl = `${wsProto}//${parsed.host}/geometra-ws`
}

console.error(`Connecting to ${wsUrl}...`)

const viewer = viewInTerminal({ url: wsUrl })

// Clean exit on Ctrl+C
process.on('SIGINT', () => {
  viewer.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  viewer.close()
  process.exit(0)
})
