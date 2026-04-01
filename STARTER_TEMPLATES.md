# Starter templates

Use the scaffold generator to turn the repo starters into a runnable standalone app:

```bash
npm run create:app -- ./my-geometra-app
```

That command defaults to the `full-stack-dashboard` template, which is now the recommended entry point for new Geometra apps.

Other templates:

- `npm run create:app -- ./my-canvas-app --template canvas-local`
- `npm run create:app -- ./my-thin-client --template server-client`
- `npm run create:app -- ./my-terminal-app --template terminal`

Template source files still live in the repo for reference:

- `starters/canvas-local/app.ts`
- `starters/full-stack-dashboard/server.ts`
- `starters/full-stack-dashboard/client.ts`
- `starters/server-client/server.ts`
- `starters/server-client/client.ts`
- `starters/terminal/app.ts`

Generated browser templates include their own `index.html`, `package.json`, and `tsconfig.json`, so they are runnable without extra shell wiring.
