import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AgentGatewayReplay } from '@geometra/core'

export interface AgentGatewayReplayStore {
  save(replay: AgentGatewayReplay): Promise<void>
  load(sessionId: string): Promise<AgentGatewayReplay | null>
}

export class MemoryAgentGatewayReplayStore implements AgentGatewayReplayStore {
  private readonly replays = new Map<string, AgentGatewayReplay>()

  async save(replay: AgentGatewayReplay): Promise<void> {
    this.replays.set(replay.sessionId, replay)
  }

  async load(sessionId: string): Promise<AgentGatewayReplay | null> {
    return this.replays.get(sessionId) ?? null
  }
}

export interface FileAgentGatewayReplayStoreOptions {
  directory: string
}

function safeReplayFile(directory: string, sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_.-]/g, '_')
  return path.join(directory, `${safeId}.json`)
}

export class FileAgentGatewayReplayStore implements AgentGatewayReplayStore {
  private readonly directory: string

  constructor(options: FileAgentGatewayReplayStoreOptions) {
    this.directory = options.directory
  }

  async save(replay: AgentGatewayReplay): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    await writeFile(safeReplayFile(this.directory, replay.sessionId), `${JSON.stringify(replay, null, 2)}\n`, 'utf8')
  }

  async load(sessionId: string): Promise<AgentGatewayReplay | null> {
    try {
      const text = await readFile(safeReplayFile(this.directory, sessionId), 'utf8')
      return JSON.parse(text) as AgentGatewayReplay
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }
}
