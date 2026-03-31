import { box, text } from '@geometra/core'
import type { UIElement } from '@geometra/core'

// ─── Dashboard ──────────────────────────────────────────────

function metricCard(label: string, value: string, change: string, color: string) {
  return box(
    {
      backgroundColor: '#1e1e2e',
      borderRadius: 12,
      padding: 20,
      flexGrow: 1,
      flexShrink: 1,
      flexDirection: 'column',
      gap: 8,
      minWidth: 140,
    },
    [
      text({ text: label, font: '500 12px Inter', lineHeight: 16, color: '#71717a' }),
      text({ text: value, font: '700 28px Inter', lineHeight: 34, color }),
      text({ text: change, font: '500 12px Inter', lineHeight: 16, color: '#4ade80' }),
    ],
  )
}

function sparkBar(height: number, color: string) {
  return box({
    backgroundColor: color,
    width: 8,
    height,
    borderRadius: 4,
    flexShrink: 0,
  })
}

export function dashboard(): UIElement {
  const barHeights = [30, 50, 40, 70, 55, 80, 60, 90, 45, 65, 85, 75]
  return box(
    { flexDirection: 'column', padding: 28, gap: 20, width: 940, height: 520, backgroundColor: '#111118' },
    [
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
        text({ text: 'Analytics Overview', font: '700 22px Inter', lineHeight: 28, color: '#fafafa' }),
        box({ backgroundColor: '#1e1e2e', borderRadius: 8, padding: 8, paddingLeft: 14, paddingRight: 14 }, [
          text({ text: 'Last 30 days', font: '500 12px Inter', lineHeight: 16, color: '#71717a' }),
        ]),
      ]),
      box({ flexDirection: 'row', gap: 14 }, [
        metricCard('Total Revenue', '$48,290', '+12.5% vs last month', '#a78bfa'),
        metricCard('Active Users', '2,847', '+8.2% vs last month', '#60a5fa'),
        metricCard('Conversion', '3.24%', '+0.8% vs last month', '#4ade80'),
        metricCard('Avg. Session', '4m 32s', '+1m 12s vs last month', '#fb923c'),
      ]),
      box({ flexDirection: 'row', gap: 14, flexGrow: 1 }, [
        box(
          {
            backgroundColor: '#1e1e2e', borderRadius: 12, padding: 20,
            flexDirection: 'column', gap: 16, flexGrow: 1, flexBasis: 0,
          },
          [
            text({ text: 'Revenue Trend', font: '600 14px Inter', lineHeight: 18, color: '#d4d4d8' }),
            box(
              { flexDirection: 'row', gap: 10, alignItems: 'flex-end', flexGrow: 1 },
              barHeights.map(h => sparkBar(h, 'rgba(167, 139, 250, 0.6)')),
            ),
          ],
        ),
        box(
          {
            backgroundColor: '#1e1e2e', borderRadius: 12, padding: 20,
            flexDirection: 'column', gap: 12, width: 240, flexShrink: 0,
          },
          [
            text({ text: 'Top Pages', font: '600 14px Inter', lineHeight: 18, color: '#d4d4d8' }),
            ...[
              ['/home', '12,847'],
              ['/pricing', '8,392'],
              ['/docs', '6,120'],
              ['/blog', '4,891'],
              ['/about', '2,103'],
            ].map(([page, views]) =>
              box({ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 4 }, [
                text({ text: page!, font: '400 13px Inter', lineHeight: 18, color: '#a1a1aa' }),
                text({ text: views!, font: '500 13px JetBrains Mono', lineHeight: 18, color: '#d4d4d8' }),
              ]),
            ),
          ],
        ),
      ]),
    ],
  )
}

// ─── Pricing ────────────────────────────────────────────────

function pricingTier(
  name: string, price: string, period: string,
  features: string[], accent: string, highlighted: boolean,
) {
  return box(
    {
      backgroundColor: highlighted ? '#1a1a2e' : '#18181b',
      borderRadius: 16,
      padding: 28,
      flexDirection: 'column',
      gap: 16,
      flexGrow: 1,
      flexBasis: 0,
      ...(highlighted ? { borderWidth: 1, borderColor: accent } : {}),
    },
    [
      box({ flexDirection: 'column', gap: 4 }, [
        text({ text: name, font: '600 14px Inter', lineHeight: 18, color: accent }),
        text({ text: price, font: '700 36px Inter', lineHeight: 44, color: '#fafafa' }),
        text({ text: period, font: '400 13px Inter', lineHeight: 18, color: '#52525b' }),
      ]),
      box({ height: 1, backgroundColor: '#27272a' }),
      box(
        { flexDirection: 'column', gap: 10, flexGrow: 1 },
        features.map(f =>
          box({ flexDirection: 'row', gap: 8, alignItems: 'center' }, [
            text({ text: '✓', font: '600 13px Inter', lineHeight: 18, color: accent }),
            text({ text: f, font: '400 13px Inter', lineHeight: 18, color: '#a1a1aa' }),
          ]),
        ),
      ),
      box(
        {
          backgroundColor: highlighted ? accent : '#27272a',
          borderRadius: 10,
          padding: 12,
          alignItems: 'center',
          justifyContent: 'center',
        },
        [
          text({
            text: highlighted ? 'Get Started' : 'Choose Plan',
            font: '600 14px Inter',
            lineHeight: 18,
            color: highlighted ? '#09090b' : '#d4d4d8',
          }),
        ],
      ),
    ],
  )
}

export function pricing(): UIElement {
  return box(
    { flexDirection: 'column', padding: 32, gap: 24, width: 940, height: 520, backgroundColor: '#111118', alignItems: 'center' },
    [
      box({ flexDirection: 'column', gap: 6, alignItems: 'center' }, [
        text({ text: 'Simple, Transparent Pricing', font: '700 24px Inter', lineHeight: 32, color: '#fafafa' }),
        text({ text: 'Start free. Scale when you need to.', font: '400 14px Inter', lineHeight: 20, color: '#71717a' }),
      ]),
      box({ flexDirection: 'row', gap: 16, flexGrow: 1, width: 876 }, [
        pricingTier('Starter', '$0', 'forever', [
          '1,000 API calls/mo',
          '2 team members',
          'Community support',
          'Basic analytics',
        ], '#71717a', false),
        pricingTier('Pro', '$29', 'per month', [
          '50,000 API calls/mo',
          '10 team members',
          'Priority support',
          'Advanced analytics',
          'Custom domains',
        ], '#a78bfa', true),
        pricingTier('Enterprise', '$99', 'per month', [
          'Unlimited API calls',
          'Unlimited team',
          'Dedicated support',
          'Full analytics suite',
          'SSO & audit logs',
        ], '#60a5fa', false),
      ]),
    ],
  )
}

// ─── Profile ────────────────────────────────────────────────

function statBlock(label: string, value: string) {
  return box({ flexDirection: 'column', alignItems: 'center', gap: 2, flexGrow: 1 }, [
    text({ text: value, font: '700 20px Inter', lineHeight: 26, color: '#fafafa' }),
    text({ text: label, font: '400 12px Inter', lineHeight: 16, color: '#71717a' }),
  ])
}

export function profile(): UIElement {
  return box(
    { flexDirection: 'column', padding: 32, gap: 0, width: 940, height: 520, backgroundColor: '#111118', alignItems: 'center', justifyContent: 'center' },
    [
      box(
        {
          backgroundColor: '#18181b', borderRadius: 20, padding: 36,
          flexDirection: 'column', gap: 20, width: 420, alignItems: 'center',
        },
        [
          box({ width: 80, height: 80, borderRadius: 40, backgroundColor: '#a78bfa' }),
          box({ flexDirection: 'column', gap: 4, alignItems: 'center' }, [
            text({ text: 'Alex Rivera', font: '700 20px Inter', lineHeight: 26, color: '#fafafa' }),
            text({ text: '@alexrivera', font: '400 14px Inter', lineHeight: 20, color: '#71717a' }),
          ]),
          text({
            text: 'Full-stack engineer building the future of UI frameworks. Open source contributor and coffee enthusiast.',
            font: '400 13px Inter', lineHeight: 20, color: '#a1a1aa',
          }),
          box({ height: 1, backgroundColor: '#27272a', width: 348 }),
          box({ flexDirection: 'row', gap: 0, width: 348 }, [
            statBlock('Repos', '142'),
            box({ width: 1, backgroundColor: '#27272a' }),
            statBlock('Stars', '8.4k'),
            box({ width: 1, backgroundColor: '#27272a' }),
            statBlock('Followers', '1.2k'),
          ]),
          box({ flexDirection: 'row', gap: 12, width: 348 }, [
            box(
              {
                backgroundColor: '#a78bfa', borderRadius: 10, padding: 12,
                flexGrow: 1, alignItems: 'center', justifyContent: 'center',
              },
              [text({ text: 'Follow', font: '600 14px Inter', lineHeight: 18, color: '#09090b' })],
            ),
            box(
              {
                backgroundColor: '#27272a', borderRadius: 10, padding: 12,
                flexGrow: 1, alignItems: 'center', justifyContent: 'center',
              },
              [text({ text: 'Message', font: '600 14px Inter', lineHeight: 18, color: '#d4d4d8' })],
            ),
          ]),
        ],
      ),
    ],
  )
}

// ─── Kanban ─────────────────────────────────────────────────

function taskCard(title: string, tag: string, tagColor: string, assignee: string) {
  return box(
    { backgroundColor: '#1e1e2e', borderRadius: 10, padding: 14, flexDirection: 'column', gap: 10 },
    [
      text({ text: title, font: '500 13px Inter', lineHeight: 18, color: '#e4e4e7' }),
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
        box({ backgroundColor: tagColor, borderRadius: 6, paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3 }, [
          text({ text: tag, font: '500 11px Inter', lineHeight: 14, color: '#09090b' }),
        ]),
        box({ flexDirection: 'row', gap: 6, alignItems: 'center' }, [
          box({ width: 20, height: 20, borderRadius: 10, backgroundColor: '#3f3f46' }),
          text({ text: assignee, font: '400 11px Inter', lineHeight: 14, color: '#71717a' }),
        ]),
      ]),
    ],
  )
}

function kanbanColumn(title: string, count: number, cards: UIElement[]) {
  return box(
    {
      backgroundColor: '#18181b', borderRadius: 14, padding: 16,
      flexDirection: 'column', gap: 12, flexGrow: 1, flexBasis: 0,
    },
    [
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
        text({ text: title, font: '600 13px Inter', lineHeight: 18, color: '#d4d4d8' }),
        box({ backgroundColor: '#27272a', borderRadius: 6, paddingLeft: 8, paddingRight: 8, paddingTop: 2, paddingBottom: 2 }, [
          text({ text: String(count), font: '600 11px JetBrains Mono', lineHeight: 14, color: '#71717a' }),
        ]),
      ]),
      ...cards,
    ],
  )
}

export function kanban(): UIElement {
  return box(
    { flexDirection: 'column', padding: 28, gap: 20, width: 940, height: 520, backgroundColor: '#111118' },
    [
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
        text({ text: 'Sprint Board', font: '700 22px Inter', lineHeight: 28, color: '#fafafa' }),
        box({ backgroundColor: '#27272a', borderRadius: 8, padding: 8, paddingLeft: 14, paddingRight: 14 }, [
          text({ text: 'Sprint 14 · Mar 24–Apr 4', font: '500 12px Inter', lineHeight: 16, color: '#71717a' }),
        ]),
      ]),
      box({ flexDirection: 'row', gap: 14, flexGrow: 1 }, [
        kanbanColumn('To Do', 3, [
          taskCard('Implement auth flow', 'Feature', '#a78bfa', 'AR'),
          taskCard('Update API docs', 'Docs', '#60a5fa', 'JM'),
          taskCard('Add rate limiting', 'Backend', '#fb923c', 'SK'),
        ]),
        kanbanColumn('In Progress', 2, [
          taskCard('Canvas hit-testing', 'Core', '#4ade80', 'AR'),
          taskCard('Mobile breakpoints', 'UI', '#f472b6', 'LW'),
        ]),
        kanbanColumn('In Review', 2, [
          taskCard('Text selection polish', 'Core', '#4ade80', 'AR'),
          taskCard('Fix focus trap edge case', 'Bug', '#f87171', 'JM'),
        ]),
        kanbanColumn('Done', 2, [
          taskCard('Yoga WASM upgrade', 'Infra', '#fbbf24', 'SK'),
          taskCard('Keyboard nav for lists', 'A11y', '#2dd4bf', 'LW'),
        ]),
      ]),
    ],
  )
}

// ─── Settings ───────────────────────────────────────────────

function settingToggle(label: string, desc: string, on: boolean) {
  return box(
    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingBottom: 12 },
    [
      box({ flexDirection: 'column', gap: 2, flexGrow: 1, flexShrink: 1 }, [
        text({ text: label, font: '500 14px Inter', lineHeight: 20, color: '#e4e4e7' }),
        text({ text: desc, font: '400 12px Inter', lineHeight: 16, color: '#52525b' }),
      ]),
      box(
        {
          width: 44, height: 24, borderRadius: 12,
          backgroundColor: on ? '#a78bfa' : '#3f3f46',
          justifyContent: 'center',
          paddingLeft: on ? 22 : 2, paddingTop: 2,
        },
        [box({ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fafafa' })],
      ),
    ],
  )
}

function settingSection(title: string, children: UIElement[]) {
  return box(
    { backgroundColor: '#18181b', borderRadius: 14, padding: 20, flexDirection: 'column', gap: 0 },
    [
      text({ text: title, font: '600 13px Inter', lineHeight: 18, color: '#71717a', }),
      ...children,
    ],
  )
}

export function settings(): UIElement {
  return box(
    { flexDirection: 'column', padding: 28, gap: 20, width: 940, height: 520, backgroundColor: '#111118' },
    [
      text({ text: 'Settings', font: '700 22px Inter', lineHeight: 28, color: '#fafafa' }),
      box({ flexDirection: 'row', gap: 16, flexGrow: 1 }, [
        box({ flexDirection: 'column', gap: 16, flexGrow: 1, flexBasis: 0 }, [
          settingSection('Appearance', [
            settingToggle('Dark Mode', 'Use dark color scheme across the app', true),
            box({ height: 1, backgroundColor: '#27272a' }),
            settingToggle('Compact Mode', 'Reduce spacing and font sizes', false),
            box({ height: 1, backgroundColor: '#27272a' }),
            settingToggle('Animations', 'Enable transition animations', true),
          ]),
          settingSection('Notifications', [
            settingToggle('Email Digests', 'Weekly summary of activity', true),
            box({ height: 1, backgroundColor: '#27272a' }),
            settingToggle('Push Notifications', 'Real-time alerts on your device', false),
          ]),
        ]),
        box({ flexDirection: 'column', gap: 16, flexGrow: 1, flexBasis: 0 }, [
          settingSection('Privacy', [
            settingToggle('Profile Visible', 'Others can see your profile', true),
            box({ height: 1, backgroundColor: '#27272a' }),
            settingToggle('Show Activity', 'Display recent activity on profile', false),
            box({ height: 1, backgroundColor: '#27272a' }),
            settingToggle('Two-Factor Auth', 'Extra security for your account', true),
          ]),
          settingSection('Data', [
            settingToggle('Analytics', 'Help improve with anonymous usage data', false),
            box({ height: 1, backgroundColor: '#27272a' }),
            settingToggle('Crash Reports', 'Auto-send crash reports', true),
          ]),
        ]),
      ]),
    ],
  )
}

// ─── Registry ───────────────────────────────────────────────

export const templates: Record<string, () => UIElement> = {
  dashboard,
  pricing,
  profile,
  kanban,
  settings,
}
