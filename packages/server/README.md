# @geometra/server

Server-side layout engine with WebSocket streaming for Geometra. Computes layouts on the server and streams them to thin clients.

## Install

```bash
npm install @geometra/server
```

## Key Export

- `createServer` -- creates a Geometra layout server with WebSocket support

## Usage

```ts
import { createServer } from '@geometra/server'

const server = createServer({ port: 3000 })

server.onConnection((client) => {
  client.render(tree)
})
```

## Links

- [Main repo](https://github.com/AiGeekz/geometra)
