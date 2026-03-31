# @geometra/router

Routing primitives for Geometra.

Current scope (foundation): route matching utilities.

## Install

```bash
npm install @geometra/router
```

## Key Exports

- `matchPath` -- matches path patterns with static, dynamic, optional, and splat segments

## Usage

```ts
import { matchPath } from '@geometra/router'

const match = matchPath('/users/:id?', '/users/42')
// { params: { id: '42' } }
```
