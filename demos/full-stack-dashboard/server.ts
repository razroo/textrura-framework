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
  commandPalette,
  dataTable,
  dialog,
  list,
  toast,
} from '@geometra/ui'

type ThemeKey = 'midnight' | 'ember' | 'frost'

type ReleaseRow = {
  service: string
  channel: string
  latency: string
  status: string
}

type QueueRow = {
  service: string
  severity: string
  owner: string
  status: string
}

type OverviewData = {
  releases: ReleaseRow[]
}

type QueueData = {
  commands: Array<{ id: string; label: string; shortcut?: string }>
  rows: QueueRow[]
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
const serverPort = Number.parseInt(process.env.GEOMETRA_FULL_STACK_PORT ?? '3200', 10)
const clientOrigin = process.env.GEOMETRA_FULL_STACK_CLIENT_ORIGIN ?? 'http://localhost:5173/'

function palette() {
  return THEMES[savedTheme.value]
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function rerender(): void {
  server?.update()
}

function announce(message: string): void {
  toastMessage.set(message)
  rerender()
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
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.panelAlt,
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
      minWidth: 160,
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

function statBadge(
  label: string,
  value: string,
  tone: 'neutral' | 'accent' | 'success' = 'neutral',
): UIElement {
  const theme = palette()
  const valueColor =
    tone === 'success'
      ? theme.success
      : tone === 'accent'
        ? theme.accent
        : theme.text

  return box(
    {
      flexDirection: 'column',
      gap: 2,
      minWidth: 132,
      paddingLeft: 12,
      paddingRight: 12,
      paddingTop: 10,
      paddingBottom: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tone === 'neutral' ? theme.border : valueColor,
      backgroundColor: theme.panelBg,
    },
    [
      text({
        text: label,
        font: '11px Inter, system-ui',
        lineHeight: 14,
        color: theme.muted,
      }),
      text({
        text: value,
        font: 'bold 13px Inter, system-ui',
        lineHeight: 18,
        color: valueColor,
      }),
    ],
  )
}

function metaChip(value: string): UIElement {
  const theme = palette()
  return box(
    {
      paddingLeft: 10,
      paddingRight: 10,
      paddingTop: 6,
      paddingBottom: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.panelBg,
    },
    [
      text({
        text: value,
        font: '11px Inter, system-ui',
        lineHeight: 14,
        color: theme.muted,
      }),
    ],
  )
}

function detailCard(title: string, body: string): UIElement {
  const theme = palette()
  return box(
    {
      flexDirection: 'column',
      gap: 6,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.panelBg,
      minWidth: 0,
      flexGrow: 1,
    },
    [
      text({
        text: title,
        font: 'bold 13px Inter, system-ui',
        lineHeight: 18,
        color: theme.text,
      }),
      text({
        text: body,
        font: '12px Inter, system-ui',
        lineHeight: 17,
        color: theme.muted,
      }),
    ],
  )
}

function queueHeaderCell(label: string): UIElement {
  return box({ flexGrow: 1 }, [
    text({
      text: label,
      font: 'bold 12px Inter, system-ui',
      lineHeight: 16,
      color: palette().muted,
    }),
  ])
}

function queueValueCell(value: string): UIElement {
  return box({ flexGrow: 1 }, [
    text({
      text: value,
      font: '13px Inter, system-ui',
      lineHeight: 18,
      color: palette().text,
    }),
  ])
}

function approvalQueueTable(rows: QueueData['rows']): UIElement {
  const theme = palette()
  return box(
    {
      flexDirection: 'column',
      gap: 0,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.panelBg,
      overflow: 'hidden',
    },
    [
      box(
        {
          flexDirection: 'row',
          gap: 12,
          paddingLeft: 14,
          paddingRight: 14,
          paddingTop: 12,
          paddingBottom: 10,
          backgroundColor: theme.panelAlt,
        },
        [
          queueHeaderCell('Service'),
          queueHeaderCell('Severity'),
          queueHeaderCell('Owner'),
          queueHeaderCell('Status'),
        ],
      ),
      ...rows.map((row) =>
        box(
          {
            flexDirection: 'row',
            gap: 12,
            paddingLeft: 14,
            paddingRight: 14,
            paddingTop: 10,
            paddingBottom: 10,
            cursor: 'pointer',
            onClick: () => {
              announce(`Selected ${row.service} (${row.severity}) routed to ${row.owner}.`)
            },
          },
          [
            queueValueCell(row.service),
            queueValueCell(row.severity),
            queueValueCell(row.owner),
            queueValueCell(row.status),
          ],
        ),
      ),
    ],
  )
}

function fieldCard(title: string, description: string, control: UIElement): UIElement {
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
      minWidth: 260,
    },
    [
      box({ flexDirection: 'column', gap: 3 }, [
        text({
          text: title,
          font: 'bold 13px Inter, system-ui',
          lineHeight: 18,
          color: theme.text,
        }),
        text({
          text: description,
          font: '12px Inter, system-ui',
          lineHeight: 17,
          color: theme.muted,
        }),
      ]),
      control,
    ],
  )
}

function optionButton(label: string, active: boolean, onClick: () => void): UIElement {
  const theme = palette()
  return box(
    {
      paddingLeft: 12,
      paddingRight: 12,
      paddingTop: 8,
      paddingBottom: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: active ? theme.accent : theme.border,
      backgroundColor: active ? theme.accentSoft : theme.panelBg,
      cursor: 'pointer',
      onClick: () => {
        onClick()
        rerender()
      },
    },
    [
      text({
        text: label,
        font: '12px Inter, system-ui',
        lineHeight: 16,
        color: active ? theme.text : theme.muted,
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

  const p1Count = approvalQueue.value.filter((row) => row.severity === 'P1').length
  const metrics = [
    {
      label: 'Connected clients',
      value: String(connectedClients.value),
      detail: 'WS sessions on this server',
    },
    {
      label: 'Approval queue',
      value: String(approvalQueue.value.length),
      detail: 'Actionable review items',
    },
    {
      label: 'Theme',
      value: THEME_LABELS[savedTheme.value],
      detail: compactMode.value ? 'compact tables on' : 'comfortable density',
    },
  ]

  return box(
    {
      flexDirection: 'row',
      gap: 16,
      flexGrow: 1,
      minHeight: 0,
    },
    [
      box(
        {
          flexGrow: 1,
          minWidth: 0,
          flexDirection: 'column',
          gap: 16,
        },
        [
          box({ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, metrics.map(metricCard)),
          panel(
            'Deploy health',
            compactMode.value
              ? 'Compact mode trims the table for faster operator scans.'
              : 'Recent release health streamed from server state.',
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
      ),
      box(
        {
          width: 320,
          flexDirection: 'column',
          gap: 16,
        },
        [
          panel('Stack posture', 'This entire dashboard is server-rendered and streamed into the client canvas.', [
            statBadge('Queue lanes', `${approvalQueue.value.length} open`, 'accent'),
            statBadge('P1 incidents', String(p1Count), p1Count > 0 ? 'success' : 'neutral'),
            detailCard('Transport', 'Binary WebSocket frames carry layout and paint updates from the server.'),
          ]),
          panel('Live notes', 'Layout, routing, loader data, and feedback are all in the same geometry tree.', [
            detailCard('Focus model', 'Click once inside the canvas and keyboard navigation stays inside the Geometra app.'),
            detailCard('Mutation loop', 'Queue actions update server signals, then router loaders revalidate and redraw the next frame.'),
          ]),
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

  const escalated = data.rows.filter((row) => row.status === 'Escalated').length
  const waiting = data.rows.filter((row) => row.status === 'Waiting').length

  return box(
    {
      flexDirection: 'row',
      gap: 16,
      flexGrow: 1,
      minHeight: 0,
    },
    [
      box(
        {
          width: 320,
          flexDirection: 'column',
          gap: 16,
        },
        [
          panel('Command deck', 'Commands mutate server state and then revalidate the active route.', [
            commandPalette(data.commands, {
              onSelect: handleQueueCommand,
            }),
          ]),
          panel('Queue pressure', 'This route shows mutation + loader refresh without leaving the canvas.', [
            statBadge('Waiting', `${waiting} lanes`, waiting > 0 ? 'accent' : 'neutral'),
            statBadge('Escalated', `${escalated} lanes`, escalated > 0 ? 'success' : 'neutral'),
            detailCard('Fast path', 'Approve the next rollout or promote a hotfix to watch both Queue and Overview repaint from server state.'),
          ]),
        ],
      ),
      box(
        {
          flexGrow: 1,
          minWidth: 0,
          flexDirection: 'column',
          gap: 16,
        },
        [
          panel('Approval queue', 'Click any row to inspect an incident lane.', [
            approvalQueueTable(data.rows),
          ]),
          box(
            {
              flexDirection: 'row',
              gap: 12,
              flexWrap: 'wrap',
            },
            data.rows.slice(0, 3).map((row) =>
              detailCard(row.service, `${row.severity} · ${row.owner} · ${row.status}`),
            ),
          ),
        ],
      ),
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
      flexDirection: 'row',
      gap: 16,
      flexGrow: 1,
      minHeight: 0,
    },
    [
      box(
        {
          flexGrow: 1,
          minWidth: 0,
          flexDirection: 'column',
          gap: 16,
        },
        [
          panel(
            'Appearance',
            data
              ? `Saved theme: ${THEME_LABELS[data.theme]}. Compact mode: ${data.compactMode ? 'on' : 'off'}.`
              : 'Loading saved preferences from the route loader.',
            [
              box(
                {
                  flexDirection: 'column',
                  gap: 12,
                },
                [
                  fieldCard(
                    'Theme shell',
                    'Pick the full-canvas visual treatment for the app shell.',
                    box(
                      {
                        flexDirection: 'row',
                        gap: 10,
                        flexWrap: 'wrap',
                      },
                      (Object.keys(THEME_LABELS) as ThemeKey[]).map((themeKey) =>
                        optionButton(
                          THEME_LABELS[themeKey],
                          draftTheme.value === themeKey,
                          () => draftTheme.set(themeKey),
                        ),
                      ),
                    ),
                  ),
                  fieldCard(
                    'Density',
                    'Compact mode trims row-heavy routes for faster operator scanning.',
                    box(
                      {
                        flexDirection: 'row',
                        gap: 10,
                        flexWrap: 'wrap',
                      },
                      [
                        optionButton('Comfortable', !draftCompactMode.value, () => {
                          draftCompactMode.set(false)
                        }),
                        optionButton('Compact', draftCompactMode.value, () => {
                          draftCompactMode.set(true)
                        }),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
          panel(
            'Save through the router',
            dirty
              ? 'Draft changes are ready to submit through a route action.'
              : 'The current draft already matches the saved server state.',
            [
              box(
                {
                  flexDirection: 'row',
                  gap: 12,
                  flexWrap: 'wrap',
                },
                [
                  detailCard('Saved theme', THEME_LABELS[savedTheme.value]),
                  detailCard('Draft theme', THEME_LABELS[draftTheme.value]),
                  detailCard('Table density', draftCompactMode.value ? 'Compact tables' : 'Comfortable spacing'),
                ],
              ),
              box({ flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' }, [
                dirty
                  ? button('Review changes', () => {
                      saveDialogOpen.set(true)
                      rerender()
                    })
                  : statBadge('Status', 'Saved', 'success'),
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
                    rerender()
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
                    rerender()
                  }),
                ],
              )
            : box({ height: 0 }, []),
        ],
      ),
      box(
        {
          width: 320,
          flexDirection: 'column',
          gap: 16,
        },
        [
          panel('Live preview', 'The next action round-trip will repaint the shell with these preferences.', [
            statBadge('Theme', THEME_LABELS[draftTheme.value], 'accent'),
            statBadge('Density', draftCompactMode.value ? 'Compact' : 'Comfortable', draftCompactMode.value ? 'success' : 'neutral'),
            detailCard('Save model', 'The canvas renders the controls, while the router action persists preferences on the server.'),
          ]),
          panel('What this route proves', 'This is still one Geometra page handling controls, actions, and feedback.', [
            detailCard('No DOM widgets', 'The theme picker, density toggle, toast, and dialog are all rendered in the Geometra tree.'),
            detailCard('Server authority', 'Saved state, loader data, and timestamps come from the route on the server, not local client state.'),
          ]),
        ],
      ),
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
      gap: 24,
      padding: 24,
      backgroundColor: theme.appBg,
      gradient: {
        type: 'linear',
        angle: 145,
        stops: [
          { offset: 0, color: theme.appBg },
          { offset: 1, color: theme.panelBg },
        ],
      },
    },
    [
      box(
        {
          width: 280,
          flexDirection: 'column',
          gap: 14,
          padding: 16,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.panelBg,
          boxShadow: {
            offsetX: 0,
            offsetY: 18,
            blur: 36,
            color: 'rgba(1, 8, 18, 0.28)',
          },
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
          box({ flexGrow: 1 }, []),
          panel('Transport', 'The browser client only paints and forwards input into the Geometra tree.', [
            detailCard('Thin client', 'Binary framing is enabled for server-to-canvas updates.'),
            detailCard('Connected sessions', `${connectedClients.value} browser client${connectedClients.value === 1 ? '' : 's'} attached to this server.`),
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
          boxShadow: {
            offsetX: 0,
            offsetY: 18,
            blur: 40,
            color: 'rgba(1, 8, 18, 0.28)',
          },
        },
        [
          box(
            {
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
              flexWrap: 'wrap',
            },
            [
              box({ flexDirection: 'column', gap: 8 }, [
                text({
                  text: routeLabel,
                  font: 'bold 20px Inter, system-ui',
                  lineHeight: 26,
                  color: theme.text,
                }),
                box({ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, [
                  metaChip(`Path ${state.location.pathname}`),
                  metaChip(`${connectedClients.value} client${connectedClients.value === 1 ? '' : 's'} online`),
                ]),
              ]),
              box({ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, [
                statBadge(
                  'Navigation',
                  state.navigation === 'idle' ? 'Idle' : 'Syncing',
                  state.navigation === 'idle' ? 'success' : 'accent',
                ),
                statBadge(
                  'Density',
                  compactMode.value ? 'Compact' : 'Comfortable',
                  compactMode.value ? 'accent' : 'neutral',
                ),
                statBadge('Theme', THEME_LABELS[savedTheme.value], 'neutral'),
              ]),
            ],
          ),
          box(
            {
              flexDirection: 'column',
              gap: 16,
              flexGrow: 1,
              minHeight: 0,
            },
            [
              banner,
              outlet ?? panel('No route matched', 'The server-side router could not resolve this path.', []),
            ],
          ),
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
  port: serverPort,
  width: 1280,
  height: 820,
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
  Server: ws://localhost:${serverPort}
  Client: ${clientOrigin}

  Run the client with:
    cd demos/full-stack-dashboard
    npm run client
`)
