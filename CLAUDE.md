# Geometra

DOM-free UI framework. Replaces the browser rendering pipeline with: `Tree → Yoga WASM → Geometry → Pixels`.

See **`ROADMAP.md`** for phased framework goals (a11y, text input, protocol, etc.).
See **`FRAMEWORK_NORTH_STAR.md`** for the always-on coding priorities and quality bar.
See **`FONTS_AND_METRICS.md`** for `font` strings, `waitForFonts`, and server/client text metric parity.
See **`INTEGRATION_COOKBOOK.md`** for canvas, server/client, and DOM-free migration notes.
See **`PROTOCOL_EVOLUTION.md`** for server/client protocol versioning beyond GEOM v1.

## Architecture

- **`packages/core`** — Signals reactivity, `box()`/`text()` element constructors, hit-testing, text selection, SEO, `createApp()`, optional `waitForFonts`, font helpers
- **`packages/renderer-canvas`** — Canvas2D paint backend with text selection highlight rendering, optional layout debug overlay and focus ring
- **`packages/renderer-terminal`** — ANSI terminal renderer
- **`packages/server`** — WebSocket server, layout computation, geometry diffing
- **`packages/client`** — Thin WebSocket client (~2KB), receives pre-computed geometry
- **`demo/`** — Main marketing/demo website (Vite, served via GitHub Pages)
- **`demos/`** — Standalone example apps (local-canvas, terminal, server-client)

## Build & Dev

```bash
npm install                                    # install all workspace deps
npm run build                                  # build all packages (tsc)
npx vite --config demo/vite.config.ts          # dev server for demo site
npx vite build --config demo/vite.config.ts    # production build → dist-demo/

# Bun alternatives (preferred for faster installs in CI/local)
bun install
bun run build
bun run demo:build
```

Note: `tsc` builds may show pre-existing module resolution errors (`nodenext`/TypeScript version). The Vite-based demo build works regardless since Vite handles its own resolution.

## Releasing

Releases are done via GitHub Releases, **not** `npm publish` directly.

1. Bump `version` in the relevant `packages/*/package.json` files
2. Commit and push to `main`
3. Create a GitHub release with `gh release create vX.Y.Z --title "..." --notes "..."`
4. The `.github/workflows/release.yml` workflow triggers on `release: published`, builds all packages in dependency order, and publishes to npm using the `NPM_TOKEN` secret

**Do not run `npm publish` manually.** Always go through `gh release create`.

## CI Workflows

- **`release.yml`** — Triggered by GitHub release. Builds and publishes all `@geometra/*` packages to npm with provenance.
- **`demo.yml`** — Triggered by push to `main`. Builds demo site and deploys to GitHub Pages.

## Code Conventions

- All packages use ESM (`"type": "module"`)
- Strict TypeScript with `.js` extensions in imports
- Style props (backgroundColor, color, etc.) are stripped in `toLayoutTree()` — only layout props go to Yoga
- Rendering-only props (like `selectable`) must also be stripped in `toLayoutTree()`
- Element constructors (`box()`, `text()`) extract non-layout concerns (handlers, semantic, key) before building the element
