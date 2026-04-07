import { afterAll, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { connect, disconnect, sendListboxPick } from '../session.js'

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
})
