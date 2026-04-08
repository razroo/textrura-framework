import { describe, it, expect } from 'vitest'
import WebSocket from 'ws'
import { box } from '@geometra/core'
import { createServer } from '../server.js'
import { CLOSE_AUTH_FAILED } from '../protocol.js'

function pickPort(): number {
  return 41000 + Math.floor(Math.random() * 2000)
}

function connectAndCollect(url: string): Promise<{ messages: Array<{ type: string; message?: string; code?: number }>; ws: WebSocket; closeCode?: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const messages: Array<{ type: string; message?: string; code?: number }> = []
    const timeout = setTimeout(() => reject(new Error('timed out')), 5000)

    ws.on('message', (raw) => {
      messages.push(JSON.parse(String(raw)))
    })

    ws.on('close', (code) => {
      clearTimeout(timeout)
      resolve({ messages, ws, closeCode: code })
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

describe('server connection hooks', () => {
  it('onConnection accepts when returning a truthy value', async () => {
    const port = pickPort()
    let receivedCtx: unknown = null
    const server = await createServer(
      () => box({ width: 40, height: 20 }, []),
      {
        port,
        width: 200,
        height: 100,
        onConnection: () => ({ role: 'admin' }),
        onDisconnect: (ctx) => { receivedCtx = ctx },
      },
    )

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      const timeout = setTimeout(() => reject(new Error('timed out')), 5000)

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as { type: string }
        if (msg.type === 'frame') {
          clearTimeout(timeout)
          ws.close()
        }
      })

      ws.on('close', () => {
        setTimeout(resolve, 100)
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    }).finally(() => {
      server.close()
    })

    expect(receivedCtx).toEqual({ role: 'admin' })
  })

  it('onConnection rejects when returning null', async () => {
    const port = pickPort()
    const server = await createServer(
      () => box({ width: 40, height: 20 }, []),
      {
        port,
        width: 200,
        height: 100,
        onConnection: () => null,
      },
    )

    const result = await connectAndCollect(`ws://127.0.0.1:${port}`).finally(() => {
      server.close()
    })

    expect(result.closeCode).toBe(CLOSE_AUTH_FAILED)
    expect(result.messages.filter(m => m.type === 'frame')).toHaveLength(0)
  })

  it('onConnection rejects when returning undefined (same nullish gate as null)', async () => {
    const port = pickPort()
    const server = await createServer(
      () => box({ width: 40, height: 20 }, []),
      {
        port,
        width: 200,
        height: 100,
        onConnection: () => undefined,
      },
    )

    const result = await connectAndCollect(`ws://127.0.0.1:${port}`).finally(() => {
      server.close()
    })

    expect(result.closeCode).toBe(CLOSE_AUTH_FAILED)
    expect(result.messages.filter(m => m.type === 'frame')).toHaveLength(0)
  })

  it('onConnection rejects when throwing', async () => {
    const port = pickPort()
    const server = await createServer(
      () => box({ width: 40, height: 20 }, []),
      {
        port,
        width: 200,
        height: 100,
        onConnection: () => { throw new Error('bad token') },
      },
    )

    const result = await connectAndCollect(`ws://127.0.0.1:${port}`).finally(() => {
      server.close()
    })

    expect(result.closeCode).toBe(CLOSE_AUTH_FAILED)
    expect(result.messages.filter(m => m.type === 'frame')).toHaveLength(0)
  })

  it('onConnection supports async handlers', async () => {
    const port = pickPort()
    const server = await createServer(
      () => box({ width: 40, height: 20 }, []),
      {
        port,
        width: 200,
        height: 100,
        onConnection: async () => {
          await new Promise(r => setTimeout(r, 50))
          return { userId: '42' }
        },
      },
    )

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      const timeout = setTimeout(() => reject(new Error('timed out')), 5000)

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as { type: string }
        if (msg.type === 'frame') {
          clearTimeout(timeout)
          ws.close()
          resolve()
        }
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    }).finally(() => {
      server.close()
    })
  })
})

describe('server message hooks', () => {
  it('onMessage allows events when returning true', async () => {
    const port = pickPort()
    let clickDispatched = false
    const server = await createServer(
      () => box({
        width: 40, height: 20,
        onClick: () => { clickDispatched = true },
      }, []),
      {
        port,
        width: 200,
        height: 100,
        onConnection: () => ({ role: 'operator' }),
        onMessage: (_msg, ctx) => (ctx as { role: string }).role === 'operator',
      },
    )

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      const timeout = setTimeout(() => reject(new Error('timed out')), 5000)

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as { type: string }
        if (msg.type === 'frame') {
          ws.send(JSON.stringify({
            type: 'event', eventType: 'onClick', x: 10, y: 10,
          }))
          setTimeout(() => {
            clearTimeout(timeout)
            ws.close()
            resolve()
          }, 200)
        }
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    }).finally(() => {
      server.close()
    })

    expect(clickDispatched).toBe(true)
  })

  it('onMessage rejects events when returning false', async () => {
    const port = pickPort()
    let clickDispatched = false
    const server = await createServer(
      () => box({
        width: 40, height: 20,
        onClick: () => { clickDispatched = true },
      }, []),
      {
        port,
        width: 200,
        height: 100,
        onConnection: () => ({ role: 'readonly' }),
        onMessage: (_msg, ctx) => (ctx as { role: string }).role !== 'readonly',
      },
    )

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      const timeout = setTimeout(() => reject(new Error('timed out')), 5000)
      let sentEvent = false

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as { type: string; code?: number }
        if (msg.type === 'frame' && !sentEvent) {
          sentEvent = true
          ws.send(JSON.stringify({
            type: 'event', eventType: 'onClick', x: 10, y: 10,
          }))
        }
        if (msg.type === 'error' && msg.code === 4003) {
          clearTimeout(timeout)
          ws.close()
          resolve()
        }
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    }).finally(() => {
      server.close()
    })

    expect(clickDispatched).toBe(false)
  })

  it('rejects invalid pointer coordinates without broadcasting layout, and finite clicks still work', async () => {
    const port = pickPort()
    /** Mutate props on click so serialized tree changes and the server always sends a follow-up frame. */
    const viewState = { bump: 0 }
    const server = await createServer(
      () =>
        box(
          {
            width: 40,
            height: 20 + viewState.bump,
            onClick: () => {
              viewState.bump++
            },
          },
          [],
        ),
      { port, width: 200, height: 100 },
    )

    const messages: Array<{ type: string }> = []

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      const timeout = setTimeout(() => reject(new Error('timed out')), 8000)

      let phase = 0

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as { type: string; message?: string }
        messages.push(msg)

        if (phase === 0 && messages.length === 1 && msg.type === 'frame') {
          phase = 1
          ws.send(
            JSON.stringify({
              type: 'event',
              eventType: 'onClick',
              x: null,
              y: 10,
            }),
          )
          setTimeout(() => {
            try {
              expect(messages).toHaveLength(2)
              expect(messages[1]).toMatchObject({
                type: 'error',
                message: 'Pointer event coordinates must be finite numbers',
              })
            } catch (e) {
              clearTimeout(timeout)
              reject(e)
              return
            }
            ws.send(
              JSON.stringify({
                type: 'event',
                eventType: 'onClick',
                x: 5,
                y: 5,
              }),
            )
          }, 100)
        }

        if (phase === 1 && messages.length === 3) {
          phase = 2
          ws.send(
            JSON.stringify({
              type: 'event',
              eventType: 'onClick',
              x: '5',
              y: 5,
            }),
          )
          setTimeout(() => {
            try {
              expect(messages).toHaveLength(4)
              expect(messages[3]).toMatchObject({
                type: 'error',
                message: 'Pointer event coordinates must be finite numbers',
              })
            } catch (e) {
              clearTimeout(timeout)
              reject(e)
              return
            }
            clearTimeout(timeout)
            ws.close()
            resolve()
          }, 100)
        }
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    }).finally(() => {
      server.close()
    })

    expect(messages).toHaveLength(4)
    expect(messages[0]!.type).toBe('frame')
    expect(messages[1]!.type).toBe('error')
    expect(messages[2]!.type).toBe('frame')
    expect(messages[3]!.type).toBe('error')
  })

  it('works without any hooks (backward-compatible)', async () => {
    const port = pickPort()
    const server = await createServer(
      () => box({ width: 40, height: 20 }, []),
      { port, width: 200, height: 100 },
    )

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      const timeout = setTimeout(() => reject(new Error('timed out')), 5000)

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as { type: string }
        if (msg.type === 'frame') {
          clearTimeout(timeout)
          ws.close()
          resolve()
        }
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    }).finally(() => {
      server.close()
    })
  })

  it('ignores invalid layoutDirection (Symbol) and derives Yoga direction from the root like createApp', async () => {
    const port = pickPort()
    const server = await createServer(
      () =>
        box({ width: 100, height: 40, flexDirection: 'row', dir: 'rtl' }, [
          box({ width: 30, height: 20 }),
          box({ width: 30, height: 20 }),
        ]),
      {
        port,
        width: 200,
        height: 100,
        layoutDirection: Symbol('bad') as never,
      },
    )

    const layout = await new Promise<{ children: Array<{ x: number }> }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`)
      const timeout = setTimeout(() => reject(new Error('timed out')), 5000)

      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as {
          type: string
          layout?: { children: Array<{ x: number }> }
        }
        if (msg.type === 'frame' && msg.layout?.children?.length === 2) {
          clearTimeout(timeout)
          ws.close()
          resolve(msg.layout)
        }
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    }).finally(() => {
      server.close()
    })

    const [a, b] = layout.children
    expect(a!.x).toBeGreaterThan(b!.x)
  })
})
