import { box, signal, text, type UIElement } from '@geometra/core/node'
import { createServer, type TexturaServer } from '@geometra/server'
import {
  createMemoryHistory,
  createRouter,
  link,
  renderMatchedOutlet,
  type RouteNode,
} from '@geometra/router'
import {
  button,
  checkbox,
  commandPalette,
  dataTable,
  dialog,
  list,
  selectControl,
  toast,
} from '@geometra/ui'

type ThemeKey = 'midnight' | 'ember' | 'frost'

type OverviewData = {
  kpis: Array<{ label: string; value: string; detail: string }>
  releases: Array<Record<string, string>>
}

type QueueData = {
  commands: Array<{ id: string; label: string; shortcut?: string }>
  rows: Array<Record<string, string>>
}

type SettingsData = {
  theme: ThemeKey
  compactMode: boolean
}

type SettingsSubmission = {
  theme?: ThemeKey
  compactMode?: boolean
}

type SettingsActionResult = {
  theme: ThemeKey
  compactMode: boolean
  savedAt: string
}

const THEMES = {
  midnight: {
    appBg: '#07131f',
    panelBg: '#0d2234',
    panelAlt: '#102a41',
    border: '#1f415e',
    text: '#f8fafc',
    muted: '#8ca6c0',
    accent: '#38bdf8',
    accentSoft: '#082f49',
    success: '#22c55e',
  },
  ember: {
    appBg: '#1b0f0b',
    panelBg: '#2a1712',
    panelAlt: '#3a2018',
    border: '#5a2f22',
    text: '#fff7ed',
    muted: '#f7c7aa',
    accent: '#fb923c',
    accentSoft: '#431407',
    success: '#facc15',
  },
  frost: {
    appBg: '#07151d',
    panelBg: '#0d2431',
    panelAlt: '#123241',
    border: '#26586f',
    text: '#f0fdfa',
    muted: '#9ad4df',
    accent: '#2dd4bf',
    accentSoft: '#11353d',
    success: '#34d399',
  },
} as const

const THEME_LABELS: Record<ThemeKey, string> = {
  midnight: 'Midnight Ops',
  ember: 'Warm Ember',
  frost: 'Frost Glass',
}

const FEATURE_BULLETS = [
  'Server-side memory router',
  'Thin WebSocket canvas client',
  'Route loaders and actions',
  'UI primitives in one geometry tree',
]

const connectedClients = signal(0)
const savedTheme = signal<ThemeKey>('midnight')
const draftTheme = signal<ThemeKey>(savedTheme.peek())
const compactMode = signal(false)
const draftCompactMode = signal(compactMode.peek())
const themeMenuOpen = signal(false)
const saveDialogOpen = signal(false)
const toastMessage = signal(
  'Canvas is only the paint/input surface. Router state, loaders, and actions live on the server.',
)

const releases = signal([
  { service: 'Edge API', channel: 'stable', latency: '42 ms', status: 'Healthy' },
  { service: 'Checkout', channel: 'canary', latency: '68 ms', status: 'Watch' },
  { service: 'Notifications', channel: 'stable', latency: '25 ms', status: 'Healthy' },
  { service: 'Search', channel: 'stable', latency: '51 ms', status: 'Healthy' },
  { service: 'Billing', channel: 'canary', latency: '74 ms', status: 'Watch' },
  { service: 'Identity', channel: 'stable', latency: '39 ms', status: 'Healthy' },
])

const approvalQueue = signal([
  { service: 'Payments', severity: 'P1', owner: 'SRE West', status: 'Waiting' },
  { service: 'Edge cache', severity: 'P2', owner: 'Platform', status: 'Needs review' },
  { service: 'Auth sessions', severity: 'P1', owner: 'Security', status: 'Escalated' },
  { service: 'Catalog sync', severity: 'P3', owner: 'Data', status: 'Waiting' },
  { service: 'Tax engine', severity: 'P2', owner: 'FinOps', status: 'Waiting' },
  { service: 'EU checkout', severity: 'P1', owner: 'SRE East', status: 'Escalated' },
])

const history = createMemoryHistory({ initialEntries: ['/'] })
let server: TexturaServer | null = null
let lastPathname = history.location.pathname

function palette() {
  return THEMES[savedTheme.value]
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function announce(message: string): void {
  toastMessage.set(message)
}

function currentRouteLabel(pathname: string): string {
  if (pathname === '/queue') return 'Queue'
  if (pathname === '/settings') return 'Settings'
  return 'Overview'
}

function getLoaderData<T>(key: string): T | undefined {
  return router.getState().loaderData[key] as T | undefined
}

function getSettingsAction(): SettingsActionResult | undefined {
  return router.getState().actionData.settings as SettingsActionResult | undefined
}

function panel(title: string, description: string, children: UIElement[]): UIElement {
  const theme = palette()
  return box(
    {
      flexDirection: 'column',
      gap: 10,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.panelBg,
    },
    [
      box({ flexDirection: 'column', gap: 3 }, [
        text({
          text: title,
          font: 'bold 15px Inter, system-ui',
          lineHeight: 20,
          color: theme.text,
        }),
        text({
          text: description,
          font: '12px Inter, system-ui',
          lineHeight: 17,
          color: theme.muted,
        }),
      ]),
      ...children,
    ],
  )
}

function metricCard(metric: { label: string; value: string; detail: string }): UIElement {
  const theme = palette()
  return box(
    {
      flexDirection: 'column',
      gap: 5,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.panelAlt,
      flexGrow: 1,
      minWidth: 0,
    },
    [
      text({
        text: metric.label,
        font: '12px Inter, system-ui',
        lineHeight: 16,
        color: theme.muted,
      }),
      text({
        text: metric.value,
        font: 'bold 24px Inter, system-ui',
        lineHeight: 30,
        color: theme.text,
      }),
      text({
        text: metric.detail,
        font: '12px Inter, system-ui',
        lineHeight: 16,
        color: theme.accent,
      }),
    ],
  )
}

function renderOverviewPage(): UIElement {
  const data = getLoaderData<OverviewData>('overview')
  if (!data) {
    return panel('Loading overview', 'Resolving route loader on the server.', [
      text({
        text: 'Waiting for route data...',
        font: '13px Inter, system-ui',
        lineHeight: 18,
        color: palette().muted,
      }),
    ])
  }

  return box(
    {
      flexDirection: 'column',
      gap: 14,
    },
    [
      box({ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, data.kpis.map(metricCard)),
      panel(
        'Deploy health',
        compactMode.value ? 'Compact mode trims the table for faster operator scans.' : 'Recent release health streamed from server state.',
        [
          dataTable(
            [
              { key: 'service', header: 'Service' },
              { key: 'channel', header: 'Channel' },
              { key: 'latency', header: 'Latency' },
              { key: 'status', header: 'Status' },
            ],
            data.releases,
            {
              ariaLabel: 'Release health',
              onRowClick: (rowIndex) => {
                const row = data.releases[rowIndex]
                if (row) announce(`Focused ${row.service} (${row.status}) from the overview table.`)
              },
            },
          ),
        ],
      ),
    ],
  )
}

function handleQueueCommand(id: string): void {
  switch (id) {
    case 'approve-green': {
      const current = approvalQueue.peek()
      const [first, ...rest] = current
      if (first) {
        approvalQueue.set(rest)
        announce(`Approved ${first.service}. Queue data revalidated on the server.`)
      } else {
        announce('Queue already empty. Nothing to approve.')
      }
      void router.revalidate()
      return
    }
    case 'ship-hotfix': {
      releases.set([
        {
          service: 'Checkout hotfix',
          channel: 'hotfix',
          latency: '37 ms',
          status: 'Promoted',
        },
        ...releases.peek(),
      ].slice(0, 8))
      announce('Promoted a hotfix and refreshed overview release health.')
      void router.revalidate()
      return
    }
    case 'open-settings': {
      announce('Jumping to Settings via router.navigate().')
      void router.navigate('/settings')
      return
    }
    default:
      return
  }
}

function renderQueuePage(): UIElement {
  const data = getLoaderData<QueueData>('queue')
  if (!data) {
    return panel('Loading queue', 'Fetching queue rows from route loader.', [
      text({
        text: 'Waiting for queue data...',
        font: '13px Inter, system-ui',
        lineHeight: 18,
        color: palette().muted,
      }),
    ])
  }

  return box(
    {
      flexDirection: 'column',
      gap: 14,
    },
    [
      panel('Quick actions', 'Commands mutate server state and then revalidate the active route.', [
        commandPalette(data.commands, {
          onSelect: handleQueueCommand,
        }),
      ]),
      panel('Approval queue', 'Click any row to inspect an incident lane.', [
        dataTable(
          [
            { key: 'service', header: 'Service' },
            { key: 'severity', header: 'Severity' },
            { key: 'owner', header: 'Owner' },
            { key: 'status', header: 'Status' },
          ],
          data.rows,
          {
            ariaLabel: 'Approval queue',
            onRowClick: (rowIndex) => {
              const row = data.rows[rowIndex]
              if (row) announce(`Selected ${row.service} (${row.severity}) routed to ${row.owner}.`)
            },
          },
        ),
      ]),
    ],
  )
}

function renderSettingsPage(): UIElement {
  const data = getLoaderData<SettingsData>('settings')
  const saveResult = getSettingsAction()
  const dirty =
    draftTheme.value !== savedTheme.value ||
    draftCompactMode.value !== compactMode.value

  return box(
    {
      flexDirection: 'column',
      gap: 14,
    },
    [
      panel(
        'Operator preferences',
        data
          ? `Saved theme: ${THEME_LABELS[data.theme]}. Compact mode: ${data.compactMode ? 'on' : 'off'}.`
          : 'Loading saved preferences from the route loader.',
        [
          selectControl({
            open: themeMenuOpen.value,
            value: draftTheme.value,
            placeholder: 'Theme',
            onToggle: () => themeMenuOpen.set(!themeMenuOpen.peek()),
            onChange: (value) => {
              draftTheme.set(value as ThemeKey)
              themeMenuOpen.set(false)
            },
            options: [
              { value: 'midnight', label: THEME_LABELS.midnight },
              { value: 'ember', label: THEME_LABELS.ember },
              { value: 'frost', label: THEME_LABELS.frost },
            ],
          }),
          checkbox('Compact tables across routes', {
            checked: draftCompactMode.value,
            onChange: (checked) => draftCompactMode.set(checked),
          }),
          box({ flexDirection: 'row', gap: 10, alignItems: 'center' }, [
            button(dirty ? 'Review changes' : 'Saved', () => {
              if (!dirty) {
                announce('Settings already match the saved server state.')
                return
              }
              saveDialogOpen.set(true)
            }),
            text({
              text: saveResult
                ? `Last saved at ${saveResult.savedAt}`
                : 'Route action will save and revalidate on the server.',
              font: '12px Inter, system-ui',
              lineHeight: 16,
              color: palette().muted,
            }),
          ]),
        ],
      ),
      saveDialogOpen.value
        ? dialog(
            'Apply server-side preferences',
            `Theme: ${THEME_LABELS[draftTheme.value]} | Compact mode: ${draftCompactMode.value ? 'on' : 'off'}`,
            [
              button('Apply', () => {
                saveDialogOpen.set(false)
                void router.submitAction('settings', {
                  method: 'POST',
                  data: {
                    theme: draftTheme.value,
                    compactMode: draftCompactMode.value,
                  } satisfies SettingsSubmission,
                })
              }),
              button('Cancel', () => {
                saveDialogOpen.set(false)
              }),
            ],
          )
        : box({ height: 0 }, []),
    ],
  )
}

function navItem(to: string, label: string, subtitle: string): UIElement {
  const theme = palette()
  const active = router.isActive(to)
  return link(
    {
      to,
      router,
      flexDirection: 'column',
      gap: 2,
      padding: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: active ? theme.accent : theme.border,
      backgroundColor: active ? theme.accentSoft : theme.panelBg,
      semantic: {
        ariaLabel: label,
      },
    },
    [
      text({
        text: label,
        font: 'bold 13px Inter, system-ui',
        lineHeight: 18,
        color: theme.text,
      }),
      text({
        text: subtitle,
        font: '12px Inter, system-ui',
        lineHeight: 16,
        color: active ? theme.text : theme.muted,
      }),
    ],
  )
}

function renderShell(outlet: UIElement | null): UIElement {
  const state = router.getState()
  const theme = palette()
  const routeLabel = currentRouteLabel(state.location.pathname)
  const banner =
    state.error
      ? toast(state.error.message, { title: 'Router error', variant: 'error' })
      : state.navigation !== 'idle'
        ? toast(
            state.submitting
              ? 'Route action in progress. The server will revalidate current loader data next.'
              : 'Router transition is running on the server and streaming updates to the thin client.',
            {
              title: `Router ${state.navigation}`,
              variant: 'warning',
            },
          )
        : toastMessage.value
          ? toast(toastMessage.value, {
              title: 'Live stack',
              variant: 'info',
              onDismiss: () => toastMessage.set(''),
            })
          : box({ height: 0 }, [])

  return box(
    {
      flexDirection: 'row',
      gap: 18,
      padding: 18,
      width: 980,
      height: 640,
      backgroundColor: theme.appBg,
    },
    [
      box(
        {
          width: 250,
          flexDirection: 'column',
          gap: 14,
          padding: 16,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.panelBg,
        },
        [
          box({ flexDirection: 'column', gap: 4 }, [
            text({
              text: 'Singularity Control',
              font: 'bold 18px Inter, system-ui',
              lineHeight: 24,
              color: theme.text,
            }),
            text({
              text: `${connectedClients.value} client${connectedClients.value === 1 ? '' : 's'} connected`,
              font: '12px Inter, system-ui',
              lineHeight: 16,
              color: theme.muted,
            }),
          ]),
          box({ flexDirection: 'column', gap: 8 }, [
            navItem('/', 'Overview', 'Live deploy health'),
            navItem('/queue', 'Queue', 'Command-driven approvals'),
            navItem('/settings', 'Settings', 'Action-backed preferences'),
          ]),
          panel('Why this example matters', 'The same route tree drives layout, interaction, and transport.', [
            list(FEATURE_BULLETS),
          ]),
        ],
      ),
      box(
        {
          flexGrow: 1,
          flexDirection: 'column',
          gap: 14,
          padding: 16,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.panelBg,
        },
        [
          box(
            {
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            },
            [
              box({ flexDirection: 'column', gap: 3 }, [
                text({
                  text: routeLabel,
                  font: 'bold 20px Inter, system-ui',
                  lineHeight: 26,
                  color: theme.text,
                }),
                text({
                  text: `Path: ${state.location.pathname} | Theme: ${THEME_LABELS[savedTheme.value]}`,
                  font: '12px Inter, system-ui',
                  lineHeight: 16,
                  color: theme.muted,
                }),
              ]),
              box({ flexDirection: 'column', alignItems: 'flex-end', gap: 3 }, [
                text({
                  text: `Navigation: ${state.navigation}`,
                  font: 'bold 12px Inter, system-ui',
                  lineHeight: 16,
                  color: state.navigation === 'idle' ? theme.success : theme.accent,
                }),
                text({
                  text: compactMode.value ? 'Compact mode enabled' : 'Comfortable table spacing',
                  font: '12px Inter, system-ui',
                  lineHeight: 16,
                  color: theme.muted,
                }),
              ]),
            ],
          ),
          banner,
          outlet ?? panel('No route matched', 'The server-side router could not resolve this path.', []),
        ],
      ),
    ],
  )
}

const routes: RouteNode<UIElement>[] = [
  {
    id: 'shell',
    render: ({ outlet }) => renderShell(outlet),
    children: [
      {
        id: 'overview',
        path: '/',
        loader: async () => {
          await delay(70)
          const visibleReleases = releases.peek().slice(0, compactMode.peek() ? 4 : 6)
          return {
            kpis: [
              {
                label: 'Connected clients',
                value: String(connectedClients.peek()),
                detail: 'WS sessions on this server',
              },
              {
                label: 'Approval queue',
                value: String(approvalQueue.peek().length),
                detail: 'Actionable review items',
              },
              {
                label: 'Theme',
                value: THEME_LABELS[savedTheme.peek()],
                detail: compactMode.peek() ? 'compact tables on' : 'comfortable density',
              },
            ],
            releases: visibleReleases,
          } satisfies OverviewData
        },
        render: () => renderOverviewPage(),
      },
      {
        id: 'queue',
        path: 'queue',
        loader: async () => {
          await delay(90)
          return {
            commands: [
              { id: 'approve-green', label: 'Approve next green rollout', shortcut: 'A' },
              { id: 'ship-hotfix', label: 'Promote checkout hotfix', shortcut: 'H' },
              { id: 'open-settings', label: 'Open settings route', shortcut: 'S' },
            ],
            rows: approvalQueue.peek().slice(0, compactMode.peek() ? 4 : 6),
          } satisfies QueueData
        },
        render: () => renderQueuePage(),
      },
      {
        id: 'settings',
        path: 'settings',
        loader: async () => {
          await delay(60)
          return {
            theme: savedTheme.peek(),
            compactMode: compactMode.peek(),
          } satisfies SettingsData
        },
        action: async ({ submission }) => {
          await delay(80)
          const data = (submission.data ?? {}) as SettingsSubmission
          const nextTheme = data.theme ?? savedTheme.peek()
          const nextCompactMode = data.compactMode ?? compactMode.peek()
          savedTheme.set(nextTheme)
          draftTheme.set(nextTheme)
          compactMode.set(nextCompactMode)
          draftCompactMode.set(nextCompactMode)
          themeMenuOpen.set(false)
          announce(`Saved ${THEME_LABELS[nextTheme]} with compact mode ${nextCompactMode ? 'on' : 'off'}.`)
          return {
            theme: nextTheme,
            compactMode: nextCompactMode,
            savedAt: new Date().toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
            }),
          } satisfies SettingsActionResult
        },
        render: () => renderSettingsPage(),
      },
    ],
  },
]

const router = createRouter<UIElement>({
  routes,
  history,
})

router.subscribe((state) => {
  if (state.location.pathname !== lastPathname) {
    lastPathname = state.location.pathname
    themeMenuOpen.set(false)
    saveDialogOpen.set(false)
    draftTheme.set(savedTheme.peek())
    draftCompactMode.set(compactMode.peek())
  }
  server?.update()
})

function view(): UIElement {
  const state = router.getState()
  if (!state.matches) {
    return panel('Not found', 'No route matched this path.', [])
  }
  return renderMatchedOutlet(state.matches, state.location.pathname) ?? panel('Empty route', 'Route rendered no UI.', [])
}

server = await createServer(view, {
  port: 3200,
  width: 980,
  height: 640,
  onConnection: () => {
    connectedClients.set(connectedClients.peek() + 1)
    server?.update()
    return { accepted: true }
  },
  onDisconnect: () => {
    connectedClients.set(Math.max(0, connectedClients.peek() - 1))
    server?.update()
  },
})

router.start()

console.log(`
  Geometra Full-Stack Dashboard
  ─────────────────────────────
  Server: ws://localhost:3200

  Run the client with:
    cd demos/full-stack-dashboard
    npm run client
`)
