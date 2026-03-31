# @geometra/router

Routing primitives for Geometra.

Current scope (foundation): route matching and nested branch composition utilities.

## Install

```bash
npm install @geometra/router
```

## Key Exports

- `matchPath` -- matches path patterns with static, dynamic, optional, and splat segments
- `buildPath` -- reverse routing helper with typed params
- `scorePathPattern` -- computes route specificity score for deterministic ranking
- `comparePatternSpecificity` -- compares two patterns by ranking
- `matchRouteTree` -- matches nested route trees with layout routes
- `renderMatchedOutlet` -- composes matched branch render output from leaf to root

## Usage

```ts
import { matchPath } from '@geometra/router'

const match = matchPath('/users/:id?', '/users/42')
// { params: { id: '42' } }
```
