import { afterAll, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { connect, disconnect, sendClick, sendFillFields, sendListboxPick } from '../session.js'

describe('proxy-backed MCP actions', () => {
  afterAll(() => {
    disconnect()
  })

  it('waits for final listbox outcome instead of resolving on intermediate updates', async () => {
    const wss = new WebSocketServer({ port: 0 })
    wss.on('connection', ws => {
      ws.on('message', raw => {
        const msg = JSON.parse(String(raw)) as {
          type?: string
          requestId?: string
        }

        if (msg.type === 'resize') {
          ws.send(JSON.stringify({
            type: 'frame',
            layout: { x: 0, y: 0, width: 1024, height: 768, children: [] },
            tree: { kind: 'box', props: {}, semantic: { tag: 'body', role: 'group' }, children: [] },
          }))
          return
        }

        if (msg.type === 'listboxPick') {
          ws.send(JSON.stringify({
            type: 'frame',
            layout: { x: 0, y: 0, width: 1024, height: 768, children: [] },
            tree: { kind: 'box', props: {}, semantic: { tag: 'body', role: 'group' }, children: [] },
          }))
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'error',
              requestId: msg.requestId,
              message: 'listboxPick: no visible option matching \"Japan\"',
            }))
          }, 20)
        }
      })
    })
    const port = await new Promise<number>((resolve, reject) => {
      wss.once('listening', () => {
        const address = wss.address()
        if (typeof address === 'object' && address) resolve(address.port)
        else reject(new Error('Failed to resolve ephemeral WebSocket port'))
      })
      wss.once('error', reject)
    })

    try {
      const session = await connect(`ws://127.0.0.1:${port}`)

      await expect(
        sendListboxPick(session, 'Japan', {
          fieldLabel: 'Country',
          exact: true,
        }),
      ).rejects.toThrow('listboxPick: no visible option matching "Japan"')
    } finally {
      disconnect()
      await new Promise<void>((resolve, reject) => wss.close(err => (err ? reject(err) : resolve())))
    }
  })

  it('falls back to the latest observed update when a legacy peer does not send request-scoped ack', async () => {
    const wss = new WebSocketServer({ port: 0 })
    wss.on('connection', ws => {
      ws.on('message', raw => {
        const msg = JSON.parse(String(raw)) as { type?: string }

        if (msg.type === 'resize') {
          ws.send(JSON.stringify({
            type: 'frame',
            layout: { x: 0, y: 0, width: 1024, height: 768, children: [] },
            tree: { kind: 'box', props: {}, semantic: { tag: 'body', role: 'group' }, children: [] },
          }))
          return
        }

        if (msg.type === 'event') {
          ws.send(JSON.stringify({
            type: 'frame',
            layout: { x: 0, y: 0, width: 1024, height: 768, children: [] },
            tree: { kind: 'box', props: {}, semantic: { tag: 'body', role: 'group', ariaLabel: 'Updated' }, children: [] },
          }))
        }
      })
    })
    const port = await new Promise<number>((resolve, reject) => {
      wss.once('listening', () => {
        const address = wss.address()
        if (typeof address === 'object' && address) resolve(address.port)
        else reject(new Error('Failed to resolve ephemeral WebSocket port'))
      })
      wss.once('error', reject)
    })

    try {
      const session = await connect(`ws://127.0.0.1:${port}`)
      await expect(sendClick(session, 5, 5, 60)).resolves.toMatchObject({ status: 'updated', timeoutMs: 60 })
    } finally {
      disconnect()
      await new Promise<void>((resolve, reject) => wss.close(err => (err ? reject(err) : resolve())))
    }
  })

  it('sends batched fillFields messages and resolves from the resulting update', async () => {
    const wss = new WebSocketServer({ port: 0 })
    let seenMessage: { type?: string; fields?: unknown[] } | undefined
    wss.on('connection', ws => {
      ws.on('message', raw => {
        const msg = JSON.parse(String(raw)) as { type?: string; fields?: unknown[]; requestId?: string }

        if (msg.type === 'resize') {
          ws.send(JSON.stringify({
            type: 'frame',
            layout: { x: 0, y: 0, width: 1024, height: 768, children: [] },
            tree: { kind: 'box', props: {}, semantic: { tag: 'body', role: 'group' }, children: [] },
          }))
          return
        }

        if (msg.type === 'fillFields') {
          seenMessage = msg
          ws.send(JSON.stringify({
            type: 'ack',
            requestId: msg.requestId,
            result: {
              pageUrl: 'https://jobs.example.com/application',
              invalidCount: 0,
              alertCount: 0,
              dialogCount: 0,
              busyCount: 0,
            },
          }))
          ws.send(JSON.stringify({
            type: 'frame',
            layout: { x: 0, y: 0, width: 1024, height: 768, children: [] },
            tree: {
              kind: 'box',
              props: {},
              semantic: { tag: 'body', role: 'group', ariaLabel: 'Filled' },
              children: [],
            },
          }))
        }
      })
    })
    const port = await new Promise<number>((resolve, reject) => {
      wss.once('listening', () => {
        const address = wss.address()
        if (typeof address === 'object' && address) resolve(address.port)
        else reject(new Error('Failed to resolve ephemeral WebSocket port'))
      })
      wss.once('error', reject)
    })

    try {
      const session = await connect(`ws://127.0.0.1:${port}`)
      await expect(
        sendFillFields(session, [
          { kind: 'text', fieldLabel: 'Full name', value: 'Taylor Applicant' },
          { kind: 'choice', fieldLabel: 'Country', value: 'Germany' },
        ], 80),
      ).resolves.toMatchObject({
        status: 'acknowledged',
        timeoutMs: 80,
        result: {
          pageUrl: 'https://jobs.example.com/application',
          invalidCount: 0,
          alertCount: 0,
        },
      })
      expect(seenMessage).toMatchObject({
        type: 'fillFields',
        fields: [
          { kind: 'text', fieldLabel: 'Full name', value: 'Taylor Applicant' },
          { kind: 'choice', fieldLabel: 'Country', value: 'Germany' },
        ],
      })
    } finally {
      disconnect()
      await new Promise<void>((resolve, reject) => wss.close(err => (err ? reject(err) : resolve())))
    }
  })

  it('ignores invalid patch paths instead of mutating ancestor layout nodes', async () => {
    const wss = new WebSocketServer({ port: 0 })
    wss.on('connection', ws => {
      ws.on('message', raw => {
        const msg = JSON.parse(String(raw)) as { type?: string }

        if (msg.type === 'resize') {
          ws.send(JSON.stringify({
            type: 'frame',
            layout: {
              x: 0,
              y: 0,
              width: 200,
              height: 100,
              children: [{ x: 10, y: 20, width: 30, height: 40, children: [] }],
            },
            tree: {
              kind: 'box',
              props: {},
              semantic: { tag: 'body', role: 'group' },
              children: [{ kind: 'box', props: {}, semantic: { tag: 'div', role: 'group' }, children: [] }],
            },
          }))
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'patch',
              patches: [{ path: [9], x: 999, y: 999 }],
            }))
          }, 10)
        }
      })
    })
    const port = await new Promise<number>((resolve, reject) => {
      wss.once('listening', () => {
        const address = wss.address()
        if (typeof address === 'object' && address) resolve(address.port)
        else reject(new Error('Failed to resolve ephemeral WebSocket port'))
      })
      wss.once('error', reject)
    })

    try {
      const session = await connect(`ws://127.0.0.1:${port}`)
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(session.layout).toMatchObject({
        x: 0,
        y: 0,
        children: [{ x: 10, y: 20 }],
      })
    } finally {
      disconnect()
      await new Promise<void>((resolve, reject) => wss.close(err => (err ? reject(err) : resolve())))
    }
  })
})
