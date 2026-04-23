# Geometra

The geometry protocol for UI. Server-computed `{ x, y, w, h }` — not component descriptions — streamed to humans and AI agents over the same socket. Pipeline: `Tree → Yoga WASM → Geometry → Render Target`.

See **`ROADMAP.md`** for phased framework goals (a11y, text input, protocol, etc.).
See **`FRAMEWORK_NORTH_STAR.md`** for the always-on coding priorities and quality bar.
See **`FONTS_AND_METRICS.md`** for `font` strings, `waitForFonts`, and server/client text metric parity.
See **`INTEGRATION_COOKBOOK.md`** for canvas, server/client, and DOM-free migration notes.
See **`PLATFORM_AUTH.md`** for `@geometra/auth`, `@geometra/token-registry`, and the WebSocket auth contract.
See **`PROTOCOL_EVOLUTION.md`** for server/client protocol versioning beyond GEOM v1.
See **`GEOMETRY_SNAPSHOT_TESTING.md`** for layout JSON / geometry regression patterns in CI.
See **`DEPLOYMENT.md`** for production deployment: process management, reverse proxy, auth, scaling, monitoring.
See **`NATIVE_MCP_GUIDE.md`** for building native Geometra apps that AI agents drive via MCP.
See **`MCP_COOKBOOK.md`** for MCP tool call recipes (proxy and native workflows).

## Architecture

- **`packages/textura`** — DOM-free layout engine combining Yoga WASM flexbox with Pretext text measurement. `computeLayout()` takes a declarative tree and returns computed positions. Published to npm as `textura`.
- **`packages/core`** — Signals reactivity, `box()`/`text()`/`image()`/`scene3d()` element constructors, hit-testing, text selection, SEO, `createApp()` (optional `Renderer.setFrameTimings` for layout ms), `waitForFonts`, font helpers. `scene3d()` carries declarative 3D object descriptors (`sphere`, `points`, `line`, `ring`, `ambientLight`, `directionalLight`, `group`) as plain JSON for WebSocket streaming.
- **`packages/renderer-canvas`** — Canvas2D paint backend with text selection highlight rendering, optional layout debug overlay and focus ring
- **`packages/renderer-terminal`** — ANSI terminal renderer
- **`packages/renderer-three`** — Three.js render hosts (`createThreeGeometraSplitHost`, `createThreeGeometraStackedHost`), `Scene3dManager` for reconciling `scene3d` element descriptors into a live Three.js scene graph, WebGL sizing utilities, layout sync
- **`packages/renderer-pdf`** — PDF 1.4 renderer; `PDFRenderer.generate()` returns `Uint8Array` from computed geometry (base-14 fonts, solid boxes, text)
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

1. Bump all 16 publishable packages atomically: `node scripts/release/bump-version.mjs <old> <new>` (refuses to proceed if any package has drifted from `<old>`).
2. Verify the bump: `node scripts/release/check-source.mjs <new>`.
3. Commit + push to `main` (`chore(release): vX.Y.Z — <summary>`).
4. Wait for the `quality` check-run on that commit to go green.
5. `gh release create vX.Y.Z --title "..." --notes "..."`.
6. `.github/workflows/release.yml` triggers on `release: published`, waits for quality to succeed, re-verifies source versions, builds in workspace order, normalizes publish-time `^x.y.z` deps, and publishes all 16 packages to npm with provenance (uses `NPM_TOKEN`).

**Do not run `npm publish` manually. Do not hand-edit individual `package.json` versions.** `bump-version.mjs` is the single source of truth for lockstep version bumps — it's the only thing that keeps `check-source.mjs` and `release.yml`'s `PUBLISH_PACKAGES` list in sync.

## CI Workflows

- **`release.yml`** — Triggered by GitHub release. Builds and publishes all `@geometra/*` packages to npm with provenance.
- **`demo.yml`** — Triggered by push to `main`. Builds demo site and deploys to GitHub Pages.

## Code Conventions

- All packages use ESM (`"type": "module"`)
- Strict TypeScript with `.js` extensions in imports
- Style props (backgroundColor, color, etc.) are stripped in `toLayoutTree()` — only layout props go to Yoga
- Rendering-only props (like `selectable`) must also be stripped in `toLayoutTree()`
- Element constructors (`box()`, `text()`, `scene3d()`) extract non-layout concerns (handlers, semantic, key) before building the element
- `scene3d()` is a layout leaf (like `image()`) — its 3D-specific props (`objects`, `background`, `fov`, `cameraPosition`, etc.) are stripped in `toLayoutTree()`
- When adding a new element kind: update `types.ts` (interface + union), `elements.ts` (constructor), `tree.ts` (strip + leaf/container), `index.ts` (exports), then handle in `fonts.ts`, `a11y.ts`, `seo.ts`, and all renderer `paintNode` methods
