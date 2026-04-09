# MCP Benchmark Comparison: Geometra vs Playwright

Token usage and round-trip comparisons for AI agent automation tasks.

## Methodology

These are **estimated token counts** based on typical response payload sizes for a 20-field job application form (e.g., a Greenhouse or Lever careers page with text inputs, dropdowns, checkboxes, and a file upload).

Token estimates use the standard approximation of **~4 characters per token**. Payload sizes are derived from the actual data structures in Geometra MCP (`PageModel`, `FormSchemaField`, `CompactUiNode`, `FormSchemaModel`) and typical Playwright MCP responses (base64 screenshots, accessibility snapshots, DOM query results).

All comparisons assume a single connected session. Geometra MCP numbers reflect the `@geometra/proxy` path (Chromium-backed, comparable target to Playwright).

---

## Scenario: Fill a 20-Field Job Application

A typical job application with:
- 12 text fields (name, email, phone, address, LinkedIn, etc.)
- 4 dropdown/select fields (country, state, how did you hear, work authorization)
- 2 checkbox/toggle fields (terms agreement, optional newsletter)
- 1 file upload (resume PDF)
- 1 textarea (cover letter / additional info)

---

### 1. Page Discovery

Understanding the page structure before acting.

| Approach | Payload | Estimated Tokens |
|----------|---------|-----------------|
| **Playwright: screenshot** | ~85 KB base64-encoded PNG (1280x800 viewport) | **~28,000** |
| **Playwright: accessibility snapshot** | Nested a11y tree, ~16 KB for a typical form page | **~4,000** |
| **Geometra: `geometra_page_model`** | `PageModel` JSON: viewport, archetypes, landmarks, forms summary, primaryActions. ~1,600 chars for a single-form page | **~400** |
| **Geometra: `geometra_snapshot` (compact)** | Flat `CompactUiNode[]` list: id, role, name, value, bounds per node. ~3,200 chars for 40 visible nodes | **~800** |

**Geometra advantage: 5-70x fewer tokens** depending on Playwright mode.

---

### 2. Form Schema Discovery

Identifying all fields, their types, required status, and available options before filling.

| Approach | Detail | Estimated Tokens |
|----------|--------|-----------------|
| **Playwright** | Agent must parse the a11y tree or issue DOM queries to discover field labels, types, and options. Typically 2-3 tool calls of back-and-forth to build a mental model. ~8 KB of responses. | **~2,000** |
| **Geometra: `geometra_form_schema`** | Returns `FormSchemaModel` with structured `FormSchemaField[]`: each field has `id`, `kind` (text/choice/toggle), `label`, `required`, `choiceType`, `options[]`, `format` (placeholder, pattern, inputType, autocomplete), `context`, and `value`. ~2,400 chars for 20 fields. | **~600** |

**Geometra advantage: ~3x fewer tokens, zero ambiguity.** The agent receives machine-readable field metadata instead of inferring structure from raw DOM or a11y output.

---

### 3. Filling 20 Fields

The core form-filling operation.

| Approach | Detail | Estimated Tokens |
|----------|--------|-----------------|
| **Playwright** | 20 separate tool calls. Each: click target (~200 tokens request with selector/coordinates) + type/select value (~100 tokens response with confirmation). Total: 20 x 300. | **~6,000** |
| **Geometra: `geometra_fill_form`** | 1 tool call. Request: `valuesByLabel` or `valuesById` map with all 20 field values (~400 tokens). Response: summary with `successCount`, `errorCount`, form schema diff (~300 tokens). | **~700** |

**Geometra advantage: ~8.5x fewer tokens.**

---

### 4. Verification

Confirming fields were filled correctly (autocomplete rewrites, format transforms, etc.).

| Approach | Detail | Estimated Tokens |
|----------|--------|-----------------|
| **Playwright** | 20 separate DOM queries to read back field values. Each query ~100 tokens request + ~100 tokens response. | **~4,000** |
| **Geometra: `verifyFills: true`** | Add one boolean flag to the `geometra_fill_form` call. Response includes a `verification` array with per-field `expected` vs `actual` and `match` boolean. ~200 additional tokens in the single response. | **~200** |

**Geometra advantage: ~20x fewer tokens.**

---

### 5. Custom Dropdown (e.g., React Select, Headless UI)

Selecting "United States" from a custom searchable country dropdown.

| Approach | Detail | Estimated Tokens |
|----------|--------|-----------------|
| **Playwright** | 4 tool calls: (1) click to open dropdown ~200 tokens, (2) wait for listbox to appear ~150 tokens, (3) scan options via a11y/DOM ~300 tokens, (4) click matching option ~150 tokens. | **~800** |
| **Geometra: `geometra_pick_listbox_option`** | 1 tool call: `fieldLabel` + `label` (or `query` for search). ~100 tokens request + ~100 tokens response. | **~200** |

**Geometra advantage: ~4x fewer tokens.**

---

### 6. File Upload

Attaching a resume PDF.

| Approach | Detail | Estimated Tokens |
|----------|--------|-----------------|
| **Playwright** | 3 tool calls: (1) find file input via selector ~200 tokens, (2) setInputFiles with path ~200 tokens, (3) wait for upload confirmation ~200 tokens. | **~600** |
| **Geometra: `geometra_upload_files`** | 1 tool call: `fieldLabel` + `paths[]`. ~100 tokens request + ~100 tokens response. | **~200** |

**Geometra advantage: ~3x fewer tokens.**

---

### 7. Multi-page Navigation

Clicking "Next" to proceed to page 2 of the application, then re-discovering page state.

| Approach | Detail | Estimated Tokens |
|----------|--------|-----------------|
| **Playwright** | 3 tool calls: (1) click "Next" ~200 tokens, (2) waitForNavigation ~150 tokens, (3) re-screenshot or re-snapshot ~28,000-4,000 tokens. | **~4,350 - 28,350** |
| **Geometra: `geometra_click` + `geometra_wait_for_navigation`** | 2 tool calls. Click returns UI delta (added/removed/changed nodes) ~200 tokens. Wait returns navigation result with optional page model ~200 tokens. | **~400** |

**Geometra advantage: ~10-70x fewer tokens.**

---

## Summary Table: Total Token Cost

Full 20-field job application flow (discovery + schema + fill + verify + 2 custom dropdowns + 1 file upload + 1 page navigation).

| Step | Playwright MCP | Geometra MCP |
|------|---------------|-------------|
| Page Discovery | 4,000 | 400 |
| Form Schema Discovery | 2,000 | 600 |
| Filling 20 Fields | 6,000 | 700 |
| Verification | 4,000 | 200 |
| 2x Custom Dropdowns | 1,600 | 400 |
| File Upload | 600 | 200 |
| Page Navigation | 4,350 | 400 |
| **Total** | **22,550** | **2,900** |

**Geometra uses ~7.8x fewer tokens for the same task.**

Using Playwright screenshots instead of a11y snapshots pushes the Playwright total to **~69,550 tokens** (24x more than Geometra).

---

## Round-trip Comparison Table

Number of MCP tool calls for the same flow.

| Step | Playwright MCP | Geometra MCP |
|------|---------------|-------------|
| Page Discovery | 1 | 1 |
| Form Schema Discovery | 2-3 | 1 |
| Filling 20 Fields | 20 | 1 |
| Verification | 20 | 0 (included in fill) |
| 2x Custom Dropdowns | 8 | 2 |
| File Upload | 3 | 1 |
| Page Navigation | 3 | 2 |
| **Total** | **57-58** | **8** |

**Geometra uses ~7x fewer round-trips.**

Each round-trip adds MCP protocol overhead (JSON-RPC framing, tool dispatch, LLM inference to process the response and decide the next action). Fewer round-trips means fewer inference calls, lower cumulative latency, and reduced risk of the agent losing context or making an error mid-sequence.

---

## Wall-clock Estimates

Approximate end-to-end latency for the full flow.

| Factor | Playwright MCP | Geometra MCP |
|--------|---------------|-------------|
| **Tool calls** | 57-58 | 8 |
| **Avg time per tool call** | ~800ms (browser render + screenshot encode or DOM query) | ~200ms (JSON read/write, no pixel rendering) |
| **Total tool execution** | ~46s | ~1.6s |
| **LLM inference per turn** | ~1.5s x 58 turns = ~87s | ~1.5s x 8 turns = ~12s |
| **Estimated wall-clock** | **~2 min 13s** | **~14s** |

### Notes on latency

- **Playwright** requires browser rendering time for each interaction. Screenshots add encoding overhead (~200-400ms). DOM queries are faster (~50-100ms) but still require round-trips through the browser DevTools Protocol.
- **Geometra proxy mode** (Chromium-backed) has similar per-action browser overhead, but batches 20 fills into a single browser session with sequential field interactions server-side, avoiding 19 extra LLM inference round-trips.
- **Geometra native mode** (direct WebSocket to a Geometra-native app) skips browser overhead entirely. Tool responses are pure JSON from the app's own accessibility tree, reducing per-tool-call time to ~50ms.
- The dominant cost savings come from **fewer LLM inference turns**, not faster individual tool calls. Each eliminated round-trip saves ~1.5s of LLM thinking time plus the token cost of processing the response.

---

## Key Architectural Differences

| Dimension | Playwright MCP | Geometra MCP |
|-----------|---------------|-------------|
| **Page representation** | Screenshots (pixels) or raw a11y tree | Structured `PageModel` with archetypes, landmarks, forms, dialogs |
| **Form understanding** | Agent must infer from DOM/a11y | `FormSchemaModel` with typed fields, options, format hints, validation state |
| **Fill granularity** | One field per tool call | Batch fill with `valuesById` or `valuesByLabel` map |
| **Verification** | Separate read-back queries | Built-in `verifyFills` flag |
| **Navigation awareness** | Manual wait + re-discover | `wait_for_navigation` returns UI delta |
| **Custom controls** | Multi-step click sequences | Dedicated `pick_listbox_option`, `upload_files` tools |
| **Field identification** | CSS selectors or coordinates (brittle) | Stable `fieldId` from `form_schema` (survives DOM changes) |
| **Response format** | Base64 images or verbose DOM/a11y | Minimal JSON with only actionable data |
