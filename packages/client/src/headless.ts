import { createClient, type TexturaClient, type TexturaClientOptions } from './client.js'
import { createNoopRenderer } from './noop-renderer.js'

export type HeadlessClientOptions = Omit<TexturaClientOptions, 'renderer'>

/**
 * WebSocket client with a no-op renderer: receives `frame` / `patch` / `data` / `error` on the wire
 * without painting. Use `onData` for JSON side-channels and/or inspect {@link TexturaClient.layout}
 * after frames.
 */
export function createHeadlessClient(options: HeadlessClientOptions): TexturaClient {
  return createClient({
    ...options,
    renderer: createNoopRenderer(),
  })
}
