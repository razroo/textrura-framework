import { box, signal, text, type UIElement } from '@geometra/core/node'
import { createServer, type TexturaServer } from '@geometra/server'
import {
  createMemoryHistory,
  createRouter,
  link,
  renderMatchedOutlet,
  type RouteNode,
} from '@geometra/router'
import { button, checkbox, dataTable, selectControl, toast } from '@geometra/ui'

type ThemeKey = 'ink' | 'ocean'

type OverviewData = {
  services: Array<Record<string, string>>
}

type SettingsData = {
  theme: ThemeKey
  alertsEnabled: boolean
}

const THEME_LABELS: Record<ThemeKey, string> = {
  ink: 'Ink',
  ocean: 'Ocean',
}

const services = signal([
  { service: 'Payments', status: 'healthy', latency: '41 ms' },
  { service: 'Catalog', status: 'healthy', latency: '35 ms' },
  { service: 'Checkout', status: 'watch', latency: '63 ms' },
])

const savedTheme = signal<ThemeKey>('ink')
const draftTheme = signal<ThemeKey>(savedTheme.peek())
const alertsEnabled = signal(true)
const draftAlertsEnabled = signal(alertsEnabled.peek())
const themeMenuOpen = signal(false)
const notice = signal('Server-side router state is driving this canvas app.')

const history = createMemoryHistory({ initialEntries: ['/'] })
let server: TexturaServer | null = null

function card(title: string, children: UIElement[]): UIElement {
  return box(
    {
      flexDirection: 'column',
      gap: 10,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#334155',
      backgroundColor: '#0f172a',
    },
    [
      text({
        text: title,
        font: 'bold 15px Inter, system-ui',
        lineHeight: 20,
        color: '#f8fafc',
      }),
      ...children,
    ],
  )
}

function getLoaderData<T>(key: string): T | undefined {
  return router.getState().loaderData[key] as T | undefined
}

function overviewPage(): UIElement {
  const data = getLoaderData<OverviewData>('overview')
  return card('Overview', [
    dataTable(
      [
        { key: 'service', header: 'Service' },
        { key: 'status', header: 'Status' },
        { key: 'latency', header: 'Latency' },
      ],
      data?.services ?? [],
    ),
  ])
}

function settingsPage(): UIElement {
  const data = getLoaderData<SettingsData>('settings')

  return card('Settings', [
    toast(
      data
        ? `Saved theme: ${THEME_LABELS[data.theme]} | Alerts: ${data.alertsEnabled ? 'enabled' : 'muted'}`
        : 'Loading saved settings...',
      { title: 'Route-backed settings', variant: 'info' },
    ),
    selectControl({
      options: [
        { value: 'ink', label: THEME_LABELS.ink },
        { value: 'ocean', label: THEME_LABELS.ocean },
      ],
      value: draftTheme.value,
      open: themeMenuOpen.value,
      onToggle: () => themeMenuOpen.set(!themeMenuOpen.peek()),
      onChange: (value) => {
        draftTheme.set(value as ThemeKey)
        themeMenuOpen.set(false)
      },
    }),
    checkbox('Enable alert toasts', {
      checked: draftAlertsEnabled.value,
      onChange: (checked) => draftAlertsEnabled.set(checked),
    }),
    button('Save', () => {
      void router.submitAction('settings', {
        method: 'POST',
        data: {
          theme: draftTheme.value,
          alertsEnabled: draftAlertsEnabled.value,
        },
      })
    }),
  ])
}

function navLink(to: string, label: string): UIElement {
  const active = router.isActive(to)
  return link(
    {
      to,
      router,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: active ? '#38bdf8' : '#334155',
      backgroundColor: active ? '#082f49' : '#0f172a',
    },
    [
      text({
        text: label,
        font: 'bold 13px Inter, system-ui',
        lineHeight: 18,
        color: '#f8fafc',
      }),
    ],
  )
}

function shell(outlet: UIElement | null): UIElement {
  return box(
    {
      padding: 24,
      gap: 20,
      flexDirection: 'row',
      backgroundColor: '#07111b',
    },
    [
      box(
        {
          width: 250,
          flexDirection: 'column',
          gap: 12,
          padding: 14,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#334155',
          backgroundColor: '#0b1626',
        },
        [
          text({
            text: 'Full-stack starter',
            font: 'bold 18px Inter, system-ui',
            lineHeight: 24,
            color: '#f8fafc',
          }),
          navLink('/', 'Overview'),
          navLink('/settings', 'Settings'),
          text({
            text: notice.value,
            font: '12px Inter, system-ui',
            lineHeight: 16,
            color: '#94a3b8',
          }),
        ],
      ),
      box(
        {
          flexGrow: 1,
          flexDirection: 'column',
          gap: 12,
          padding: 14,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#334155',
          backgroundColor: '#0b1626',
        },
        [
          toast(
            `Navigation: ${router.getState().navigation}`,
            { title: 'Router', variant: 'info' },
          ),
          outlet ?? card('Missing route', []),
        ],
      ),
    ],
  )
}

const routes: RouteNode<UIElement>[] = [
  {
    id: 'shell',
    render: ({ outlet }) => shell(outlet),
    children: [
      {
        id: 'overview',
        path: '/',
        loader: async () => ({
          services: services.peek(),
        }),
        render: () => overviewPage(),
      },
      {
        id: 'settings',
        path: 'settings',
        loader: async () => ({
          theme: savedTheme.peek(),
          alertsEnabled: alertsEnabled.peek(),
        }),
        action: async ({ submission }) => {
          const data = (submission.data ?? {}) as Partial<{
            theme: ThemeKey
            alertsEnabled: boolean
          }>
          const nextTheme = data.theme ?? savedTheme.peek()
          const nextAlerts = data.alertsEnabled ?? alertsEnabled.peek()
          savedTheme.set(nextTheme)
          draftTheme.set(nextTheme)
          alertsEnabled.set(nextAlerts)
          draftAlertsEnabled.set(nextAlerts)
          notice.set(`Saved ${THEME_LABELS[nextTheme]} with alerts ${nextAlerts ? 'enabled' : 'muted'}.`)
          return { ok: true }
        },
        render: () => settingsPage(),
      },
    ],
  },
]

const router = createRouter<UIElement>({
  routes,
  history,
})

router.subscribe(() => {
  server?.update()
})

function view(): UIElement {
  const state = router.getState()
  if (!state.matches) return shell(card('Missing route', []))
  return renderMatchedOutlet(state.matches, state.location.pathname) ?? shell(card('Missing route', []))
}

server = await createServer(view, {
  port: 3300,
  width: 1180,
  height: 760,
})

router.start()
