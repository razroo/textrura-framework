import { createHash } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { formatConnectFailureMessage, isHttpUrl, normalizeConnectTarget } from './connect-utils.js'
import {
  connect,
  connectThroughProxy,
  disconnect,
  getSession,
  sendClick,
  sendFillFields,
  sendType,
  sendKey,
  sendFileUpload,
  sendFieldText,
  sendFieldChoice,
  sendListboxPick,
  sendSelectOption,
  sendSetChecked,
  sendWheel,
  buildA11yTree,
  buildCompactUiIndex,
  buildFormRequiredSnapshot,
  buildPageModel,
  buildFormSchemas,
  expandPageSection,
  buildUiDelta,
  hasUiDelta,
  nodeIdForPath,
  summarizeCompactIndex,
  summarizePageModel,
  summarizeUiDelta,
  waitForUiCondition,
} from './session.js'
import type {
  A11yNode,
  FormSchemaBuildOptions,
  FormSchemaField,
  FormSchemaModel,
  Session,
  UpdateWaitResult,
} from './session.js'

type NodeStateFilterValue = boolean | 'mixed'
type ResponseDetail = 'minimal' | 'verbose'
type FormSchemaFormat = 'compact' | 'packed'

interface NodeFilter {
  id?: string
  role?: string
  name?: string
  text?: string
  contextText?: string
  value?: string
  checked?: NodeStateFilterValue
  disabled?: boolean
  focused?: boolean
  selected?: boolean
  expanded?: boolean
  invalid?: boolean
  required?: boolean
  busy?: boolean
}

interface StepExecutionResult {
  summary: string
  compact: Record<string, unknown>
}

interface FieldStatePayload {
  role: string
  value?: string
  valueLength?: number
  state?: A11yNode['state']
  error?: string
}

interface ProxyFillAckResult {
  pageUrl?: string
  invalidCount: number
  alertCount: number
  dialogCount: number
  busyCount: number
}

interface FormattedNodePayload extends Record<string, unknown> {
  id: string
  role: string
  name?: string
  value?: string
  center: { x: number; y: number }
  visibility: {
    intersectsViewport: boolean
    fullyVisible: boolean
    offscreenAbove: boolean
    offscreenBelow: boolean
    offscreenLeft: boolean
    offscreenRight: boolean
  }
  scrollHint: {
    status: 'visible' | 'partial' | 'offscreen'
    revealDeltaX: number
    revealDeltaY: number
  }
  path: number[]
}

interface RevealTargetResult {
  attempts: number
  target: FormattedNodePayload
}

interface ResolvedClickLocation {
  x: number
  y: number
  target?: FormattedNodePayload
  revealAttempts?: number
}

interface WaitConditionResult {
  filter: NodeFilter
  present: boolean
  elapsedMs: number
  matchCount: number
  matches: FormattedNodePayload[]
}

function checkedStateInput() {
  return z
    .union([z.boolean(), z.literal('mixed')])
    .optional()
    .describe('Match checked state (`true`, `false`, or `mixed`)')
}

function detailInput() {
  return z
    .enum(['minimal', 'verbose'])
    .optional()
    .default('minimal')
    .describe('`minimal` (default) returns terse action summaries. Use `verbose` for a fuller current-UI fallback.')
}

function formSchemaFormatInput() {
  return z
    .enum(['compact', 'packed'])
    .optional()
    .default('compact')
    .describe('`compact` (default) returns readable JSON fields. Use `packed` for the smallest schema payload with short keys.')
}

function formSchemaContextInput() {
  return z
    .enum(['auto', 'always', 'none'])
    .optional()
    .default('auto')
    .describe('How much disambiguation context to include in form schema rows. `auto` keeps context only when it helps.')
}

function nodeFilterShape() {
  return {
    id: z.string().optional().describe('Stable node id from geometra_snapshot or geometra_expand_section'),
    role: z.string().optional().describe('ARIA role to match'),
    name: z.string().optional().describe('Accessible name to match (exact or substring)'),
    text: z.string().optional().describe('Text content to search for (substring match)'),
    contextText: z.string().optional().describe('Ancestor / prompt text to disambiguate repeated controls with the same visible name'),
    value: z.string().optional().describe('Displayed / current field value to match (substring match)'),
    checked: checkedStateInput(),
    disabled: z.boolean().optional().describe('Match disabled state'),
    focused: z.boolean().optional().describe('Match focused state'),
    selected: z.boolean().optional().describe('Match selected state'),
    expanded: z.boolean().optional().describe('Match expanded state'),
    invalid: z.boolean().optional().describe('Match invalid / failed-validation state'),
    required: z.boolean().optional().describe('Match required-field state'),
    busy: z.boolean().optional().describe('Match busy / in-progress state'),
  }
}

function waitConditionShape() {
  return {
    ...nodeFilterShape(),
    present: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Wait until at least one node matches the filter (default true), or until no node matches (set false to wait out loading/parsing banners like “Parsing…” or “Parsing your resume”)',
      ),
    timeoutMs: z
      .number()
      .int()
      .min(50)
      .max(60_000)
      .optional()
      .default(10_000)
      .describe('Maximum time to wait before returning an error (default 10000ms)'),
  }
}

const GEOMETRA_QUERY_FILTER_REQUIRED_MESSAGE =
  'Provide at least one filter (id, role, name, text, contextText, value, checked, disabled, focused, selected, expanded, invalid, required, or busy). ' +
  'This tool uses a strict schema: unknown keys are rejected. There is no textGone parameter — use text for substring matching. ' +
  'To wait until text disappears from the UI, use geometra_wait_for with text and present: false, or geometra_wait_for_resume_parse for typical resume “Parsing…” banners.'

const GEOMETRA_WAIT_FILTER_REQUIRED_MESSAGE =
  'Provide at least one semantic filter (id, role, name, text, contextText, value, checked, disabled, focused, selected, expanded, invalid, required, or busy). ' +
  'This tool uses a strict schema: unknown keys are rejected. There is no textGone parameter — use text with a distinctive substring and present: false to wait until that text is gone ' +
  '(common for “Parsing…”, “Parsing your resume”, or similar). Passing only present/timeoutMs is not enough without a filter.'

/** Strict input so unknown keys (e.g. textGone) fail parse; empty-filter checks happen in handlers / waitForSemanticCondition. */
const geometraQueryInputSchema = z.object(nodeFilterShape()).strict()

const geometraWaitForInputSchema = z.object(waitConditionShape()).strict()

/** Same upper bound as geometra_wait_for; resume uploads often need the full minute. */
const geometraWaitForResumeParseInputSchema = z
  .object({
    text: z
      .string()
      .min(1)
      .default('Parsing')
      .describe(
        'Substring that appears in the loading/parsing banner while work is in progress (default matches copy like “Parsing your resume”, “Parsing…”, “Parsing resume”, etc.)',
      ),
    timeoutMs: z
      .number()
      .int()
      .min(50)
      .max(60_000)
      .default(60_000)
      .describe('Maximum time to wait before returning an error (default 60000ms)'),
  })
  .strict()

const timeoutMsInput = z.number().int().min(50).max(60_000).optional()

const fillFieldSchema = z.union([
  z.object({
    kind: z.literal('text'),
    fieldId: z.string().optional().describe('Optional stable field id from geometra_form_schema'),
    fieldLabel: z.string().describe('Visible field label / accessible name. Optional to duplicate when fieldId is present.'),
    value: z.string().describe('Text value to set'),
    exact: z.boolean().optional().describe('Exact label match'),
    timeoutMs: timeoutMsInput.describe('Optional action wait timeout'),
  }),
  z.object({
    kind: z.literal('text'),
    fieldId: z.string().describe('Stable field id from geometra_form_schema'),
    fieldLabel: z.string().optional().describe('Optional when fieldId is present; MCP resolves the current label from geometra_form_schema'),
    value: z.string().describe('Text value to set'),
    exact: z.boolean().optional().describe('Exact label match'),
    timeoutMs: timeoutMsInput.describe('Optional action wait timeout'),
  }),
  z.object({
    kind: z.literal('choice'),
    fieldId: z.string().optional().describe('Optional stable field id from geometra_form_schema'),
    fieldLabel: z.string().describe('Visible field label / accessible name. Optional to duplicate when fieldId is present.'),
    value: z.string().describe('Desired option value / answer label'),
    query: z.string().optional().describe('Optional search text for searchable comboboxes'),
    choiceType: z
      .enum(['select', 'group', 'listbox'])
      .optional()
      .describe('Optional choice subtype hint. Use `group` for repeated radio/button answers, `select` for native selects, and `listbox` for searchable dropdowns.'),
    exact: z.boolean().optional().describe('Exact label match'),
    timeoutMs: timeoutMsInput.describe('Optional action wait timeout'),
  }),
  z.object({
    kind: z.literal('choice'),
    fieldId: z.string().describe('Stable field id from geometra_form_schema'),
    fieldLabel: z.string().optional().describe('Optional when fieldId is present; MCP resolves the current label from geometra_form_schema'),
    value: z.string().describe('Desired option value / answer label'),
    query: z.string().optional().describe('Optional search text for searchable comboboxes'),
    choiceType: z
      .enum(['select', 'group', 'listbox'])
      .optional()
      .describe('Optional choice subtype hint. Use `group` for repeated radio/button answers, `select` for native selects, and `listbox` for searchable dropdowns.'),
    exact: z.boolean().optional().describe('Exact label match'),
    timeoutMs: timeoutMsInput.describe('Optional action wait timeout'),
  }),
  z.object({
    kind: z.literal('toggle'),
    fieldId: z.string().optional().describe('Optional stable field id from geometra_form_schema'),
    label: z.string().describe('Visible checkbox/radio label to set. Optional to duplicate when fieldId is present.'),
    checked: z.boolean().optional().default(true).describe('Desired checked state (default true)'),
    exact: z.boolean().optional().describe('Exact label match'),
    controlType: z.enum(['checkbox', 'radio']).optional().describe('Limit matching to checkbox or radio'),
    timeoutMs: timeoutMsInput.describe('Optional action wait timeout'),
  }),
  z.object({
    kind: z.literal('toggle'),
    fieldId: z.string().describe('Stable field id from geometra_form_schema'),
    label: z.string().optional().describe('Optional when fieldId is present; MCP resolves the current label from geometra_form_schema'),
    checked: z.boolean().optional().default(true).describe('Desired checked state (default true)'),
    exact: z.boolean().optional().describe('Exact label match'),
    controlType: z.enum(['checkbox', 'radio']).optional().describe('Limit matching to checkbox or radio'),
    timeoutMs: timeoutMsInput.describe('Optional action wait timeout'),
  }),
  z.object({
    kind: z.literal('file'),
    fieldId: z.string().optional().describe('Optional stable field id from geometra_form_schema'),
    fieldLabel: z.string().describe('Visible file-field label / accessible name'),
    paths: z.array(z.string()).min(1).describe('Absolute paths on the proxy machine'),
    exact: z.boolean().optional().describe('Exact label match'),
    timeoutMs: timeoutMsInput.describe('Optional action wait timeout'),
  }),
  z.object({
    kind: z.literal('file'),
    fieldId: z.string().describe('Stable field id from geometra_form_schema'),
    fieldLabel: z.string().optional().describe('Optional when fieldId is present; MCP resolves the current label when file fields are exposed by geometra_form_schema'),
    paths: z.array(z.string()).min(1).describe('Absolute paths on the proxy machine'),
    exact: z.boolean().optional().describe('Exact label match'),
    timeoutMs: timeoutMsInput.describe('Optional action wait timeout'),
  }),
])

type FillFieldInput = z.infer<typeof fillFieldSchema>
type ResolvedFillFieldInput =
  | { kind: 'text'; fieldId?: string; fieldLabel: string; value: string; exact?: boolean; timeoutMs?: number }
  | {
      kind: 'choice'
      fieldId?: string
      fieldLabel: string
      value: string
      query?: string
      choiceType?: 'select' | 'group' | 'listbox'
      exact?: boolean
      timeoutMs?: number
    }
  | {
      kind: 'toggle'
      fieldId?: string
      label: string
      checked: boolean
      controlType?: 'checkbox' | 'radio'
      exact?: boolean
      timeoutMs?: number
    }
  | { kind: 'file'; fieldId?: string; fieldLabel: string; paths: string[]; exact?: boolean; timeoutMs?: number }

const formValueSchema = z.union([
  z.string(),
  z.boolean(),
  z.array(z.string()).min(1),
])

type FormValueInput = z.infer<typeof formValueSchema>
const formValuesRecordSchema = z.record(z.string(), formValueSchema)

const batchActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('click'),
    x: z.number().optional().describe('X coordinate to click'),
    y: z.number().optional().describe('Y coordinate to click'),
    ...nodeFilterShape(),
    index: z.number().int().min(0).optional().describe('Which matching semantic target to click after sorting top-to-bottom'),
    fullyVisible: z.boolean().optional().describe('When clicking by semantic target, require full visibility before clicking (default true)'),
    maxRevealSteps: z.number().int().min(1).max(48).optional().describe('Maximum reveal attempts before clicking a semantic target. When omitted, Geometra auto-scales from scroll distance for tall forms.'),
    revealTimeoutMs: timeoutMsInput.describe('Per-scroll wait timeout while revealing a semantic target'),
    waitFor: z.object(waitConditionShape()).optional().describe('Optional semantic condition to wait for after the click'),
    timeoutMs: timeoutMsInput,
  }),
  z.object({
    type: z.literal('type'),
    text: z.string(),
    timeoutMs: timeoutMsInput,
  }),
  z.object({
    type: z.literal('key'),
    key: z.string(),
    shift: z.boolean().optional(),
    ctrl: z.boolean().optional(),
    meta: z.boolean().optional(),
    alt: z.boolean().optional(),
    timeoutMs: timeoutMsInput,
  }),
  z.object({
    type: z.literal('upload_files'),
    paths: z.array(z.string()).min(1),
    x: z.number().optional(),
    y: z.number().optional(),
    fieldLabel: z.string().optional(),
    exact: z.boolean().optional(),
    strategy: z.enum(['auto', 'chooser', 'hidden', 'drop']).optional(),
    dropX: z.number().optional(),
    dropY: z.number().optional(),
    timeoutMs: timeoutMsInput,
  }),
  z.object({
    type: z.literal('pick_listbox_option'),
    label: z.string(),
    exact: z.boolean().optional(),
    openX: z.number().optional(),
    openY: z.number().optional(),
    fieldLabel: z.string().optional(),
    query: z.string().optional(),
    timeoutMs: timeoutMsInput,
  }),
  z.object({
    type: z.literal('select_option'),
    x: z.number(),
    y: z.number(),
    value: z.string().optional(),
    label: z.string().optional(),
    index: z.number().int().min(0).optional(),
    timeoutMs: timeoutMsInput,
  }),
  z.object({
    type: z.literal('set_checked'),
    label: z.string(),
    checked: z.boolean().optional(),
    exact: z.boolean().optional(),
    controlType: z.enum(['checkbox', 'radio']).optional(),
    timeoutMs: timeoutMsInput,
  }),
  z.object({
    type: z.literal('wheel'),
    deltaY: z.number(),
    deltaX: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    timeoutMs: timeoutMsInput,
  }),
  z.object({
    type: z.literal('wait_for'),
    ...nodeFilterShape(),
    present: z.boolean().optional(),
    timeoutMs: timeoutMsInput,
  }),
  z.object({
    type: z.literal('fill_fields'),
    fields: z.array(fillFieldSchema).min(1).max(80),
  }),
])

type BatchAction = z.infer<typeof batchActionSchema>

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'geometra', version: '1.19.21' },
    { capabilities: { tools: {} } },
  )

  // ── connect ──────────────────────────────────────────────────
  server.tool(
    'geometra_connect',
    `Connect to a Geometra WebSocket peer, or start \`geometra-proxy\` automatically for a normal web page.

**Prefer \`pageUrl\` for job sites and SPAs:** pass \`https://…\` and this server spawns geometra-proxy on an ephemeral local port and connects — you do **not** need a separate terminal or a \`ws://\` URL (fewer IDE approval steps for the human).

Use \`url\` (ws://…) only when a Geometra/native server or an already-running proxy is listening. If you accidentally pass \`https://…\` in \`url\`, MCP treats it like \`pageUrl\` and starts the proxy for you.

Chromium opens **visible** by default unless \`headless: true\`. File upload / wheel / native \`<select>\` need the proxy path (\`pageUrl\` or ws to proxy). Set \`returnForms: true\` and/or \`returnPageModel: true\` when you want a lower-turn startup response.`,
    {
      url: z
        .string()
        .optional()
        .describe(
          'WebSocket URL when a server is already running (e.g. ws://127.0.0.1:3200 or ws://localhost:3100). If you pass http(s) here by mistake, MCP will treat it as a page URL and start geometra-proxy.',
        ),
      pageUrl: z
        .string()
        .url()
        .refine(isHttpUrl, 'pageUrl must use http:// or https://')
        .optional()
        .describe(
          'HTTP(S) page to open. MCP starts geometra-proxy and connects automatically. Use this instead of url for most web apply flows.',
        ),
      port: z
        .number()
        .int()
        .positive()
        .max(65535)
        .optional()
        .describe('Preferred local port for spawned proxy (default: ephemeral OS-assigned port).'),
      headless: z
        .boolean()
        .optional()
        .describe('Run Chromium headless (default false = visible window).'),
      width: z.number().int().positive().optional().describe('Viewport width for spawned proxy.'),
      height: z.number().int().positive().optional().describe('Viewport height for spawned proxy.'),
      slowMo: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Playwright slowMo (ms) on spawned proxy for easier visual following.'),
      returnForms: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include compact form schema discovery in the connect response so form flows can start in one turn.'),
      returnPageModel: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include geometra_page_model output in the connect response so exploration can start in one turn.'),
      formId: z.string().optional().describe('Optional form id filter when returnForms=true'),
      maxFields: z.number().int().min(1).max(120).optional().default(80).describe('Cap returned fields per form when returnForms=true'),
      onlyRequiredFields: z.boolean().optional().default(false).describe('Only include required fields when returnForms=true'),
      onlyInvalidFields: z.boolean().optional().default(false).describe('Only include invalid fields when returnForms=true'),
      includeOptions: z.boolean().optional().default(false).describe('Include explicit choice option labels in returned form schemas'),
      includeContext: formSchemaContextInput(),
      sinceSchemaId: z.string().optional().describe('If the current schema matches this id, return changed=false without resending forms'),
      schemaFormat: formSchemaFormatInput(),
      maxPrimaryActions: z.number().int().min(1).max(12).optional().default(6).describe('Cap top-level primary actions when returnPageModel=true'),
      maxSectionsPerKind: z.number().int().min(1).max(16).optional().default(8).describe('Cap returned landmarks/forms/dialogs/lists per kind when returnPageModel=true'),
      detail: detailInput(),
    },
    async input => {
      const normalized = normalizeConnectTarget({ url: input.url, pageUrl: input.pageUrl })
      if (!normalized.ok) return err(normalized.error)
      const target = normalized.value
      const formSchema = {
        formId: input.formId,
        maxFields: input.maxFields,
        onlyRequiredFields: input.onlyRequiredFields,
        onlyInvalidFields: input.onlyInvalidFields,
        includeOptions: input.includeOptions,
        includeContext: input.includeContext,
        sinceSchemaId: input.sinceSchemaId,
        format: input.schemaFormat,
      }
      const pageModelOptions = {
        maxPrimaryActions: input.maxPrimaryActions,
        maxSectionsPerKind: input.maxSectionsPerKind,
      }

      try {
        if (target.kind === 'proxy') {
          const session = await connectThroughProxy({
            pageUrl: target.pageUrl!,
            port: input.port,
            headless: input.headless,
            width: input.width,
            height: input.height,
            slowMo: input.slowMo,
          })
          if (input.returnForms) {
            await stabilizeInlineFormSchemas(session, formSchema)
          }
          return ok(JSON.stringify(connectResponsePayload(session, {
            transport: 'proxy',
            requestedPageUrl: target.pageUrl,
            autoCoercedFromUrl: target.autoCoercedFromUrl,
            detail: input.detail,
            returnForms: input.returnForms,
            returnPageModel: input.returnPageModel,
            formSchema,
            pageModelOptions,
          }), null, input.detail === 'verbose' ? 2 : undefined))
        }
        const session = await connect(target.wsUrl!, {
          width: input.width,
          height: input.height,
        })
        if (input.returnForms) {
          await stabilizeInlineFormSchemas(session, formSchema)
        }
        return ok(JSON.stringify(connectResponsePayload(session, {
          transport: 'ws',
          requestedWsUrl: target.wsUrl,
          autoCoercedFromUrl: false,
          detail: input.detail,
          returnForms: input.returnForms,
          returnPageModel: input.returnPageModel,
          formSchema,
          pageModelOptions,
        }), null, input.detail === 'verbose' ? 2 : undefined))
      } catch (e) {
        return err(`Failed to connect: ${formatConnectFailureMessage(e, target)}`)
      }
    }
  )

  // ── query ────────────────────────────────────────────────────
  server.registerTool(
    'geometra_query',
    {
      description: `Find elements in the current Geometra UI by stable id, role, name, text content, current value, or semantic state. Returns matching elements with their exact pixel bounds {x, y, width, height}, visible in-viewport bounds, an on-screen center point, visibility / scroll-reveal hints, role, name, value, state, and tree path.

This is the Geometra equivalent of Playwright's locator — but instant, structured, and with no browser. Use the returned bounds to click elements or assert on layout.

Unknown parameter names are rejected (strict schema). To wait until visible text goes away (e.g. a parsing banner), use geometra_wait_for with that substring in text and present: false — there is no textGone field.`,
      inputSchema: geometraQueryInputSchema,
    },
    async ({ id, role, name, text, contextText, value, checked, disabled, focused, selected, expanded, invalid, required, busy }) => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const a11y = sessionA11y(session)
      if (!a11y) return err('No UI tree available')
      const filter: NodeFilter = {
        id,
        role,
        name,
        text,
        contextText,
        value,
        checked,
        disabled,
        focused,
        selected,
        expanded,
        invalid,
        required,
        busy,
      }
      if (!hasNodeFilter(filter)) return err(GEOMETRA_QUERY_FILTER_REQUIRED_MESSAGE)
      const matches = findNodes(a11y, filter)

      if (matches.length === 0) {
        return ok(`No elements found matching ${JSON.stringify(filter)}`)
      }

      const result = sortA11yNodes(matches).map(node => formatNode(node, a11y, a11y.bounds))
      return ok(JSON.stringify(result, null, 2))
    }
  )

  server.registerTool(
    'geometra_wait_for',
    {
      description: `Wait for a semantic UI condition without guessing sleep durations. Use this for slow SPA transitions, resume parsing, custom validation alerts, disabled submit buttons, and value/state confirmation before submit.

The filter matches the same fields as geometra_query (strict schema — unknown keys error). Set \`present: false\` to wait until **no** node matches — for example Ashby/Lever-style “Parsing your resume” or any “Parsing…” banner: \`{ "text": "Parsing", "present": false }\` (tune the substring to the site). Do not use a textGone parameter; use \`text\` + \`present: false\`, or \`geometra_wait_for_resume_parse\` for the usual post-upload parsing banner.`,
      inputSchema: geometraWaitForInputSchema,
    },
    async ({ id, role, name, text, contextText, value, checked, disabled, focused, selected, expanded, invalid, required, busy, present, timeoutMs }) => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const filterProbe: NodeFilter = {
        id,
        role,
        name,
        text,
        contextText,
        value,
        checked,
        disabled,
        focused,
        selected,
        expanded,
        invalid,
        required,
        busy,
      }
      if (!hasNodeFilter(filterProbe)) return err(GEOMETRA_WAIT_FILTER_REQUIRED_MESSAGE)

      const waited = await waitForSemanticCondition(session, {
        filter: filterProbe,
        present: present ?? true,
        timeoutMs: timeoutMs ?? 10_000,
      })
      if (!waited.ok) return err(waited.error)

      if (!waited.value.present) {
        return ok(waitConditionSuccessLine(waited.value))
      }

      return ok(JSON.stringify(waited.value.matches.slice(0, 8), null, 2))
    }
  )

  server.registerTool(
    'geometra_wait_for_resume_parse',
    {
      description: `Wait until **no** visible text contains the given substring — optimized for ATS “parsing your resume” / file-processing banners after upload.

Equivalent to \`geometra_wait_for\` with \`present: false\` and \`text\` set to a banner substring. Default \`text\` is \`Parsing\` (tune per site). Strict schema (unknown keys rejected).`,
      inputSchema: geometraWaitForResumeParseInputSchema,
    },
    async ({ text, timeoutMs }) => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const filter: NodeFilter = { text }
      const waited = await waitForSemanticCondition(session, {
        filter,
        present: false,
        timeoutMs,
      })
      if (!waited.ok) return err(waited.error)
      return ok(waitConditionSuccessLine(waited.value))
    }
  )

  server.tool(
    'geometra_fill_fields',
    `Fill several labeled form fields in one MCP call. This is the preferred high-level primitive for long forms.

Use \`kind: "text"\` for textboxes / textareas, \`"choice"\` for selects / comboboxes / radio-style questions addressed by field label + answer, \`"toggle"\` for individually labeled checkboxes or radios, and \`"file"\` for labeled uploads. When \`fieldId\` from \`geometra_form_schema\` is present, MCP can resolve the current label server-side so you do not need to duplicate \`fieldLabel\` / \`label\` for text, choice, and toggle fields.`,
    {
      fields: z.array(fillFieldSchema).min(1).max(80).describe('Ordered field operations to apply. Use fieldId from geometra_form_schema to omit duplicate fieldLabel/label on schema-backed fields.'),
      stopOnError: z.boolean().optional().default(true).describe('Stop at the first failing field (default true)'),
      failOnInvalid: z
        .boolean()
        .optional()
        .default(false)
        .describe('Return an error if invalid fields remain after filling'),
      includeSteps: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include per-field step results in the JSON payload (default true). Set false for the smallest batch response.'),
      detail: detailInput(),
    },
    async ({ fields, stopOnError, failOnInvalid, includeSteps, detail }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const resolvedFields = resolveFillFieldInputs(session, fields)
      if (!resolvedFields.ok) return err(resolvedFields.error)

      const steps: Array<Record<string, unknown>> = []
      let stoppedAt: number | undefined

      for (let index = 0; index < resolvedFields.fields.length; index++) {
        const field = resolvedFields.fields[index]!
        try {
          const result = await executeFillField(session, field, detail)
          steps.push(detail === 'verbose'
            ? { index, kind: field.kind, ok: true, summary: result.summary }
            : { index, kind: field.kind, ok: true, ...result.compact })
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          steps.push({ index, kind: field.kind, ok: false, error: message })
          if (stopOnError) {
            stoppedAt = index
            break
          }
        }
      }

      const after = sessionA11y(session)
      const signals = after ? collectSessionSignals(after) : undefined
      const invalidRemaining = signals?.invalidFields.length ?? 0
      const successCount = steps.filter(step => step.ok === true).length
      const errorCount = steps.length - successCount
      const payload = {
        completed: stoppedAt === undefined && steps.length === resolvedFields.fields.length,
        fieldCount: resolvedFields.fields.length,
        successCount,
        errorCount,
        ...(includeSteps ? { steps } : {}),
        ...(stoppedAt !== undefined ? { stoppedAt } : {}),
        ...(signals ? { final: sessionSignalsPayload(signals, detail) } : {}),
      }

      if (failOnInvalid && invalidRemaining > 0) {
        return err(JSON.stringify(payload, null, detail === 'verbose' ? 2 : undefined))
      }

      return ok(JSON.stringify(payload, null, detail === 'verbose' ? 2 : undefined))
    }
  )

  server.tool(
    'geometra_fill_form',
    `Fill a form from a compact values object instead of expanding sections first. This is the lowest-token happy path for standard application flows.

Pass \`valuesById\` with field ids from \`geometra_form_schema\` for the most stable matching, or \`valuesByLabel\` when labels are unique enough. MCP resolves the form schema, executes the semantic field operations server-side, and returns one consolidated result. If you pass \`pageUrl\` or \`url\`, MCP will connect first so known-form fills can run in a single tool call.`,
    {
      url: z.string().optional().describe('Optional target URL. Use a ws:// Geometra server URL or an http(s) page URL to auto-connect before filling.'),
      pageUrl: z.string().optional().describe('Optional http(s) page URL to auto-connect before filling. Prefer this over url for browser pages.'),
      port: z.number().int().min(0).max(65535).optional().describe('Preferred local port for an auto-spawned proxy (default: ephemeral OS-assigned port).'),
      headless: z.boolean().optional().describe('Run Chromium headless when auto-spawning a proxy (default false = visible window).'),
      width: z.number().int().positive().optional().describe('Viewport width for auto-connected sessions.'),
      height: z.number().int().positive().optional().describe('Viewport height for auto-connected sessions.'),
      slowMo: z.number().int().nonnegative().optional().describe('Playwright slowMo (ms) when auto-spawning a proxy.'),
      formId: z.string().optional().describe('Optional form id from geometra_form_schema or geometra_page_model'),
      valuesById: formValuesRecordSchema.optional().describe('Form values keyed by stable field id from geometra_form_schema'),
      valuesByLabel: formValuesRecordSchema.optional().describe('Form values keyed by schema field label'),
      stopOnError: z.boolean().optional().default(true).describe('Stop at the first failing field (default true)'),
      failOnInvalid: z
        .boolean()
        .optional()
        .default(false)
        .describe('Return an error if invalid fields remain after filling'),
      includeSteps: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include per-field step results in the JSON payload (default false for the smallest response)'),
      detail: detailInput(),
    },
    async ({ url, pageUrl, port, headless, width, height, slowMo, formId, valuesById, valuesByLabel, stopOnError, failOnInvalid, includeSteps, detail }) => {
      const directFields =
        !includeSteps && !formId && Object.keys(valuesById ?? {}).length === 0
          ? directLabelBatchFields(valuesByLabel)
          : null

      const resolved = await ensureToolSession(
        {
          url,
          pageUrl,
          port,
          headless,
          width,
          height,
          slowMo,
          awaitInitialFrame: directFields ? false : undefined,
        },
        'Not connected. Call geometra_connect first, or pass pageUrl/url to geometra_fill_form.',
      )
      if (!resolved.ok) return err(resolved.error)
      const session = resolved.session
      const connection = autoConnectionPayload(resolved)

      const entryCount = Object.keys(valuesById ?? {}).length + Object.keys(valuesByLabel ?? {}).length
      if (entryCount === 0) {
        return err('Provide at least one value in valuesById or valuesByLabel')
      }

      if (directFields) {
        try {
          const startRevision = session.updateRevision
          const wait = await sendFillFields(session, directFields)
          const ackResult = parseProxyFillAckResult(wait.result)
          if (ackResult && ackResult.invalidCount === 0) {
            return ok(JSON.stringify({
              ...connection,
              completed: true,
              execution: 'batched-direct',
              finalSource: 'proxy',
              requestedValueCount: entryCount,
              fieldCount: directFields.length,
              successCount: directFields.length,
              errorCount: 0,
              final: ackResult,
            }, null, detail === 'verbose' ? 2 : undefined))
          }

          await waitForDeferredBatchUpdate(session, startRevision, wait)
          const afterDirect = sessionA11y(session)
          const directSignals = afterDirect ? collectSessionSignals(afterDirect) : undefined
          if (directSignals && directSignals.invalidFields.length === 0) {
            return ok(JSON.stringify({
              ...connection,
              completed: true,
              execution: 'batched-direct',
              finalSource: 'session',
              requestedValueCount: entryCount,
              fieldCount: directFields.length,
              successCount: directFields.length,
              errorCount: 0,
              final: sessionSignalsPayload(directSignals, detail),
            }, null, detail === 'verbose' ? 2 : undefined))
          }
        } catch (e) {
          if (!canFallbackToSequentialFill(e)) {
            const message = e instanceof Error ? e.message : String(e)
            return err(message)
          }
        }
      }

      if (!session.tree || !session.layout) {
        await waitForUiCondition(session, () => Boolean(session.tree && session.layout), 2_000)
      }
      const afterConnect = sessionA11y(session)
      if (!afterConnect) return err('No UI tree available for form filling')
      const schemas = getSessionFormSchemas(session, {
        includeOptions: true,
        includeContext: 'auto',
      })
      if (schemas.length === 0) return err('No forms found in the current UI')

      const resolution = resolveTargetFormSchema(schemas, { formId, valuesById, valuesByLabel })
      if (!resolution.ok) return err(resolution.error)
      const schema = resolution.schema

      const planned = planFormFill(schema, { valuesById, valuesByLabel })
      if (!planned.ok) return err(planned.error)

      if (!includeSteps) {
        let usedBatch = false
        let batchAckResult: ProxyFillAckResult | undefined
        try {
          const startRevision = session.updateRevision
          const wait = await sendFillFields(session, planned.fields)
          const ackResult = parseProxyFillAckResult(wait.result)
          batchAckResult = ackResult
          if (ackResult && ackResult.invalidCount === 0) {
            usedBatch = true
            const payload = {
              ...connection,
              completed: true,
              execution: 'batched',
              finalSource: 'proxy',
              formId: schema.formId,
              requestedValueCount: entryCount,
              fieldCount: planned.fields.length,
              successCount: planned.fields.length,
              errorCount: 0,
              final: ackResult,
            }
            return ok(JSON.stringify(payload, null, detail === 'verbose' ? 2 : undefined))
          }
          await waitForDeferredBatchUpdate(session, startRevision, wait)
          await waitForBatchFieldReadback(session, planned.fields)
          usedBatch = true
        } catch (e) {
          if (!canFallbackToSequentialFill(e)) {
            const message = e instanceof Error ? e.message : String(e)
            return err(message)
          }
        }

        if (usedBatch) {
          const after = sessionA11y(session)
          const signals = after ? collectSessionSignals(after) : undefined
          const invalidRemaining = signals?.invalidFields.length ?? 0
          if ((!batchAckResult || batchAckResult.invalidCount > 0) && invalidRemaining > 0) {
            usedBatch = false
          }
        }

        if (usedBatch) {
          const after = sessionA11y(session)
          const signals = after ? collectSessionSignals(after) : undefined
          const invalidRemaining = signals?.invalidFields.length ?? 0
          const payload = {
            ...connection,
            completed: true,
            execution: 'batched',
            finalSource: 'session',
            formId: schema.formId,
            requestedValueCount: entryCount,
            fieldCount: planned.fields.length,
            successCount: planned.fields.length,
            errorCount: 0,
            ...(signals ? { final: sessionSignalsPayload(signals, detail) } : {}),
          }

          if (failOnInvalid && invalidRemaining > 0) {
            return err(JSON.stringify(payload, null, detail === 'verbose' ? 2 : undefined))
          }

          return ok(JSON.stringify(payload, null, detail === 'verbose' ? 2 : undefined))
        }
      }

      const steps: Array<Record<string, unknown>> = []
      let stoppedAt: number | undefined

      for (let index = 0; index < planned.fields.length; index++) {
        const field = planned.fields[index]!
        try {
          const result = await executeFillField(session, field, detail)
          steps.push(detail === 'verbose'
            ? { index, kind: field.kind, ok: true, summary: result.summary }
            : { index, kind: field.kind, ok: true, ...result.compact })
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          steps.push({ index, kind: field.kind, ok: false, error: message })
          if (stopOnError) {
            stoppedAt = index
            break
          }
        }
      }

      const after = sessionA11y(session)
      const signals = after ? collectSessionSignals(after) : undefined
      const invalidRemaining = signals?.invalidFields.length ?? 0
      const successCount = steps.filter(step => step.ok === true).length
      const errorCount = steps.length - successCount
      const payload = {
        ...connection,
        completed: stoppedAt === undefined && steps.length === planned.fields.length,
        execution: 'sequential',
        formId: schema.formId,
        requestedValueCount: entryCount,
        fieldCount: planned.fields.length,
        successCount,
        errorCount,
        ...(includeSteps ? { steps } : {}),
        ...(stoppedAt !== undefined ? { stoppedAt } : {}),
        ...(signals ? { final: sessionSignalsPayload(signals, detail) } : {}),
      }

      if (failOnInvalid && invalidRemaining > 0) {
        return err(JSON.stringify(payload, null, detail === 'verbose' ? 2 : undefined))
      }

      return ok(JSON.stringify(payload, null, detail === 'verbose' ? 2 : undefined))
    }
  )

  server.tool(
    'geometra_run_actions',
    `Execute several Geometra actions in one MCP round trip and return one consolidated result. This is the preferred path for long, multi-step form fills where one-tool-per-field would otherwise create too much chatter.

Supported step types: \`click\`, \`type\`, \`key\`, \`upload_files\`, \`pick_listbox_option\`, \`select_option\`, \`set_checked\`, \`wheel\`, \`wait_for\`, and \`fill_fields\`. \`click\` steps can also carry a nested \`waitFor\` condition.`,
    {
      actions: z.array(batchActionSchema).min(1).max(80).describe('Ordered high-level action steps to run sequentially'),
      stopOnError: z.boolean().optional().default(true).describe('Stop at the first failing step (default true)'),
      includeSteps: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include per-action step results in the JSON payload (default true). Set false for the smallest batch response.'),
      detail: detailInput(),
    },
    async ({ actions, stopOnError, includeSteps, detail }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')

      const steps: Array<Record<string, unknown>> = []
      let stoppedAt: number | undefined

      for (let index = 0; index < actions.length; index++) {
        const action = actions[index]!
        try {
          const result = await executeBatchAction(session, action, detail, includeSteps)
          steps.push(detail === 'verbose'
            ? { index, type: action.type, ok: true, summary: result.summary }
            : { index, type: action.type, ok: true, ...result.compact })
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          steps.push({ index, type: action.type, ok: false, error: message })
          if (stopOnError) {
            stoppedAt = index
            break
          }
        }
      }

      const after = sessionA11y(session)
      const successCount = steps.filter(step => step.ok === true).length
      const errorCount = steps.length - successCount
      const payload = {
        completed: stoppedAt === undefined && steps.length === actions.length,
        stepCount: actions.length,
        successCount,
        errorCount,
        ...(includeSteps ? { steps } : {}),
        ...(stoppedAt !== undefined ? { stoppedAt } : {}),
        ...(after ? { final: sessionSignalsPayload(collectSessionSignals(after), detail) } : {}),
      }
      return ok(JSON.stringify(payload, null, detail === 'verbose' ? 2 : undefined))
    }
  )

  // ── page model ────────────────────────────────────────────────
  server.tool(
    'geometra_page_model',
    `Get a higher-level webpage summary instead of a raw node dump. Returns stable section ids, page archetypes, summary counts, top-level landmarks/forms/dialogs/lists, and a few primary actions.

Use this first on normal HTML pages when you want to understand the page shape with fewer tokens than a full snapshot. Then call geometra_expand_section on a returned section id when you need details.`,
    {
      maxPrimaryActions: z
        .number()
        .int()
        .min(1)
        .max(12)
        .optional()
        .default(6)
        .describe('Cap top-level primary actions (default 6).'),
      maxSectionsPerKind: z
        .number()
        .int()
        .min(1)
        .max(16)
        .optional()
        .default(8)
        .describe('Cap returned landmarks/forms/dialogs/lists per kind (default 8).'),
    },
    async ({ maxPrimaryActions, maxSectionsPerKind }) => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const a11y = sessionA11y(session)
      if (!a11y) return err('No UI tree available')
      const model = buildPageModel(a11y, { maxPrimaryActions, maxSectionsPerKind })
      return ok(JSON.stringify(model))
    }
  )

  server.tool(
    'geometra_form_schema',
    `Get a compact, fill-oriented schema for forms on the page. This is the preferred discovery step before geometra_fill_form.

Unlike geometra_expand_section, this collapses repeated radio/button groups into single logical fields, keeps output compact, and omits layout-heavy detail by default. If you pass \`pageUrl\` or \`url\`, MCP will connect first so discovery can happen in one tool call.`,
    {
      url: z.string().optional().describe('Optional target URL. Use a ws:// Geometra server URL or an http(s) page URL to auto-connect before discovery.'),
      pageUrl: z.string().optional().describe('Optional http(s) page URL to auto-connect before discovery. Prefer this over url for browser pages.'),
      port: z.number().int().min(0).max(65535).optional().describe('Preferred local port for an auto-spawned proxy (default: ephemeral OS-assigned port).'),
      headless: z.boolean().optional().describe('Run Chromium headless when auto-spawning a proxy (default false = visible window).'),
      width: z.number().int().positive().optional().describe('Viewport width for auto-connected sessions.'),
      height: z.number().int().positive().optional().describe('Viewport height for auto-connected sessions.'),
      slowMo: z.number().int().nonnegative().optional().describe('Playwright slowMo (ms) when auto-spawning a proxy.'),
      formId: z.string().optional().describe('Optional form id from geometra_page_model. If omitted, returns every form schema on the page.'),
      maxFields: z.number().int().min(1).max(120).optional().default(80).describe('Cap returned fields per form'),
      onlyRequiredFields: z.boolean().optional().default(false).describe('Only include required fields'),
      onlyInvalidFields: z.boolean().optional().default(false).describe('Only include invalid fields'),
      includeOptions: z.boolean().optional().default(false).describe('Include explicit choice option labels'),
      includeContext: formSchemaContextInput(),
      sinceSchemaId: z.string().optional().describe('If the current schema matches this id, return changed=false without resending forms'),
      format: formSchemaFormatInput(),
    },
    async ({ url, pageUrl, port, headless, width, height, slowMo, formId, maxFields, onlyRequiredFields, onlyInvalidFields, includeOptions, includeContext, sinceSchemaId, format }) => {
      const resolved = await ensureToolSession(
        { url, pageUrl, port, headless, width, height, slowMo },
        'Not connected. Call geometra_connect first, or pass pageUrl/url to geometra_form_schema.',
      )
      if (!resolved.ok) return err(resolved.error)
      const session = resolved.session

      const payload = formSchemaResponsePayload(session, {
        formId,
        maxFields,
        onlyRequiredFields,
        onlyInvalidFields,
        includeOptions,
        includeContext,
        sinceSchemaId,
        format,
      })
      if (payload.formCount === 0) {
        return err(formId ? `No form schema found for id ${formId}` : 'No forms found in the current UI')
      }
      return ok(JSON.stringify({
        ...autoConnectionPayload(resolved),
        ...payload,
      }))
    }
  )

  server.tool(
    'geometra_expand_section',
    `Expand one section from geometra_page_model by stable id. Returns richer on-demand details such as headings, fields, actions, nested lists, list items, and text preview.

Use this after geometra_page_model when you know which form/dialog/list/landmark you want to inspect more closely. Per-item bounds are omitted by default to save tokens; set includeBounds=true if you need them immediately.`,
    {
      id: z.string().describe('Section id from geometra_page_model, e.g. fm:1.0 or ls:2.1'),
      maxHeadings: z.number().int().min(1).max(20).optional().default(6).describe('Cap heading rows'),
      maxFields: z.number().int().min(1).max(40).optional().default(18).describe('Cap field rows'),
      fieldOffset: z.number().int().min(0).optional().default(0).describe('Field row offset for long forms'),
      onlyRequiredFields: z.boolean().optional().default(false).describe('Only include required fields'),
      onlyInvalidFields: z.boolean().optional().default(false).describe('Only include invalid fields'),
      maxActions: z.number().int().min(1).max(30).optional().default(12).describe('Cap action rows'),
      actionOffset: z.number().int().min(0).optional().default(0).describe('Action row offset'),
      maxLists: z.number().int().min(0).max(20).optional().default(8).describe('Cap nested lists'),
      listOffset: z.number().int().min(0).optional().default(0).describe('Nested-list offset'),
      maxItems: z.number().int().min(0).max(50).optional().default(20).describe('Cap list items'),
      itemOffset: z.number().int().min(0).optional().default(0).describe('List-item offset'),
      maxTextPreview: z.number().int().min(0).max(20).optional().default(6).describe('Cap text preview lines'),
      includeBounds: z.boolean().optional().default(false).describe('Include bounds for fields/actions/headings/items'),
    },
    async ({
      id,
      maxHeadings,
      maxFields,
      fieldOffset,
      onlyRequiredFields,
      onlyInvalidFields,
      maxActions,
      actionOffset,
      maxLists,
      listOffset,
      maxItems,
      itemOffset,
      maxTextPreview,
      includeBounds,
    }) => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const a11y = sessionA11y(session)
      if (!a11y) return err('No UI tree available')
      const detail = expandPageSection(a11y, id, {
        maxHeadings,
        maxFields,
        fieldOffset,
        onlyRequiredFields,
        onlyInvalidFields,
        maxActions,
        actionOffset,
        maxLists,
        listOffset,
        maxItems,
        itemOffset,
        maxTextPreview,
        includeBounds,
      })
      if (!detail) return err(`No expandable section found for id ${id}`)
      return ok(JSON.stringify(detail))
    }
  )

  server.tool(
    'geometra_reveal',
    `Scroll until a matching node is revealed. This is the generic alternative to trial-and-error wheel calls on long forms.

Use the same filters as geometra_query, plus an optional match index when repeated controls share the same visible label.`,
    {
      ...nodeFilterShape(),
      index: z.number().int().min(0).optional().default(0).describe('Which matching node to reveal after sorting top-to-bottom'),
      fullyVisible: z.boolean().optional().default(true).describe('Require the target to become fully visible (default true)'),
      maxSteps: z.number().int().min(1).max(48).optional().describe('Maximum reveal attempts before returning an error. When omitted, Geometra auto-scales from scroll distance for tall forms.'),
      timeoutMs: z
        .number()
        .int()
        .min(50)
        .max(60_000)
        .optional()
        .default(2_500)
        .describe('Per-scroll wait timeout (default 2500ms)'),
    },
    async ({ id, role, name, text, contextText, value, checked, disabled, focused, selected, expanded, invalid, required, busy, index, fullyVisible, maxSteps, timeoutMs }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')

      const filter: NodeFilter = {
        id,
        role,
        name,
        text,
        contextText,
        value,
        checked,
        disabled,
        focused,
        selected,
        expanded,
        invalid,
        required,
        busy,
      }
      if (!hasNodeFilter(filter)) return err('Provide at least one reveal filter (id, role, name, text, contextText, value, or state)')

      const revealed = await revealSemanticTarget(session, {
        filter,
        index: index ?? 0,
        fullyVisible: fullyVisible ?? true,
        maxSteps,
        timeoutMs: timeoutMs ?? 2_500,
      })
      if (!revealed.ok) return err(revealed.error)

      return ok(JSON.stringify({
        revealed: true,
        attempts: revealed.value.attempts,
        target: revealed.value.target,
      }, null, 2))
    }
  )

  // ── click ────────────────────────────────────────────────────
  server.tool(
    'geometra_click',
    `Click an element in the Geometra UI. Provide either raw x,y coordinates or a semantic target (\`id\`, \`role\`, \`name\`, \`text\`, \`contextText\`, \`value\`, or state filters). You can also attach \`waitFor\` to block on the post-click semantic state in the same call. The click is dispatched server-side via the geometry protocol — no browser, no simulated DOM events.

After clicking, returns a compact semantic delta when possible (dialogs/forms/lists/nodes changed). If nothing meaningful changed, returns a short current-UI overview.`,
    {
      x: z.number().optional().describe('X coordinate to click (use center of element bounds from geometra_query)'),
      y: z.number().optional().describe('Y coordinate to click'),
      ...nodeFilterShape(),
      index: z.number().int().min(0).optional().default(0).describe('Which matching semantic target to click after sorting top-to-bottom'),
      fullyVisible: z.boolean().optional().default(true).describe('When clicking by semantic target, require full visibility before clicking (default true)'),
      maxRevealSteps: z.number().int().min(1).max(48).optional().describe('Maximum reveal attempts before clicking a semantic target. When omitted, Geometra auto-scales from scroll distance for tall forms.'),
      revealTimeoutMs: z
        .number()
        .int()
        .min(50)
        .max(60_000)
        .optional()
        .default(2_500)
        .describe('Per-scroll wait timeout while revealing a semantic target (default 2500ms)'),
      waitFor: z.object(waitConditionShape()).optional().describe('Optional semantic condition to wait for after the click'),
      timeoutMs: z
        .number()
        .int()
        .min(50)
        .max(60_000)
        .optional()
        .describe('Optional action wait timeout (use a longer value for slow submits or route transitions)'),
      detail: detailInput(),
    },
    async ({ x, y, id, role, name, text, contextText, value, checked, disabled, focused, selected, expanded, invalid, required, busy, index, fullyVisible, maxRevealSteps, revealTimeoutMs, waitFor, timeoutMs, detail }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)
      const resolved = await resolveClickLocation(session, {
        x,
        y,
        filter: {
          id,
          role,
          name,
          text,
          contextText,
          value,
          checked,
          disabled,
          focused,
          selected,
          expanded,
          invalid,
          required,
          busy,
        },
        index,
        fullyVisible,
        maxRevealSteps,
        revealTimeoutMs,
      })
      if (!resolved.ok) return err(resolved.error)

      const wait = await sendClick(session, resolved.value.x, resolved.value.y, timeoutMs)

      const summary = postActionSummary(session, before, wait, detail)
      const clickLine = !resolved.value.target
        ? `Clicked at (${resolved.value.x}, ${resolved.value.y}).`
        : `Clicked ${describeFormattedNode(resolved.value.target)} at (${resolved.value.x}, ${resolved.value.y})${resolved.value.revealAttempts && resolved.value.revealAttempts > 0 ? ` after ${resolved.value.revealAttempts} reveal step${resolved.value.revealAttempts === 1 ? '' : 's'}` : ''}.`
      const lines = [clickLine, summary]
      if (waitFor) {
        const postWait = await waitForSemanticCondition(session, {
          filter: {
            id: waitFor.id,
            role: waitFor.role,
            name: waitFor.name,
            text: waitFor.text,
            contextText: waitFor.contextText,
            value: waitFor.value,
            checked: waitFor.checked,
            disabled: waitFor.disabled,
            focused: waitFor.focused,
            selected: waitFor.selected,
            expanded: waitFor.expanded,
            invalid: waitFor.invalid,
            required: waitFor.required,
            busy: waitFor.busy,
          },
          present: waitFor.present ?? true,
          timeoutMs: waitFor.timeoutMs ?? 10_000,
        })
        if (!postWait.ok) return err([...lines, postWait.error].join('\n'))
        lines.push(`Post-click ${waitConditionSuccessLine(postWait.value)}`)
      }
      return ok(lines.filter(Boolean).join('\n'))
    }
  )

  // ── type ─────────────────────────────────────────────────────
  server.tool(
    'geometra_type',
    `Type text into the currently focused element. First click a textbox/input with geometra_click to focus it, then use this to type.

Each character is sent as a key event through the geometry protocol. Returns a compact semantic delta when possible, otherwise a short current-UI overview.`,
    {
      text: z.string().describe('Text to type into the focused element'),
      timeoutMs: z
        .number()
        .int()
        .min(50)
        .max(60_000)
        .optional()
        .describe('Optional action wait timeout'),
      detail: detailInput(),
    },
    async ({ text, timeoutMs, detail }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)

      const wait = await sendType(session, text, timeoutMs)

      const summary = postActionSummary(session, before, wait, detail)
      return ok(`Typed "${text}".\n${summary}`)
    }
  )

  // ── key ──────────────────────────────────────────────────────
  server.tool(
    'geometra_key',
    `Send a special key press (Enter, Tab, Escape, ArrowDown, etc.) to the Geometra UI. Useful for form submission, focus navigation, and keyboard shortcuts.`,
    {
      key: z.string().describe('Key to press (e.g. "Enter", "Tab", "Escape", "ArrowDown", "Backspace")'),
      shift: z.boolean().optional().describe('Hold Shift'),
      ctrl: z.boolean().optional().describe('Hold Ctrl'),
      meta: z.boolean().optional().describe('Hold Meta/Cmd'),
      alt: z.boolean().optional().describe('Hold Alt'),
      timeoutMs: z
        .number()
        .int()
        .min(50)
        .max(60_000)
        .optional()
        .describe('Optional action wait timeout'),
      detail: detailInput(),
    },
    async ({ key, shift, ctrl, meta, alt, timeoutMs, detail }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)

      const wait = await sendKey(session, key, { shift, ctrl, meta, alt }, timeoutMs)

      const summary = postActionSummary(session, before, wait, detail)
      return ok(`Pressed ${formatKeyCombo(key, { shift, ctrl, meta, alt })}.\n${summary}`)
    }
  )

  // ── upload files (proxy) ───────────────────────────────────────
  server.tool(
    'geometra_upload_files',
    `Attach local files to a file input. Requires \`@geometra/proxy\` (paths exist on the proxy host).

Strategies: **auto** (default) tries chooser click if x,y given, else a labeled file input when \`fieldLabel\` is provided, else hidden \`input[type=file]\`, else first visible file input. **hidden** targets hidden inputs directly. **drop** needs dropX,dropY for drag-target zones. **chooser** requires x,y.`,
    {
      paths: z.array(z.string()).min(1).describe('Absolute paths on the proxy machine, e.g. /Users/you/resume.pdf'),
      x: z.number().optional().describe('Click X to trigger native file chooser'),
      y: z.number().optional().describe('Click Y to trigger native file chooser'),
      fieldLabel: z.string().optional().describe('Prefer a specific labeled file field (for example "Resume" or "Cover letter")'),
      exact: z.boolean().optional().describe('Exact match when using fieldLabel'),
      strategy: z
        .enum(['auto', 'chooser', 'hidden', 'drop'])
        .optional()
        .describe('Upload strategy (default auto)'),
      dropX: z.number().optional().describe('Drop target X (viewport) for strategy drop'),
      dropY: z.number().optional().describe('Drop target Y (viewport) for strategy drop'),
      timeoutMs: z
        .number()
        .int()
        .min(50)
        .max(60_000)
        .optional()
        .describe('Optional action wait timeout (resume parsing / SPA upload flows often need longer than a normal click)'),
      detail: detailInput(),
    },
    async ({ paths, x, y, fieldLabel, exact, strategy, dropX, dropY, timeoutMs, detail }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)
      try {
        const wait = await sendFileUpload(session, paths, {
          click: x !== undefined && y !== undefined ? { x, y } : undefined,
          fieldLabel,
          exact,
          strategy,
          drop: dropX !== undefined && dropY !== undefined ? { x: dropX, y: dropY } : undefined,
        }, timeoutMs ?? 8_000)
        const summary = postActionSummary(session, before, wait, detail)
        return ok(`Uploaded ${paths.length} file(s).\n${summary}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'geometra_pick_listbox_option',
    `Pick an option from a custom dropdown / listbox / searchable combobox (Headless UI, React Select, Radix, Ashby-style custom selects, etc.). Requires \`@geometra/proxy\`.

Pass \`fieldLabel\` to open a labeled dropdown semantically instead of relying on coordinates. If the opened control is editable, MCP types \`query\` (or the option label by default) before selecting. Uses fuzzy-ish substring/alias matching unless exact=true, prefers the popup nearest the opened field, can fall back to keyboard navigation for searchable comboboxes, and returns capped \`visibleOptions\` in failure payloads so agents can retry with a real label.`,
    {
      label: z.string().describe('Accessible name of the option (visible text or aria-label)'),
      exact: z.boolean().optional().describe('Exact name match'),
      openX: z.number().optional().describe('Click to open dropdown'),
      openY: z.number().optional().describe('Click to open dropdown'),
      fieldLabel: z.string().optional().describe('Field label of the dropdown/combobox to open semantically (e.g. "Location")'),
      query: z.string().optional().describe('Optional text to type into a searchable combobox before selecting'),
      timeoutMs: z
        .number()
        .int()
        .min(50)
        .max(60_000)
        .optional()
        .describe('Optional action wait timeout for slow dropdowns / remote search results'),
      detail: detailInput(),
    },
    async ({ label, exact, openX, openY, fieldLabel, query, timeoutMs, detail }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)
      try {
        const wait = await sendListboxPick(session, label, {
          exact,
          open: openX !== undefined && openY !== undefined ? { x: openX, y: openY } : undefined,
          fieldLabel,
          query,
        }, timeoutMs)
        const summary = postActionSummary(session, before, wait, detail)
        const fieldSummary = fieldLabel ? summarizeFieldLabelState(session, fieldLabel) : undefined
        return ok([
          `Picked listbox option "${label}".`,
          fieldSummary,
          summary,
        ].filter(Boolean).join('\n'))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  // ── select option (proxy, native <select>) ─────────────────────
  server.tool(
    'geometra_select_option',
    `Set a native HTML \`<select>\` after clicking its center (x,y from geometra_query). Requires \`@geometra/proxy\`.

Custom React/Vue dropdowns are not supported here — use \`geometra_pick_listbox_option\` for custom dropdowns / searchable comboboxes.`,
    {
      x: z.number().describe('X coordinate (e.g. center of the select from geometra_query)'),
      y: z.number().describe('Y coordinate'),
      value: z.string().optional().describe('Option value= attribute'),
      label: z.string().optional().describe('Visible option label (substring match)'),
      index: z.number().int().min(0).optional().describe('Zero-based option index'),
      timeoutMs: z
        .number()
        .int()
        .min(50)
        .max(60_000)
        .optional()
        .describe('Optional action wait timeout'),
      detail: detailInput(),
    },
    async ({ x, y, value, label, index, timeoutMs, detail }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      if (value === undefined && label === undefined && index === undefined) {
        return err('Provide at least one of value, label, or index')
      }
      const before = sessionA11y(session)
      try {
        const wait = await sendSelectOption(session, x, y, { value, label, index }, timeoutMs)
        const summary = postActionSummary(session, before, wait, detail)
        return ok(`Selected option.\n${summary}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'geometra_set_checked',
    `Set a checkbox or radio by label. Requires \`@geometra/proxy\`.

Prefer this over raw coordinate clicks for custom forms that keep the real input visually hidden (common on Ashby, Greenhouse custom widgets, and design-system checkboxes/radios). Uses substring label matching unless exact=true.`,
    {
      label: z.string().describe('Accessible label or visible option text to match'),
      checked: z.boolean().optional().default(true).describe('Desired checked state (radios only support true)'),
      exact: z.boolean().optional().describe('Exact label match'),
      controlType: z.enum(['checkbox', 'radio']).optional().describe('Limit matching to checkbox or radio'),
      timeoutMs: z
        .number()
        .int()
        .min(50)
        .max(60_000)
        .optional()
        .describe('Optional action wait timeout'),
      detail: detailInput(),
    },
    async ({ label, checked, exact, controlType, timeoutMs, detail }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)
      try {
        const wait = await sendSetChecked(session, label, { checked, exact, controlType }, timeoutMs)
        const summary = postActionSummary(session, before, wait, detail)
        return ok(`Set ${controlType ?? 'checkbox/radio'} "${label}" to ${String(checked ?? true)}.\n${summary}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  // ── wheel / scroll (proxy) ─────────────────────────────────────
  server.tool(
    'geometra_wheel',
    `Scroll the page or an element under the pointer using the mouse wheel. Requires \`@geometra/proxy\` (e.g. virtualized lists, long application forms).`,
    {
      deltaY: z.number().describe('Vertical scroll delta (positive scrolls down, typical step ~100)'),
      deltaX: z.number().optional().describe('Horizontal scroll delta'),
      x: z.number().optional().describe('Move pointer to X before scrolling'),
      y: z.number().optional().describe('Move pointer to Y before scrolling'),
      timeoutMs: z
        .number()
        .int()
        .min(50)
        .max(60_000)
        .optional()
        .describe('Optional action wait timeout'),
      detail: detailInput(),
    },
    async ({ deltaY, deltaX, x, y, timeoutMs, detail }) => {
      const session = getSession()
      if (!session) return err('Not connected. Call geometra_connect first.')
      const before = sessionA11y(session)
      try {
        const wait = await sendWheel(session, deltaY, { deltaX, x, y }, timeoutMs)
        const summary = postActionSummary(session, before, wait, detail)
        return ok(`Wheel delta (${deltaX ?? 0}, ${deltaY}).\n${summary}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  // ── snapshot ─────────────────────────────────────────────────
  server.tool(
    'geometra_snapshot',
    `Get the current UI as JSON. Default **compact** view: flat list of viewport-visible actionable nodes plus a few pinned context anchors (for example tab strips / form roots) and root context like URL, scroll, and focus — far fewer tokens than a full nested tree. Use **full** for complete nested a11y + every wrapper when debugging layout. Use **form-required** to list required fields across forms, including offscreen ones, with bounds + visibility + scroll hints for long application flows.

JSON is minified in compact view to save tokens. For a summary-first overview, use geometra_page_model, then geometra_expand_section for just the part you want.`,
    {
      view: z
        .enum(['compact', 'full', 'form-required'])
        .optional()
        .default('compact')
        .describe('compact (default): token-efficient flat index. full: nested tree, every node. form-required: required fields across forms, including offscreen controls.'),
      maxNodes: z
        .number()
        .int()
        .min(20)
        .max(800)
        .optional()
        .default(400)
        .describe('Max rows in compact view (default 400).'),
      formId: z.string().optional().describe('Optional form id from geometra_form_schema / geometra_page_model when view=form-required'),
      maxFields: z.number().int().min(1).max(200).optional().default(80).describe('Per-form field cap when view=form-required'),
      includeOptions: z.boolean().optional().default(false).describe('Include explicit choice option labels when view=form-required'),
    },
    async ({ view, maxNodes, formId, maxFields, includeOptions }) => {
      const session = getSession()
      if (!session?.tree || !session?.layout) return err('Not connected. Call geometra_connect first.')

      const a11y = sessionA11y(session)
      if (!a11y) return err('No UI tree available')
      if (view === 'full') {
        return ok(JSON.stringify(a11y, null, 2))
      }
      if (view === 'form-required') {
        const payload = {
          view: 'form-required' as const,
          viewport: { width: a11y.bounds.width, height: a11y.bounds.height },
          forms: buildFormRequiredSnapshot(a11y, {
            formId,
            maxFields,
            includeOptions,
            includeContext: 'auto',
          }),
        }
        return ok(JSON.stringify(payload))
      }
      const { nodes, truncated, context } = buildCompactUiIndex(a11y, { maxNodes })
      const payload = {
        view: 'compact' as const,
        viewport: { width: a11y.bounds.width, height: a11y.bounds.height },
        context,
        nodes,
        truncated,
      }
      return ok(JSON.stringify(payload))
    }
  )

  // ── layout ───────────────────────────────────────────────────
  server.tool(
    'geometra_layout',
    `Get the raw computed layout geometry — the exact {x, y, width, height} for every node in the UI tree. This is the lowest-level view, useful for pixel-precise assertions in tests.

For a token-efficient semantic view, use geometra_snapshot (default compact). For the complete nested tree, geometra_snapshot with view=full.`,
    {},
    async () => {
      const session = getSession()
      if (!session?.layout) return err('Not connected. Call geometra_connect first.')

      return ok(JSON.stringify(session.layout, null, 2))
    }
  )

  // ── disconnect ───────────────────────────────────────────────
  server.tool(
    'geometra_disconnect',
    `Disconnect from the Geometra server. Proxy-backed sessions keep compatible browsers alive by default so the next geometra_connect can reuse them quickly; pass closeBrowser=true to fully tear down the warm proxy/browser pool.`,
    {
      closeBrowser: z.boolean().optional().default(false).describe('Fully close the spawned proxy/browser instead of keeping it warm for reuse'),
    },
    async ({ closeBrowser }) => {
      disconnect({ closeProxy: closeBrowser })
      return ok(closeBrowser ? 'Disconnected and closed browser.' : 'Disconnected.')
    }
  )

  return server
}

// ── Helpers ──────────────────────────────────────────────────────

function compactSessionSummary(session: Session): string {
  const a11y = sessionA11y(session)
  if (!a11y) return 'No UI update received'
  return sessionOverviewFromA11y(a11y)
}

function connectPayload(
  session: Session,
  opts: {
    transport: 'proxy' | 'ws'
    requestedPageUrl?: string
    requestedWsUrl?: string
    autoCoercedFromUrl?: boolean
    detail?: ResponseDetail
  },
): Record<string, unknown> {
  const a11y = sessionA11y(session)
  return {
    connected: true,
    transport: opts.transport,
    wsUrl: session.url,
    ...(a11y?.meta?.pageUrl || opts.requestedPageUrl ? { pageUrl: a11y?.meta?.pageUrl ?? opts.requestedPageUrl } : {}),
    ...(opts.requestedWsUrl ? { requestedWsUrl: opts.requestedWsUrl } : {}),
    ...(opts.autoCoercedFromUrl ? { autoCoercedFromUrl: true } : {}),
    ...(opts.detail === 'verbose' && a11y ? { currentUi: sessionOverviewFromA11y(a11y) } : {}),
  }
}

function sessionA11y(session: Session): A11yNode | null {
  if (!session.tree || !session.layout) return null
  if (session.cachedA11yRevision === session.updateRevision) {
    return session.cachedA11y ?? null
  }
  const a11y = buildA11yTree(session.tree, session.layout)
  session.cachedA11y = a11y
  session.cachedA11yRevision = session.updateRevision
  return a11y
}

function shortHash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 12)
}

function formSchemaCacheKey(options: FormSchemaBuildOptions): string {
  return JSON.stringify({
    formId: options.formId ?? null,
    maxFields: options.maxFields ?? null,
    onlyRequiredFields: options.onlyRequiredFields ?? false,
    onlyInvalidFields: options.onlyInvalidFields ?? false,
    includeOptions: options.includeOptions ?? false,
    includeContext: options.includeContext ?? 'auto',
  })
}

function getSessionFormSchemas(session: Session, options: FormSchemaBuildOptions): FormSchemaModel[] {
  const key = formSchemaCacheKey(options)
  const cached = session.cachedFormSchemas?.get(key)
  if (cached && cached.revision === session.updateRevision) return cached.forms

  const a11y = sessionA11y(session)
  if (!a11y) return []
  const forms = buildFormSchemas(a11y, options)
  if (!session.cachedFormSchemas) session.cachedFormSchemas = new Map()
  session.cachedFormSchemas.set(key, {
    revision: session.updateRevision,
    forms,
  })
  return forms
}

function packedFormSchemas(forms: FormSchemaModel[]): Array<Record<string, unknown>> {
  return forms.map(form => ({
    i: form.formId,
    ...(form.name ? { n: form.name } : {}),
    fc: form.fieldCount,
    rc: form.requiredCount,
    ic: form.invalidCount,
    f: form.fields.map(field => ({
      i: field.id,
      k: field.kind,
      l: field.label,
      ...(field.required ? { r: 1 } : {}),
      ...(field.invalid ? { iv: 1 } : {}),
      ...(field.choiceType ? { ch: field.choiceType } : {}),
      ...(field.booleanChoice ? { b: 1 } : {}),
      ...(field.controlType ? { t: field.controlType } : {}),
      ...(field.optionCount !== undefined ? { oc: field.optionCount } : {}),
      ...(field.value ? { v: field.value } : {}),
      ...(field.valueLength !== undefined ? { vl: field.valueLength } : {}),
      ...(field.checked !== undefined ? { c: field.checked ? 1 : 0 } : {}),
      ...(field.values && field.values.length > 0 ? { vs: field.values } : {}),
      ...(field.context ? { x: field.context } : {}),
    })),
  }))
}

function formSchemaResponsePayload(
  session: Session,
  opts: FormSchemaBuildOptions & { sinceSchemaId?: string; format?: FormSchemaFormat },
): Record<string, unknown> {
  const forms = getSessionFormSchemas(session, opts)
  const schemaJson = JSON.stringify(forms)
  const schemaId = `fs:${shortHash(schemaJson)}`
  if (opts.sinceSchemaId && opts.sinceSchemaId === schemaId) {
    return {
      schemaId,
      changed: false,
      formCount: forms.length,
      format: opts.format ?? 'compact',
    }
  }

  return {
    schemaId,
    changed: true,
    formCount: forms.length,
    format: opts.format ?? 'compact',
    forms: (opts.format ?? 'compact') === 'packed' ? packedFormSchemas(forms) : forms,
  }
}

function totalReturnedSchemaFields(forms: FormSchemaModel[]): number {
  return forms.reduce((sum, form) => sum + form.fields.length, 0)
}

function expectedReturnedSchemaFields(forms: FormSchemaModel[], maxFields?: number): number {
  return forms.reduce((sum, form) => sum + Math.min(form.fieldCount, maxFields ?? form.fieldCount), 0)
}

function schemaShapeSignature(forms: FormSchemaModel[]): string {
  return JSON.stringify(forms.map(form => ({
    formId: form.formId,
    fieldCount: form.fieldCount,
    fields: form.fields.map(field => field.id),
  })))
}

async function stabilizeInlineFormSchemas(
  session: Session,
  options: FormSchemaBuildOptions,
  opts?: {
    timeoutMs?: number
    pollMs?: number
    stableMs?: number
  },
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 2_000
  const pollMs = opts?.pollMs ?? 60
  const stableMs = opts?.stableMs ?? 120
  const deadline = Date.now() + timeoutMs

  let forms = getSessionFormSchemas(session, options)
  let lastSignature = schemaShapeSignature(forms)
  let stableSince = Date.now()

  while (Date.now() < deadline) {
    const expectedFields = expectedReturnedSchemaFields(forms, options.maxFields)
    if (forms.length > 0 && totalReturnedSchemaFields(forms) >= expectedFields && Date.now() - stableSince >= stableMs) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, pollMs))

    forms = getSessionFormSchemas(session, options)
    const signature = schemaShapeSignature(forms)
    if (signature !== lastSignature) {
      lastSignature = signature
      stableSince = Date.now()
    }
  }
}

function connectResponsePayload(
  session: Session,
  opts: {
    transport: 'proxy' | 'ws'
    requestedPageUrl?: string
    requestedWsUrl?: string
    autoCoercedFromUrl?: boolean
    detail?: ResponseDetail
    returnForms?: boolean
    returnPageModel?: boolean
    formSchema?: FormSchemaBuildOptions & { sinceSchemaId?: string; format?: FormSchemaFormat }
    pageModelOptions?: { maxPrimaryActions?: number; maxSectionsPerKind?: number }
  },
): Record<string, unknown> {
  const payload = connectPayload(session, opts)
  if (!opts.returnForms && !opts.returnPageModel) return payload
  const nextPayload: Record<string, unknown> = { ...payload }
  if (opts.returnForms) {
    nextPayload.formSchema = formSchemaResponsePayload(session, opts.formSchema ?? {})
  }
  if (opts.returnPageModel) {
    nextPayload.pageModel = pageModelResponsePayload(session, opts.pageModelOptions)
  }
  return nextPayload
}

function pageModelResponsePayload(
  session: Session,
  options?: { maxPrimaryActions?: number; maxSectionsPerKind?: number },
): unknown {
  const a11y = sessionA11y(session)
  if (!a11y) {
    return { available: false }
  }
  return buildPageModel(a11y, options)
}

async function ensureToolSession(
  target: {
    url?: string
    pageUrl?: string
    port?: number
    headless?: boolean
    width?: number
    height?: number
    slowMo?: number
    awaitInitialFrame?: boolean
  },
  missingConnectionMessage = 'Not connected. Call geometra_connect first.',
): Promise<
  | {
      ok: true
      session: Session
      autoConnected: boolean
      transport?: 'proxy' | 'ws'
      requestedPageUrl?: string
      requestedWsUrl?: string
      autoCoercedFromUrl?: boolean
    }
  | {
      ok: false
      error: string
    }
> {
  if (!target.url && !target.pageUrl) {
    const session = getSession()
    if (!session) return { ok: false, error: missingConnectionMessage }
    return { ok: true, session, autoConnected: false }
  }

  const normalized = normalizeConnectTarget({ url: target.url, pageUrl: target.pageUrl })
  if (!normalized.ok) return { ok: false, error: normalized.error }
  const resolvedTarget = normalized.value

  try {
    if (resolvedTarget.kind === 'proxy') {
      const session = await connectThroughProxy({
        pageUrl: resolvedTarget.pageUrl!,
        port: target.port,
        headless: target.headless,
        width: target.width,
        height: target.height,
        slowMo: target.slowMo,
        awaitInitialFrame: target.awaitInitialFrame,
      })
      return {
        ok: true,
        session,
        autoConnected: true,
        transport: 'proxy',
        requestedPageUrl: resolvedTarget.pageUrl,
        autoCoercedFromUrl: resolvedTarget.autoCoercedFromUrl,
      }
    }

    const session = await connect(resolvedTarget.wsUrl!, {
      width: target.width,
      height: target.height,
      awaitInitialFrame: target.awaitInitialFrame,
    })
    return {
      ok: true,
      session,
      autoConnected: true,
      transport: 'ws',
      requestedWsUrl: resolvedTarget.wsUrl,
    }
  } catch (e) {
    return { ok: false, error: `Failed to connect: ${formatConnectFailureMessage(e, resolvedTarget)}` }
  }
}

function autoConnectionPayload(
  target:
    | {
        autoConnected: boolean
        transport?: 'proxy' | 'ws'
        requestedPageUrl?: string
        requestedWsUrl?: string
        autoCoercedFromUrl?: boolean
      }
    | undefined,
): Record<string, unknown> {
  if (!target?.autoConnected) return {}
  return {
    autoConnected: true,
    ...(target.transport ? { transport: target.transport } : {}),
    ...(target.requestedPageUrl ? { pageUrl: target.requestedPageUrl } : {}),
    ...(target.requestedWsUrl ? { requestedWsUrl: target.requestedWsUrl } : {}),
    ...(target.autoCoercedFromUrl ? { autoCoercedFromUrl: true } : {}),
  }
}

function sessionOverviewFromA11y(a11y: A11yNode): string {
  const pageSummary = summarizePageModel(buildPageModel(a11y), 8)
  const { nodes, context } = buildCompactUiIndex(a11y, { maxNodes: 32 })
  const contextSummary = summarizeCompactContext(context)
  const keyNodes = nodes.length > 0 ? `Key nodes:\n${summarizeCompactIndex(nodes, 18)}` : ''
  return [pageSummary, contextSummary, keyNodes].filter(Boolean).join('\n')
}

function postActionSummary(
  session: Session,
  before: A11yNode | null,
  wait?: UpdateWaitResult,
  detail: ResponseDetail = 'minimal',
): string {
  const after = sessionA11y(session)
  const notes: string[] = []
  if (wait?.status === 'acknowledged') {
    notes.push(detail === 'verbose'
      ? 'The peer acknowledged the action quickly; waiting logic did not need to rely on a full frame/patch round-trip.'
      : 'Peer acknowledged the action quickly.')
  }
  if (wait?.status === 'timed_out') {
    notes.push(
      detail === 'verbose'
        ? `No frame or patch arrived within ${wait.timeoutMs}ms after the action. The action may still have succeeded if it did not change geometry or semantics.`
        : `No update arrived within ${wait.timeoutMs}ms; the action may still have succeeded.`,
    )
  }
  if (!after) return [...notes, 'No UI update received'].filter(Boolean).join('\n')
  const signals = collectSessionSignals(after)
  const validationSummary = summarizeValidationSignals(signals)
  if (before) {
    const delta = buildUiDelta(before, after)
    if (hasUiDelta(delta)) {
      return [
        ...notes,
        `Changes:\n${summarizeUiDelta(delta, detail === 'verbose' ? 14 : 8)}`,
        ...(detail === 'minimal' ? validationSummary : []),
      ].filter(Boolean).join('\n')
    }
  }
  if (detail === 'verbose') {
    return [...notes, `Current UI:\n${sessionOverviewFromA11y(after)}`].filter(Boolean).join('\n')
  }
  return [...notes, summarizeSessionSignals(signals), ...validationSummary].filter(Boolean).join('\n')
}

function summarizeCompactContext(context: ReturnType<typeof buildCompactUiIndex>['context']): string {
  const parts: string[] = []
  if (context.pageUrl) parts.push(`url=${context.pageUrl}`)
  if (typeof context.scrollX === 'number' || typeof context.scrollY === 'number') {
    parts.push(`scroll=(${context.scrollX ?? 0},${context.scrollY ?? 0})`)
  }
  if (context.focusedNode) {
    const focusName = context.focusedNode.name ? ` "${context.focusedNode.name}"` : ''
    parts.push(`focus=${context.focusedNode.role}${focusName}`)
  }
  return parts.length > 0 ? `Context: ${parts.join(' | ')}` : ''
}

interface SessionSignals {
  pageUrl?: string
  scrollX?: number
  scrollY?: number
  focus?: {
    id: string
    role: string
    name?: string
    value?: string
  }
  dialogCount: number
  busyCount: number
  alerts: string[]
  invalidFields: Array<{
    id: string
    role: string
    name?: string
    error?: string
  }>
}

function collectSessionSignals(root: A11yNode): SessionSignals {
  const signals: SessionSignals = {
    ...(root.meta?.pageUrl ? { pageUrl: root.meta.pageUrl } : {}),
    ...(typeof root.meta?.scrollX === 'number' ? { scrollX: root.meta.scrollX } : {}),
    ...(typeof root.meta?.scrollY === 'number' ? { scrollY: root.meta.scrollY } : {}),
    dialogCount: 0,
    busyCount: 0,
    alerts: [],
    invalidFields: [],
  }

  const seenAlerts = new Set<string>()
  const seenInvalidIds = new Set<string>()

  function walk(node: A11yNode) {
    if (!signals.focus && node.state?.focused) {
      signals.focus = {
        id: nodeIdForPath(node.path),
        role: node.role,
        ...(node.name ? { name: node.name } : {}),
        ...(node.value ? { value: node.value } : {}),
      }
    }
    if (node.role === 'dialog' || node.role === 'alertdialog') signals.dialogCount++
    if (node.state?.busy) signals.busyCount++
    if (node.role === 'alert' || node.role === 'alertdialog') {
      const text = truncateInlineText(node.name ?? node.validation?.error, 120)
      if (text && !seenAlerts.has(text)) {
        seenAlerts.add(text)
        signals.alerts.push(text)
      }
    }
    if ((node.role === 'textbox' || node.role === 'combobox' || node.role === 'checkbox' || node.role === 'radio') && node.state?.invalid) {
      const id = nodeIdForPath(node.path)
      if (!seenInvalidIds.has(id)) {
        seenInvalidIds.add(id)
        signals.invalidFields.push({
          id,
          role: node.role,
          ...(node.name ? { name: truncateInlineText(node.name, 80) } : {}),
          ...(node.validation?.error ? { error: truncateInlineText(node.validation.error, 120) } : {}),
        })
      }
    }
    for (const child of node.children) walk(child)
  }

  walk(root)
  return signals
}

function summarizeSessionSignals(signals: SessionSignals): string {
  const contextParts: string[] = []
  if (signals.pageUrl) contextParts.push(`url=${signals.pageUrl}`)
  if (signals.scrollX !== undefined || signals.scrollY !== undefined) {
    contextParts.push(`scroll=(${signals.scrollX ?? 0},${signals.scrollY ?? 0})`)
  }
  if (signals.focus) {
    const focusName = signals.focus.name ? ` "${truncateInlineText(signals.focus.name, 48)}"` : ''
    const focusValue = signals.focus.value ? ` value=${JSON.stringify(truncateInlineText(signals.focus.value, 40))}` : ''
    contextParts.push(`focus=${signals.focus.role}${focusName}${focusValue}`)
  }

  const statusParts = [
    signals.dialogCount > 0 ? `dialogs=${signals.dialogCount}` : undefined,
    signals.alerts.length > 0 ? `alerts=${signals.alerts.length}` : undefined,
    signals.invalidFields.length > 0 ? `invalid=${signals.invalidFields.length}` : undefined,
    signals.busyCount > 0 ? `busy=${signals.busyCount}` : undefined,
  ].filter(Boolean)

  return [
    contextParts.length > 0 ? `Context: ${contextParts.join(' | ')}` : undefined,
    statusParts.length > 0 ? `Status: ${statusParts.join(' | ')}` : 'Status: no semantic changes detected.',
  ].filter(Boolean).join('\n')
}

function summarizeValidationSignals(signals: SessionSignals): string[] {
  const lines: string[] = []
  if (signals.alerts.length > 0) {
    lines.push(`Alerts: ${signals.alerts.slice(0, 2).map(text => JSON.stringify(text)).join(' | ')}`)
  }
  if (signals.invalidFields.length > 0) {
    const invalidSummary = signals.invalidFields
      .slice(0, 4)
      .map(field => {
        const label = field.name ? `"${field.name}"` : field.id
        return field.error ? `${label}: ${JSON.stringify(field.error)}` : label
      })
      .join(' | ')
    lines.push(`Validation: ${invalidSummary}`)
  }
  return lines
}

function truncateInlineText(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

function sessionSignalsPayload(signals: SessionSignals, detail: ResponseDetail = 'minimal'): Record<string, unknown> {
  return {
    ...(signals.pageUrl ? { pageUrl: signals.pageUrl } : {}),
    ...(signals.scrollX !== undefined || signals.scrollY !== undefined
      ? { scroll: { x: signals.scrollX ?? 0, y: signals.scrollY ?? 0 } }
      : {}),
    ...(signals.focus ? { focus: signals.focus } : {}),
    dialogCount: signals.dialogCount,
    busyCount: signals.busyCount,
    alertCount: signals.alerts.length,
    invalidCount: signals.invalidFields.length,
    alerts: detail === 'verbose' ? signals.alerts : signals.alerts.slice(0, 2),
    invalidFields: detail === 'verbose' ? signals.invalidFields : signals.invalidFields.slice(0, 4),
  }
}

function compactTextValue(value: string, inlineLimit = 48): { value?: string; valueLength?: number } {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return { valueLength: value.length }
  return normalized.length <= inlineLimit
    ? { value: normalized }
    : { valueLength: value.length }
}

function fieldStatePayload(session: Session, fieldLabel: string): FieldStatePayload | undefined {
  const a11y = sessionA11y(session)
  if (!a11y) return undefined
  const matches = findNodes(a11y, {
    name: fieldLabel,
    role: 'combobox',
  })
  if (matches.length === 0) {
    matches.push(...findNodes(a11y, { name: fieldLabel, role: 'textbox' }))
  }
  if (matches.length === 0) {
    matches.push(...findNodes(a11y, { name: fieldLabel, role: 'button' }))
  }
  const match = matches[0]
  if (!match) return undefined

  const valuePayload = match.value ? compactTextValue(match.value, 64) : {}
  return {
    role: match.role,
    ...valuePayload,
    ...(match.state && Object.keys(match.state).length > 0 ? { state: match.state } : {}),
    ...(match.validation?.error ? { error: truncateInlineText(match.validation.error, 120) } : {}),
  }
}

function waitStatusPayload(wait: UpdateWaitResult | undefined): Record<string, unknown> {
  return wait ? { wait: wait.status } : {}
}

function compactFilterPayload(filter: NodeFilter): Record<string, unknown> {
  return Object.fromEntries(Object.entries(filter).filter(([, value]) => value !== undefined))
}

async function waitForSemanticCondition(
  session: Session,
  options: {
    filter: NodeFilter
    present: boolean
    timeoutMs: number
  },
): Promise<{ ok: true; value: WaitConditionResult } | { ok: false; error: string }> {
  if (!hasNodeFilter(options.filter)) {
    return { ok: false, error: GEOMETRA_WAIT_FILTER_REQUIRED_MESSAGE }
  }

  const startedAt = Date.now()
  const matched = await waitForUiCondition(session, () => {
    const a11y = sessionA11y(session)
    if (!a11y) return false
    const matches = findNodes(a11y, options.filter)
    return options.present ? matches.length > 0 : matches.length === 0
  }, options.timeoutMs)
  const elapsedMs = Date.now() - startedAt

  if (!matched) {
    return {
      ok: false,
      error: `Timed out after ${options.timeoutMs}ms waiting for ${options.present ? 'presence' : 'absence'} of ${JSON.stringify(options.filter)}.\nCurrent UI:\n${compactSessionSummary(session)}`,
    }
  }

  const after = sessionA11y(session)
  const matches = options.present && after
    ? sortA11yNodes(findNodes(after, options.filter)).slice(0, 8).map(node => formatNode(node, after, after.bounds))
    : []

  return {
    ok: true,
    value: {
      filter: options.filter,
      present: options.present,
      elapsedMs,
      matchCount: matches.length,
      matches,
    },
  }
}

function waitConditionSuccessLine(result: WaitConditionResult): string {
  if (!result.present) {
    return `condition satisfied after ${result.elapsedMs}ms: no nodes matched ${JSON.stringify(result.filter)}.`
  }
  return `condition satisfied after ${result.elapsedMs}ms with ${result.matchCount} matching node(s).`
}

function waitConditionCompact(result: WaitConditionResult): Record<string, unknown> {
  return {
    present: result.present,
    elapsedMs: result.elapsedMs,
    filter: compactFilterPayload(result.filter),
    ...(result.present ? { matchCount: result.matchCount } : {}),
  }
}

function inferRevealStepBudget(
  target: FormattedNodePayload,
  viewport: { width: number; height: number },
): number {
  const verticalSteps = Math.ceil(Math.abs(target.scrollHint.revealDeltaY) / Math.max(1, viewport.height * 0.75))
  const horizontalSteps = Math.ceil(Math.abs(target.scrollHint.revealDeltaX) / Math.max(1, viewport.width * 0.7))
  return clamp(Math.max(6, Math.max(verticalSteps, horizontalSteps) + 1), 6, 48)
}

async function revealSemanticTarget(
  session: Session,
  options: {
    filter: NodeFilter
    index: number
    fullyVisible: boolean
    maxSteps?: number
    timeoutMs: number
  },
): Promise<{ ok: true; value: RevealTargetResult } | { ok: false; error: string }> {
  let attempts = 0
  let stepBudget = options.maxSteps
  while (attempts <= (stepBudget ?? 48)) {
    const a11y = sessionA11y(session)
    if (!a11y) return { ok: false, error: 'No UI tree available to reveal from' }

    const matches = sortA11yNodes(findNodes(a11y, options.filter))
    if (matches.length === 0) {
      return { ok: false, error: `No elements found matching ${JSON.stringify(options.filter)}` }
    }
    if (options.index >= matches.length) {
      return {
        ok: false,
        error: `Requested reveal index ${options.index} but only ${matches.length} matching element(s) were found`,
      }
    }

    const formatted = formatNode(matches[options.index]!, a11y, a11y.bounds)
    stepBudget ??= inferRevealStepBudget(formatted, a11y.bounds)
    const visible = options.fullyVisible ? formatted.visibility.fullyVisible : formatted.visibility.intersectsViewport
    if (visible) {
      return {
        ok: true,
        value: {
          attempts,
          target: formatted,
        },
      }
    }

    if (attempts === stepBudget) {
      return {
        ok: false,
        error: JSON.stringify({
          revealed: false,
          attempts,
          maxSteps: stepBudget,
          target: formatted,
        }, null, 2),
      }
    }

    const deltaX = clamp(
      formatted.scrollHint.revealDeltaX,
      -Math.round(a11y.bounds.width * 0.75),
      Math.round(a11y.bounds.width * 0.75),
    )
    let deltaY = clamp(
      formatted.scrollHint.revealDeltaY,
      -Math.round(a11y.bounds.height * 0.85),
      Math.round(a11y.bounds.height * 0.85),
    )
    if (deltaY === 0 && !formatted.visibility.fullyVisible) {
      deltaY = formatted.visibility.offscreenAbove ? -Math.round(a11y.bounds.height * 0.4) : Math.round(a11y.bounds.height * 0.4)
    }

    await sendWheel(session, deltaY, {
      deltaX,
      x: formatted.center.x,
      y: formatted.center.y,
    }, options.timeoutMs)
    attempts++
  }

  return { ok: false, error: `Failed to reveal ${JSON.stringify(options.filter)}` }
}

async function resolveClickLocation(
  session: Session,
  options: {
    x?: number
    y?: number
    filter: NodeFilter
    index?: number
    fullyVisible?: boolean
    maxRevealSteps?: number
    revealTimeoutMs?: number
  },
): Promise<{ ok: true; value: ResolvedClickLocation } | { ok: false; error: string }> {
  const hasExplicitCoordinates = options.x !== undefined || options.y !== undefined
  if (hasExplicitCoordinates) {
    if (options.x === undefined || options.y === undefined) {
      return { ok: false, error: 'Provide both x and y when clicking by coordinates' }
    }
    return {
      ok: true,
      value: {
        x: options.x,
        y: options.y,
      },
    }
  }

  if (!hasNodeFilter(options.filter)) {
    return {
      ok: false,
      error: 'Provide x and y, or at least one semantic target filter (id, role, name, text, contextText, value, or state)',
    }
  }

  const revealed = await revealSemanticTarget(session, {
    filter: options.filter,
    index: options.index ?? 0,
    fullyVisible: options.fullyVisible ?? true,
    maxSteps: options.maxRevealSteps,
    timeoutMs: options.revealTimeoutMs ?? 2_500,
  })
  if (!revealed.ok) return revealed

  return {
    ok: true,
    value: {
      x: revealed.value.target.center.x,
      y: revealed.value.target.center.y,
      target: revealed.value.target,
      revealAttempts: revealed.value.attempts,
    },
  }
}

function describeFormattedNode(node: FormattedNodePayload): string {
  return `${node.role}${node.name ? ` ${JSON.stringify(node.name)}` : ''} (${node.id})`
}

function compactNodeReference(node: FormattedNodePayload): Record<string, unknown> {
  return {
    id: node.id,
    role: node.role,
    ...(node.name ? { name: node.name } : {}),
  }
}

function normalizeLookupKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function resolveTargetFormSchema(
  schemas: FormSchemaModel[],
  opts: {
    formId?: string
    valuesById?: Record<string, FormValueInput>
    valuesByLabel?: Record<string, FormValueInput>
  },
): { ok: true; schema: FormSchemaModel } | { ok: false; error: string } {
  if (opts.formId) {
    const matched = schemas.find(schema => schema.formId === opts.formId)
    return matched
      ? { ok: true, schema: matched }
      : { ok: false, error: `No form schema found for id ${opts.formId}` }
  }

  if (schemas.length === 1) return { ok: true, schema: schemas[0]! }

  const idKeys = Object.keys(opts.valuesById ?? {})
  const labelKeys = Object.keys(opts.valuesByLabel ?? {}).map(normalizeLookupKey)
  const matches = schemas.filter(schema => {
    const ids = new Set(schema.fields.map(field => field.id))
    const labels = new Set(schema.fields.map(field => normalizeLookupKey(field.label)))
    return idKeys.every(id => ids.has(id)) && labelKeys.every(label => labels.has(label))
  })

  if (matches.length === 1) return { ok: true, schema: matches[0]! }
  if (matches.length === 0) {
    return {
      ok: false,
      error: 'Could not infer which form to fill from the provided field ids/labels. Pass formId from geometra_form_schema.',
    }
  }
  return {
    ok: false,
    error: 'Multiple forms match the provided field ids/labels. Pass formId from geometra_form_schema.',
  }
}

function coerceChoiceValue(field: FormSchemaField, value: FormValueInput): string | null {
  if (typeof value === 'string') return value
  if (typeof value !== 'boolean') return null
  if (field.booleanChoice) return value ? 'Yes' : 'No'
  const desired = value ? 'yes' : 'no'
  const option = field.options?.find(option => normalizeLookupKey(option) === desired)
  return option ?? (value ? 'Yes' : 'No')
}

function plannedFillInputsForField(field: FormSchemaField, value: FormValueInput): ResolvedFillFieldInput[] | { error: string } {
  if (field.kind === 'text') {
    if (typeof value !== 'string') return { error: `Field "${field.label}" expects a string value` }
    return [{ kind: 'text', fieldId: field.id, fieldLabel: field.label, value }]
  }

  if (field.kind === 'choice') {
    const coerced = coerceChoiceValue(field, value)
    if (!coerced) return { error: `Field "${field.label}" expects a string value` }
    return [{
      kind: 'choice',
      fieldId: field.id,
      fieldLabel: field.label,
      value: coerced,
      ...(field.choiceType ? { choiceType: field.choiceType } : {}),
    }]
  }

  if (field.kind === 'toggle') {
    if (typeof value !== 'boolean') return { error: `Field "${field.label}" expects a boolean value` }
    return [{ kind: 'toggle', fieldId: field.id, label: field.label, checked: value, controlType: field.controlType }]
  }

  const selected = Array.isArray(value) ? value : typeof value === 'string' ? [value] : null
  if (!selected || selected.length === 0) return { error: `Field "${field.label}" expects a string array value` }
  if (!field.options || field.options.length === 0) {
    return { error: `Field "${field.label}" does not expose checkbox options; use geometra_fill_fields for this field` }
  }
  const selectedKeys = new Set(selected.map(normalizeLookupKey))
  return field.options.map(option => ({
    kind: 'toggle',
    fieldId: field.id,
    label: option,
    checked: selectedKeys.has(normalizeLookupKey(option)),
    controlType: 'checkbox',
  }))
}

function planFormFill(
  schema: FormSchemaModel,
  opts: {
    valuesById?: Record<string, FormValueInput>
    valuesByLabel?: Record<string, FormValueInput>
  },
): { ok: true; fields: ResolvedFillFieldInput[] } | { ok: false; error: string } {
  const fieldById = new Map(schema.fields.map(field => [field.id, field]))
  const fieldsByLabel = new Map<string, FormSchemaField[]>()
  for (const field of schema.fields) {
    const key = normalizeLookupKey(field.label)
    const existing = fieldsByLabel.get(key)
    if (existing) existing.push(field)
    else fieldsByLabel.set(key, [field])
  }

  const planned: ResolvedFillFieldInput[] = []
  const seenFieldIds = new Set<string>()

  for (const [fieldId, value] of Object.entries(opts.valuesById ?? {})) {
    const field = fieldById.get(fieldId)
    if (!field) return { ok: false, error: `Unknown form field id ${fieldId}. Refresh geometra_form_schema and try again.` }
    const next = plannedFillInputsForField(field, value)
    if ('error' in next) return { ok: false, error: next.error }
    planned.push(...next)
    seenFieldIds.add(field.id)
  }

  for (const [label, value] of Object.entries(opts.valuesByLabel ?? {})) {
    const matches = fieldsByLabel.get(normalizeLookupKey(label)) ?? []
    if (matches.length === 0) return { ok: false, error: `Unknown form field label "${label}". Refresh geometra_form_schema and try again.` }
    if (matches.length > 1) {
      return { ok: false, error: `Label "${label}" is ambiguous in form ${schema.formId}. Use valuesById for this field.` }
    }
    const field = matches[0]!
    if (seenFieldIds.has(field.id)) {
      return { ok: false, error: `Field "${label}" was provided in both valuesById and valuesByLabel` }
    }
    const next = plannedFillInputsForField(field, value)
    if ('error' in next) return { ok: false, error: next.error }
    planned.push(...next)
    seenFieldIds.add(field.id)
  }

  return { ok: true, fields: planned }
}

function isResolvedFillFieldInput(field: FillFieldInput): field is ResolvedFillFieldInput {
  if (field.kind === 'toggle') return typeof field.label === 'string' && field.label.length > 0
  return typeof field.fieldLabel === 'string' && field.fieldLabel.length > 0
}

function resolveFillFieldInputs(
  session: Session,
  fields: FillFieldInput[],
): { ok: true; fields: ResolvedFillFieldInput[] } | { ok: false; error: string } {
  const unresolved = fields.filter(field => !isResolvedFillFieldInput(field))
  if (unresolved.length === 0) {
    return { ok: true, fields: fields as ResolvedFillFieldInput[] }
  }

  const a11y = sessionA11y(session)
  if (!a11y) return { ok: false, error: 'No UI tree available to resolve fieldId entries from geometra_form_schema' }

  const fieldById = new Map<string, FormSchemaField>()
  for (const schema of buildFormSchemas(a11y, { includeOptions: true, includeContext: 'always' })) {
    for (const field of schema.fields) fieldById.set(field.id, field)
  }

  const resolved: ResolvedFillFieldInput[] = []
  for (const field of fields) {
    if (isResolvedFillFieldInput(field)) {
      if (field.kind === 'choice' && field.fieldId && field.choiceType === undefined) {
        const schemaField = fieldById.get(field.fieldId)
        resolved.push({
          ...field,
          ...(schemaField?.kind === 'choice' && schemaField.choiceType ? { choiceType: schemaField.choiceType } : {}),
        })
      } else if (field.kind === 'toggle' && field.fieldId && field.controlType === undefined) {
        const schemaField = fieldById.get(field.fieldId)
        resolved.push({
          ...field,
          ...(schemaField?.kind === 'toggle' && schemaField.controlType ? { controlType: schemaField.controlType } : {}),
        })
      } else {
        resolved.push(field)
      }
      continue
    }

    if (!field.fieldId) {
      return {
        ok: false,
        error:
          field.kind === 'toggle'
            ? 'Toggle fields require label, or provide fieldId from geometra_form_schema so MCP can resolve the current label.'
            : `${field.kind} fields require fieldLabel, or provide fieldId from geometra_form_schema so MCP can resolve the current label.`,
      }
    }

    const schemaField = fieldById.get(field.fieldId)
    if (!schemaField) {
      return { ok: false, error: `Unknown form field id ${field.fieldId}. Refresh geometra_form_schema and try again.` }
    }

    if (field.kind === 'text') {
      if (schemaField.kind !== 'text') {
        return { ok: false, error: `Field id ${field.fieldId} resolves to kind "${schemaField.kind}", not text.` }
      }
      resolved.push({ ...field, fieldLabel: schemaField.label })
      continue
    }

    if (field.kind === 'choice') {
      if (schemaField.kind !== 'choice') {
        return { ok: false, error: `Field id ${field.fieldId} resolves to kind "${schemaField.kind}", not choice.` }
      }
      resolved.push({
        ...field,
        fieldLabel: schemaField.label,
        ...(field.choiceType === undefined && schemaField.choiceType ? { choiceType: schemaField.choiceType } : {}),
      })
      continue
    }

    if (field.kind === 'toggle') {
      if (schemaField.kind !== 'toggle') {
        return { ok: false, error: `Field id ${field.fieldId} resolves to kind "${schemaField.kind}", not toggle.` }
      }
      resolved.push({
        ...field,
        label: schemaField.label,
        ...(field.controlType === undefined && schemaField.controlType ? { controlType: schemaField.controlType } : {}),
      })
      continue
    }

    return {
      ok: false,
      error: `File field id ${field.fieldId} still needs fieldLabel. geometra_form_schema does not reliably expose proxy file inputs yet.`,
    }
  }

  return { ok: true, fields: resolved }
}

function canFallbackToSequentialFill(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  try {
    const parsed = JSON.parse(message) as Record<string, unknown>
    if (
      parsed?.error === 'listboxPick' ||
      parsed?.error === 'setFieldText' ||
      parsed?.error === 'setFieldChoice' ||
      parsed?.error === 'setChecked' ||
      parsed?.error === 'attachFiles'
    ) {
      return true
    }
  } catch {
    /* ignore non-JSON errors */
  }
  return (
    message.includes('Unsupported client message type "fillFields"') ||
    message.includes('Client message type "fillFields" is not supported') ||
    message.startsWith('setFieldText:') ||
    message.startsWith('setFieldChoice:') ||
    message.startsWith('setChecked:') ||
    message.startsWith('attachFiles:') ||
    message.startsWith('pickListboxOption:') ||
    message.startsWith('Could not find a') ||
    message.startsWith('No visible')
  )
}

function parseProxyFillAckResult(value: unknown): ProxyFillAckResult | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.invalidCount !== 'number' ||
    typeof candidate.alertCount !== 'number' ||
    typeof candidate.dialogCount !== 'number' ||
    typeof candidate.busyCount !== 'number'
  ) {
    return undefined
  }
  return {
    ...(typeof candidate.pageUrl === 'string' ? { pageUrl: candidate.pageUrl } : {}),
    invalidCount: candidate.invalidCount,
    alertCount: candidate.alertCount,
    dialogCount: candidate.dialogCount,
    busyCount: candidate.busyCount,
  }
}

function directLabelBatchFields(
  valuesByLabel: Record<string, FormValueInput> | undefined,
): Array<{ kind: 'auto'; fieldLabel: string; value: string | boolean }> | null {
  const entries = Object.entries(valuesByLabel ?? {})
  if (entries.length === 0) return null
  const fields: Array<{ kind: 'auto'; fieldLabel: string; value: string | boolean }> = []
  for (const [fieldLabel, value] of entries) {
    if (typeof value !== 'string' && typeof value !== 'boolean') return null
    fields.push({ kind: 'auto', fieldLabel, value })
  }
  return fields
}

async function waitForDeferredBatchUpdate(
  session: Session,
  startRevision: number,
  wait: UpdateWaitResult,
): Promise<void> {
  if (wait.status !== 'acknowledged' || session.updateRevision > startRevision) return
  await waitForUiCondition(session, () => session.updateRevision > startRevision, 750)
}

async function waitForBatchFieldReadback(session: Session, fields: ResolvedFillFieldInput[]): Promise<void> {
  await waitForUiCondition(session, () => {
    const a11y = sessionA11y(session)
    if (!a11y) return false
    return fields.every(field => batchFieldReadbackMatches(a11y, field))
  }, 1500)
}

function batchFieldReadbackMatches(a11y: A11yNode, field: ResolvedFillFieldInput): boolean {
  switch (field.kind) {
    case 'text': {
      const matches = findNodes(a11y, { name: field.fieldLabel, role: 'textbox' })
      return matches.some(match => normalizeLookupKey(match.value ?? '') === normalizeLookupKey(field.value))
    }
    case 'choice': {
      const directMatches = [
        ...findNodes(a11y, { name: field.fieldLabel, role: 'combobox' }),
        ...findNodes(a11y, { name: field.fieldLabel, role: 'textbox' }),
        ...findNodes(a11y, { name: field.fieldLabel, role: 'button' }),
      ]
      if (directMatches.length === 0) return true
      return directMatches.some(match => normalizeLookupKey(match.value ?? '') === normalizeLookupKey(field.value))
    }
    case 'toggle':
      return true
    case 'file': {
      const matches = [
        ...findNodes(a11y, { name: field.fieldLabel, role: 'textbox' }),
        ...findNodes(a11y, { name: field.fieldLabel, role: 'button' }),
      ]
      return matches.length === 0 || matches.some(match => Boolean(match.value && match.value.trim()))
    }
  }
}

async function executeBatchAction(
  session: Session,
  action: BatchAction,
  detail: ResponseDetail,
  includeSteps: boolean,
): Promise<StepExecutionResult> {
  switch (action.type) {
    case 'click': {
      const before = sessionA11y(session)
      const resolved = await resolveClickLocation(session, {
        x: action.x,
        y: action.y,
        filter: {
          id: action.id,
          role: action.role,
          name: action.name,
          text: action.text,
          contextText: action.contextText,
          value: action.value,
          checked: action.checked,
          disabled: action.disabled,
          focused: action.focused,
          selected: action.selected,
          expanded: action.expanded,
          invalid: action.invalid,
          required: action.required,
          busy: action.busy,
        },
        index: action.index,
        fullyVisible: action.fullyVisible,
        maxRevealSteps: action.maxRevealSteps,
        revealTimeoutMs: action.revealTimeoutMs,
      })
      if (!resolved.ok) throw new Error(resolved.error)

      const wait = await sendClick(session, resolved.value.x, resolved.value.y, action.timeoutMs)
      const targetSummary = resolved.value.target
        ? `Clicked ${describeFormattedNode(resolved.value.target)} at (${resolved.value.x}, ${resolved.value.y}).`
        : `Clicked at (${resolved.value.x}, ${resolved.value.y}).`
      let postWaitSummary: string | undefined
      let postWaitCompact: Record<string, unknown> | undefined
      if (action.waitFor) {
        const postWait = await waitForSemanticCondition(session, {
          filter: {
            id: action.waitFor.id,
            role: action.waitFor.role,
            name: action.waitFor.name,
            text: action.waitFor.text,
            contextText: action.waitFor.contextText,
            value: action.waitFor.value,
            checked: action.waitFor.checked,
            disabled: action.waitFor.disabled,
            focused: action.waitFor.focused,
            selected: action.waitFor.selected,
            expanded: action.waitFor.expanded,
            invalid: action.waitFor.invalid,
            required: action.waitFor.required,
            busy: action.waitFor.busy,
          },
          present: action.waitFor.present ?? true,
          timeoutMs: action.waitFor.timeoutMs ?? 10_000,
        })
        if (!postWait.ok) {
          throw new Error(`Post-click wait failed after ${targetSummary.toLowerCase()}\n${postWait.error}`)
        }
        postWaitSummary = `Post-click ${waitConditionSuccessLine(postWait.value)}`
        postWaitCompact = waitConditionCompact(postWait.value)
      }
      return {
        summary: [targetSummary, postActionSummary(session, before, wait, detail), postWaitSummary].filter(Boolean).join('\n'),
        compact: {
          at: { x: resolved.value.x, y: resolved.value.y },
          ...(resolved.value.target ? { target: compactNodeReference(resolved.value.target), revealSteps: resolved.value.revealAttempts ?? 0 } : {}),
          ...waitStatusPayload(wait),
          ...(postWaitCompact ? { postWait: postWaitCompact } : {}),
        },
      }
    }
    case 'type': {
      const before = sessionA11y(session)
      const wait = await sendType(session, action.text, action.timeoutMs)
      return {
        summary: `Typed "${action.text}".\n${postActionSummary(session, before, wait, detail)}`,
        compact: {
          ...compactTextValue(action.text),
          ...waitStatusPayload(wait),
        },
      }
    }
    case 'key': {
      const before = sessionA11y(session)
      const wait = await sendKey(
        session,
        action.key,
        { shift: action.shift, ctrl: action.ctrl, meta: action.meta, alt: action.alt },
        action.timeoutMs,
      )
      return {
        summary: `Pressed ${formatKeyCombo(action.key, action)}.\n${postActionSummary(session, before, wait, detail)}`,
        compact: {
          key: formatKeyCombo(action.key, action),
          ...waitStatusPayload(wait),
        },
      }
    }
    case 'upload_files': {
      const before = sessionA11y(session)
      const wait = await sendFileUpload(session, action.paths, {
        click: action.x !== undefined && action.y !== undefined ? { x: action.x, y: action.y } : undefined,
        fieldLabel: action.fieldLabel,
        exact: action.exact,
        strategy: action.strategy,
        drop: action.dropX !== undefined && action.dropY !== undefined ? { x: action.dropX, y: action.dropY } : undefined,
      }, action.timeoutMs ?? 8_000)
      return {
        summary: `Uploaded ${action.paths.length} file(s).\n${postActionSummary(session, before, wait, detail)}`,
        compact: {
          fileCount: action.paths.length,
          ...(action.fieldLabel ? { fieldLabel: action.fieldLabel } : {}),
          ...(action.strategy ? { strategy: action.strategy } : {}),
          ...waitStatusPayload(wait),
          ...(action.fieldLabel ? { readback: fieldStatePayload(session, action.fieldLabel) } : {}),
        },
      }
    }
    case 'pick_listbox_option': {
      const before = sessionA11y(session)
      const wait = await sendListboxPick(session, action.label, {
        exact: action.exact,
        open: action.openX !== undefined && action.openY !== undefined ? { x: action.openX, y: action.openY } : undefined,
        fieldLabel: action.fieldLabel,
        query: action.query,
      }, action.timeoutMs)
      const summary = postActionSummary(session, before, wait, detail)
      const fieldSummary = action.fieldLabel ? summarizeFieldLabelState(session, action.fieldLabel) : undefined
      return {
        summary: [`Picked listbox option "${action.label}".`, fieldSummary, summary].filter(Boolean).join('\n'),
        compact: {
          label: action.label,
          ...(action.fieldLabel ? { fieldLabel: action.fieldLabel } : {}),
          ...waitStatusPayload(wait),
          ...(action.fieldLabel ? { readback: fieldStatePayload(session, action.fieldLabel) } : {}),
        },
      }
    }
    case 'select_option': {
      if (action.value === undefined && action.label === undefined && action.index === undefined) {
        throw new Error('select_option step requires at least one of value, label, or index')
      }
      const before = sessionA11y(session)
      const wait = await sendSelectOption(session, action.x, action.y, {
        value: action.value,
        label: action.label,
        index: action.index,
      }, action.timeoutMs)
      return {
        summary: `Selected option.\n${postActionSummary(session, before, wait, detail)}`,
        compact: {
          at: { x: action.x, y: action.y },
          ...(action.value !== undefined ? { value: action.value } : {}),
          ...(action.label !== undefined ? { label: action.label } : {}),
          ...(action.index !== undefined ? { index: action.index } : {}),
          ...waitStatusPayload(wait),
        },
      }
    }
    case 'set_checked': {
      const before = sessionA11y(session)
      const wait = await sendSetChecked(session, action.label, {
        checked: action.checked,
        exact: action.exact,
        controlType: action.controlType,
      }, action.timeoutMs)
      return {
        summary: `Set ${action.controlType ?? 'checkbox/radio'} "${action.label}" to ${String(action.checked ?? true)}.\n${postActionSummary(session, before, wait, detail)}`,
        compact: {
          label: action.label,
          checked: action.checked ?? true,
          ...(action.controlType ? { controlType: action.controlType } : {}),
          ...waitStatusPayload(wait),
        },
      }
    }
    case 'wheel': {
      const before = sessionA11y(session)
      const wait = await sendWheel(session, action.deltaY, {
        deltaX: action.deltaX,
        x: action.x,
        y: action.y,
      }, action.timeoutMs)
      return {
        summary: `Wheel delta (${action.deltaX ?? 0}, ${action.deltaY}).\n${postActionSummary(session, before, wait, detail)}`,
        compact: {
          deltaY: action.deltaY,
          ...(action.deltaX !== undefined ? { deltaX: action.deltaX } : {}),
          ...(action.x !== undefined && action.y !== undefined ? { at: { x: action.x, y: action.y } } : {}),
          ...waitStatusPayload(wait),
        },
      }
    }
    case 'wait_for': {
      if (!session.tree || !session.layout) throw new Error('Not connected. Call geometra_connect first.')
      const waited = await waitForSemanticCondition(session, {
        filter: {
          id: action.id,
          role: action.role,
          name: action.name,
          text: action.text,
          contextText: action.contextText,
          value: action.value,
          checked: action.checked,
          disabled: action.disabled,
          focused: action.focused,
          selected: action.selected,
          expanded: action.expanded,
          invalid: action.invalid,
          required: action.required,
          busy: action.busy,
        },
        present: action.present ?? true,
        timeoutMs: action.timeoutMs ?? 10_000,
      })
      if (!waited.ok) {
        throw new Error(waited.error)
      }
      if (!waited.value.present) {
        return {
          summary: waitConditionSuccessLine(waited.value),
          compact: waitConditionCompact(waited.value),
        }
      }
      if (detail === 'verbose') {
        return {
          summary: JSON.stringify(waited.value.matches, null, 2),
          compact: waitConditionCompact(waited.value),
        }
      }
      return {
        summary: waitConditionSuccessLine(waited.value),
        compact: waitConditionCompact(waited.value),
      }
    }
    case 'fill_fields': {
      const resolvedFields = resolveFillFieldInputs(session, action.fields)
      if (!resolvedFields.ok) throw new Error(resolvedFields.error)
      const steps: Array<Record<string, unknown>> = []
      for (let index = 0; index < resolvedFields.fields.length; index++) {
        const field = resolvedFields.fields[index]!
        const result = await executeFillField(session, field, detail)
        steps.push(detail === 'verbose'
          ? { index, kind: field.kind, ok: true, summary: result.summary }
          : { index, kind: field.kind, ok: true, ...result.compact })
      }
      return {
        summary: steps.map(step => String(step.summary ?? '')).filter(Boolean).join('\n'),
        compact: {
          fieldCount: resolvedFields.fields.length,
          ...(includeSteps ? { steps } : {}),
        },
      }
    }
  }
}

async function executeFillField(session: Session, field: ResolvedFillFieldInput, detail: ResponseDetail): Promise<StepExecutionResult> {
  switch (field.kind) {
    case 'text': {
      const before = sessionA11y(session)
      const wait = await sendFieldText(
        session,
        field.fieldLabel,
        field.value,
        { exact: field.exact, fieldId: field.fieldId },
        field.timeoutMs,
      )
      const fieldSummary = summarizeFieldLabelState(session, field.fieldLabel)
      return {
        summary: [
          `Filled text field "${field.fieldLabel}".`,
          fieldSummary,
          postActionSummary(session, before, wait, detail),
        ].filter(Boolean).join('\n'),
        compact: {
          ...(field.fieldId ? { fieldId: field.fieldId } : {}),
          fieldLabel: field.fieldLabel,
          ...compactTextValue(field.value),
          ...waitStatusPayload(wait),
          readback: fieldStatePayload(session, field.fieldLabel),
        },
      }
    }
    case 'choice': {
      const before = sessionA11y(session)
      const wait = await sendFieldChoice(
        session,
        field.fieldLabel,
        field.value,
        { exact: field.exact, query: field.query, choiceType: field.choiceType, fieldId: field.fieldId },
        field.timeoutMs,
      )
      const fieldSummary = summarizeFieldLabelState(session, field.fieldLabel)
      return {
        summary: [
          `Set choice field "${field.fieldLabel}" to "${field.value}".`,
          fieldSummary,
          postActionSummary(session, before, wait, detail),
        ].filter(Boolean).join('\n'),
        compact: {
          ...(field.fieldId ? { fieldId: field.fieldId } : {}),
          fieldLabel: field.fieldLabel,
          value: field.value,
          ...(field.choiceType ? { choiceType: field.choiceType } : {}),
          ...waitStatusPayload(wait),
          readback: fieldStatePayload(session, field.fieldLabel),
        },
      }
    }
    case 'toggle': {
      const before = sessionA11y(session)
      const wait = await sendSetChecked(
        session,
        field.label,
        { checked: field.checked, exact: field.exact, controlType: field.controlType },
        field.timeoutMs,
      )
      return {
        summary: `Set ${field.controlType ?? 'checkbox/radio'} "${field.label}" to ${String(field.checked ?? true)}.\n${postActionSummary(session, before, wait, detail)}`,
        compact: {
          label: field.label,
          checked: field.checked ?? true,
          ...(field.controlType ? { controlType: field.controlType } : {}),
          ...waitStatusPayload(wait),
        },
      }
    }
    case 'file': {
      const before = sessionA11y(session)
      const wait = await sendFileUpload(
        session,
        field.paths,
        { fieldLabel: field.fieldLabel, exact: field.exact },
        field.timeoutMs ?? 8_000,
      )
      const fieldSummary = summarizeFieldLabelState(session, field.fieldLabel)
      return {
        summary: [
          `Uploaded ${field.paths.length} file(s) to "${field.fieldLabel}".`,
          fieldSummary,
          postActionSummary(session, before, wait, detail),
        ].filter(Boolean).join('\n'),
        compact: {
          fieldLabel: field.fieldLabel,
          fileCount: field.paths.length,
          ...waitStatusPayload(wait),
          readback: fieldStatePayload(session, field.fieldLabel),
        },
      }
    }
  }
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true }
}

function hasNodeFilter(filter: NodeFilter): boolean {
  return Object.values(filter).some(value => value !== undefined)
}

function textMatches(haystack: string | undefined, needle: string | undefined): boolean {
  if (!needle) return true
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function sortA11yNodes(nodes: A11yNode[]): A11yNode[] {
  return [...nodes].sort((a, b) => {
    if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y
    if (a.bounds.x !== b.bounds.x) return a.bounds.x - b.bounds.x
    return a.path.length - b.path.length
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function pathStartsWith(path: number[], prefix: number[]): boolean {
  if (prefix.length > path.length) return false
  for (let index = 0; index < prefix.length; index++) {
    if (path[index] !== prefix[index]) return false
  }
  return true
}

function namedAncestors(root: A11yNode, path: number[]): A11yNode[] {
  const out: A11yNode[] = []
  let current: A11yNode = root
  for (const index of path) {
    out.push(current)
    if (!current.children[index]) break
    current = current.children[index]!
  }
  return out
}

function collectDescendants(node: A11yNode, predicate: (candidate: A11yNode) => boolean): A11yNode[] {
  const out: A11yNode[] = []
  function walk(current: A11yNode) {
    for (const child of current.children) {
      if (predicate(child)) out.push(child)
      walk(child)
    }
  }
  walk(node)
  return out
}

function promptContext(root: A11yNode, node: A11yNode): string | undefined {
  const ancestors = namedAncestors(root, node.path)
  const normalizedName = (node.name ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

  for (let index = ancestors.length - 1; index >= 0; index--) {
    const ancestor = ancestors[index]!
    const grouped = collectDescendants(ancestor, candidate =>
      candidate.role === 'button' || candidate.role === 'radio' || candidate.role === 'checkbox',
    ).length >= 2
    if (!grouped && ancestor.role !== 'group' && ancestor.role !== 'form' && ancestor.role !== 'dialog') continue

    const best = collectDescendants(
      ancestor,
      candidate =>
        (candidate.role === 'heading' || candidate.role === 'text') &&
        !!truncateInlineText(candidate.name, 120) &&
        !pathStartsWith(candidate.path, node.path),
    )
      .filter(candidate => candidate.bounds.y <= node.bounds.y + 8)
      .map(candidate => {
        const text = truncateInlineText(candidate.name, 120)
        if (!text) return null
        if (text.toLowerCase() === normalizedName) return null
        const dy = Math.max(0, node.bounds.y - candidate.bounds.y)
        const dx = Math.abs(node.bounds.x - candidate.bounds.x)
        const headingBonus = candidate.role === 'heading' ? -32 : 0
        return { text, score: dy * 4 + dx + headingBonus }
      })
      .filter((candidate): candidate is { text: string; score: number } => !!candidate)
      .sort((a, b) => a.score - b.score)[0]
    if (best?.text) return best.text
  }

  return undefined
}

function sectionContext(root: A11yNode, node: A11yNode): string | undefined {
  const ancestors = namedAncestors(root, node.path)
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const ancestor = ancestors[index]!
    if (ancestor.role === 'form' || ancestor.role === 'dialog' || ancestor.role === 'main' || ancestor.role === 'navigation' || ancestor.role === 'region') {
      const name = truncateInlineText(ancestor.name, 80)
      if (name) return name
    }
  }
  return undefined
}

function nodeContextText(root: A11yNode, node: A11yNode): string | undefined {
  return [promptContext(root, node), sectionContext(root, node)].filter(Boolean).join(' | ') || undefined
}

function nodeMatchesFilter(node: A11yNode, filter: NodeFilter, contextText?: string): boolean {
  if (filter.id && nodeIdForPath(node.path) !== filter.id) return false
  if (filter.role && node.role !== filter.role) return false
  if (!textMatches(node.name, filter.name)) return false
  if (!textMatches(node.value, filter.value)) return false
  if (
    filter.text &&
    !textMatches(
      `${node.name ?? ''} ${node.value ?? ''} ${node.validation?.error ?? ''} ${node.validation?.description ?? ''}`.trim(),
      filter.text,
    )
  ) return false
  if (!textMatches(contextText, filter.contextText)) return false
  if (filter.checked !== undefined && node.state?.checked !== filter.checked) return false
  if (filter.disabled !== undefined && (node.state?.disabled ?? false) !== filter.disabled) return false
  if (filter.focused !== undefined && (node.state?.focused ?? false) !== filter.focused) return false
  if (filter.selected !== undefined && (node.state?.selected ?? false) !== filter.selected) return false
  if (filter.expanded !== undefined && (node.state?.expanded ?? false) !== filter.expanded) return false
  if (filter.invalid !== undefined && (node.state?.invalid ?? false) !== filter.invalid) return false
  if (filter.required !== undefined && (node.state?.required ?? false) !== filter.required) return false
  if (filter.busy !== undefined && (node.state?.busy ?? false) !== filter.busy) return false
  return true
}

export function findNodes(node: A11yNode, filter: NodeFilter): A11yNode[] {
  const matches: A11yNode[] = []

  function walk(n: A11yNode) {
    const contextText = filter.contextText ? nodeContextText(node, n) : undefined
    if (nodeMatchesFilter(n, filter, contextText) && hasNodeFilter(filter)) matches.push(n)
    for (const child of n.children) walk(child)
  }

  walk(node)
  return matches
}

function summarizeFieldLabelState(session: Session, fieldLabel: string): string | undefined {
  const payload = fieldStatePayload(session, fieldLabel)
  if (!payload) return undefined
  const parts = [`Field "${fieldLabel}"`]
  if (payload.role) parts.push(`role=${String(payload.role)}`)
  if (payload.value) parts.push(`value=${JSON.stringify(payload.value)}`)
  if (payload.valueLength) parts.push(`valueLength=${String(payload.valueLength)}`)
  if (payload.state) parts.push(`state=${JSON.stringify(payload.state)}`)
  if (payload.error) parts.push(`error=${JSON.stringify(payload.error)}`)
  return parts.join(' ')
}

function formatNode(
  node: A11yNode,
  root: A11yNode,
  viewport: { width: number; height: number },
): FormattedNodePayload {
  const visibleLeft = Math.max(0, node.bounds.x)
  const visibleTop = Math.max(0, node.bounds.y)
  const visibleRight = Math.min(viewport.width, node.bounds.x + node.bounds.width)
  const visibleBottom = Math.min(viewport.height, node.bounds.y + node.bounds.height)
  const hasVisibleIntersection = visibleRight > visibleLeft && visibleBottom > visibleTop
  const fullyVisible =
    node.bounds.x >= 0 &&
    node.bounds.y >= 0 &&
    node.bounds.x + node.bounds.width <= viewport.width &&
    node.bounds.y + node.bounds.height <= viewport.height
  const centerX = hasVisibleIntersection
    ? Math.round((visibleLeft + visibleRight) / 2)
    : Math.round(Math.min(Math.max(node.bounds.x + node.bounds.width / 2, 0), viewport.width))
  const centerY = hasVisibleIntersection
    ? Math.round((visibleTop + visibleBottom) / 2)
    : Math.round(Math.min(Math.max(node.bounds.y + node.bounds.height / 2, 0), viewport.height))
  const revealDeltaX = Math.round(node.bounds.x + node.bounds.width / 2 - viewport.width / 2)
  const revealDeltaY = Math.round(node.bounds.y + node.bounds.height / 2 - viewport.height / 2)
  const prompt = promptContext(root, node)
  const section = sectionContext(root, node)
  return {
    id: nodeIdForPath(node.path),
    role: node.role,
    name: node.name,
    ...(node.value ? { value: node.value } : {}),
    ...(prompt || section ? { context: { ...(prompt ? { prompt } : {}), ...(section ? { section } : {}) } } : {}),
    bounds: node.bounds,
    visibleBounds: {
      x: visibleLeft,
      y: visibleTop,
      width: Math.max(0, visibleRight - visibleLeft),
      height: Math.max(0, visibleBottom - visibleTop),
    },
    center: {
      x: centerX,
      y: centerY,
    },
    visibility: {
      intersectsViewport: hasVisibleIntersection,
      fullyVisible,
      offscreenAbove: node.bounds.y + node.bounds.height <= 0,
      offscreenBelow: node.bounds.y >= viewport.height,
      offscreenLeft: node.bounds.x + node.bounds.width <= 0,
      offscreenRight: node.bounds.x >= viewport.width,
    },
    scrollHint: {
      status: fullyVisible ? 'visible' : hasVisibleIntersection ? 'partial' : 'offscreen',
      revealDeltaX,
      revealDeltaY,
    },
    focusable: node.focusable,
    ...(node.state && Object.keys(node.state).length > 0 ? { state: node.state } : {}),
    ...(node.validation && Object.keys(node.validation).length > 0 ? { validation: node.validation } : {}),
    path: node.path,
  }
}

function formatKeyCombo(key: string, mods?: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }): string {
  const parts: string[] = []
  if (mods?.ctrl) parts.push('Ctrl')
  if (mods?.meta) parts.push('Cmd')
  if (mods?.alt) parts.push('Alt')
  if (mods?.shift) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}
