interface CodeSample {
  geometra: string
  html: string
}

export const codeSamples: Record<string, CodeSample> = {
  dashboard: {
    geometra: `box({ flexDirection: 'column', padding: 28, gap: 20 }, [
  box({ flexDirection: 'row', justifyContent: 'space-between' }, [
    text({ text: 'Analytics Overview', font: '700 22px Inter' }),
    box({ backgroundColor: '#1e1e2e', borderRadius: 8, padding: 8 }, [
      text({ text: 'Last 30 days', font: '500 12px Inter' }),
    ]),
  ]),
  box({ flexDirection: 'row', gap: 14 }, [
    metricCard('Total Revenue', '$48,290', '+12.5%', '#a78bfa'),
    metricCard('Active Users', '2,847', '+8.2%',  '#60a5fa'),
    metricCard('Conversion',   '3.24%',  '+0.8%', '#4ade80'),
    metricCard('Avg. Session', '4m 32s', '+1m',   '#fb923c'),
  ]),
  box({ flexDirection: 'row', gap: 14, flexGrow: 1 }, [
    box({ borderRadius: 12, padding: 20, flexGrow: 1 }, [
      text({ text: 'Revenue Trend', font: '600 14px Inter' }),
      box({ flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
        barHeights.map(h => sparkBar(h, 'rgba(167,139,250,0.6)')),
      ),
    ]),
    box({ borderRadius: 12, padding: 20, width: 240 }, [
      text({ text: 'Top Pages', font: '600 14px Inter' }),
      ...pages.map(([page, views]) =>
        box({ flexDirection: 'row', justifyContent: 'space-between' }, [
          text({ text: page }),
          text({ text: views }),
        ]),
      ),
    ]),
  ]),
])`,
    html: `<div class="dashboard">
  <div class="dashboard-header">
    <h1 class="dashboard-title">Analytics Overview</h1>
    <div class="date-badge">
      <span class="date-text">Last 30 days</span>
    </div>
  </div>
  <div class="metrics-row">
    <div class="metric-card" style="--accent: #a78bfa">
      <span class="metric-label">Total Revenue</span>
      <span class="metric-value">$48,290</span>
      <span class="metric-change positive">+12.5% vs last month</span>
    </div>
    <div class="metric-card" style="--accent: #60a5fa">
      <span class="metric-label">Active Users</span>
      <span class="metric-value">2,847</span>
      <span class="metric-change positive">+8.2% vs last month</span>
    </div>
    <div class="metric-card" style="--accent: #4ade80">
      <span class="metric-label">Conversion</span>
      <span class="metric-value">3.24%</span>
      <span class="metric-change positive">+0.8% vs last month</span>
    </div>
    <div class="metric-card" style="--accent: #fb923c">
      <span class="metric-label">Avg. Session</span>
      <span class="metric-value">4m 32s</span>
      <span class="metric-change positive">+1m 12s vs last month</span>
    </div>
  </div>
  <div class="charts-row">
    <div class="chart-panel chart-main">
      <h2 class="chart-title">Revenue Trend</h2>
      <div class="bar-chart">
        <div class="bar" style="height: 30px"></div>
        <div class="bar" style="height: 50px"></div>
        <div class="bar" style="height: 40px"></div>
        <!-- ... 9 more bars ... -->
      </div>
    </div>
    <div class="chart-panel chart-sidebar">
      <h2 class="chart-title">Top Pages</h2>
      <ul class="page-list">
        <li><span>/home</span><span>12,847</span></li>
        <li><span>/pricing</span><span>8,392</span></li>
        <li><span>/docs</span><span>6,120</span></li>
        <li><span>/blog</span><span>4,891</span></li>
        <li><span>/about</span><span>2,103</span></li>
      </ul>
    </div>
  </div>
</div>

<style>
  .dashboard { display: flex; flex-direction: column; padding: 28px; gap: 20px; }
  .dashboard-header { display: flex; justify-content: space-between; align-items: center; }
  .dashboard-title { font: 700 22px Inter; color: #fafafa; margin: 0; }
  .date-badge { background: #1e1e2e; border-radius: 8px; padding: 8px 14px; }
  .date-text { font: 500 12px Inter; color: #71717a; }
  .metrics-row { display: flex; gap: 14px; }
  .metric-card { background: #1e1e2e; border-radius: 12px; padding: 20px;
    flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 140px; }
  .metric-label { font: 500 12px Inter; color: #71717a; }
  .metric-value { font: 700 28px Inter; color: var(--accent); }
  .metric-change { font: 500 12px Inter; color: #4ade80; }
  .charts-row { display: flex; gap: 14px; flex: 1; }
  .chart-panel { background: #1e1e2e; border-radius: 12px; padding: 20px;
    display: flex; flex-direction: column; gap: 16px; }
  .chart-main { flex: 1; }  .chart-sidebar { width: 240px; flex-shrink: 0; }
  .chart-title { font: 600 14px Inter; color: #d4d4d8; margin: 0; }
  .bar-chart { display: flex; gap: 10px; align-items: flex-end; flex: 1; }
  .bar { width: 8px; border-radius: 4px; background: rgba(167,139,250,0.6); }
  .page-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .page-list li { display: flex; justify-content: space-between; }
  .page-list li span:first-child { font: 400 13px Inter; color: #a1a1aa; }
  .page-list li span:last-child { font: 500 13px 'JetBrains Mono'; color: #d4d4d8; }
</style>`,
  },

  pricing: {
    geometra: `box({ flexDirection: 'column', padding: 32, gap: 24, alignItems: 'center' }, [
  text({ text: 'Simple, Transparent Pricing', font: '700 24px Inter' }),
  text({ text: 'Start free. Scale when you need to.', font: '400 14px Inter' }),
  box({ flexDirection: 'row', gap: 16 }, [
    pricingTier('Starter', '$0', 'forever', starterFeatures, false),
    pricingTier('Pro', '$29', 'per month', proFeatures, true),
    pricingTier('Enterprise', '$99', 'per month', entFeatures, false),
  ]),
])

function pricingTier(name, price, period, features, highlighted) {
  return box({ borderRadius: 16, padding: 28, flexDirection: 'column', gap: 16 }, [
    text({ text: name,  font: '600 14px Inter', color: accent }),
    text({ text: price, font: '700 36px Inter' }),
    text({ text: period, font: '400 13px Inter' }),
    box({ height: 1, backgroundColor: '#27272a' }),
    ...features.map(f =>
      box({ flexDirection: 'row', gap: 8 }, [
        text({ text: '✓', color: accent }),
        text({ text: f }),
      ])
    ),
    box({ borderRadius: 10, padding: 12, alignItems: 'center' }, [
      text({ text: 'Get Started', font: '600 14px Inter' }),
    ]),
  ])
}`,
    html: `<div class="pricing-page">
  <div class="pricing-header">
    <h1>Simple, Transparent Pricing</h1>
    <p>Start free. Scale when you need to.</p>
  </div>
  <div class="pricing-grid">
    <div class="tier">
      <div class="tier-header">
        <span class="tier-name">Starter</span>
        <span class="tier-price">$0</span>
        <span class="tier-period">forever</span>
      </div>
      <hr />
      <ul class="feature-list">
        <li><span class="check">✓</span> 1,000 API calls/mo</li>
        <li><span class="check">✓</span> 2 team members</li>
        <li><span class="check">✓</span> Community support</li>
        <li><span class="check">✓</span> Basic analytics</li>
      </ul>
      <button class="tier-cta">Choose Plan</button>
    </div>
    <div class="tier tier--highlighted">
      <div class="tier-header">
        <span class="tier-name">Pro</span>
        <span class="tier-price">$29</span>
        <span class="tier-period">per month</span>
      </div>
      <hr />
      <ul class="feature-list">
        <li><span class="check">✓</span> 50,000 API calls/mo</li>
        <li><span class="check">✓</span> 10 team members</li>
        <li><span class="check">✓</span> Priority support</li>
        <li><span class="check">✓</span> Advanced analytics</li>
        <li><span class="check">✓</span> Custom domains</li>
      </ul>
      <button class="tier-cta tier-cta--primary">Get Started</button>
    </div>
    <div class="tier">
      <div class="tier-header">
        <span class="tier-name">Enterprise</span>
        <span class="tier-price">$99</span>
        <span class="tier-period">per month</span>
      </div>
      <hr />
      <ul class="feature-list">
        <li><span class="check">✓</span> Unlimited API calls</li>
        <li><span class="check">✓</span> Unlimited team</li>
        <li><span class="check">✓</span> Dedicated support</li>
        <li><span class="check">✓</span> Full analytics suite</li>
        <li><span class="check">✓</span> SSO & audit logs</li>
      </ul>
      <button class="tier-cta">Choose Plan</button>
    </div>
  </div>
</div>

<style>
  .pricing-page { display: flex; flex-direction: column; padding: 32px;
    gap: 24px; align-items: center; }
  .pricing-header { text-align: center; }
  .pricing-header h1 { font: 700 24px Inter; color: #fafafa; margin: 0 0 6px; }
  .pricing-header p { font: 400 14px Inter; color: #71717a; margin: 0; }
  .pricing-grid { display: flex; gap: 16px; width: 100%; }
  .tier { background: #18181b; border-radius: 16px; padding: 28px;
    flex: 1; display: flex; flex-direction: column; gap: 16px; }
  .tier--highlighted { background: #1a1a2e; border: 1px solid #a78bfa; }
  .tier-header { display: flex; flex-direction: column; gap: 4px; }
  .tier-name { font: 600 14px Inter; }
  .tier-price { font: 700 36px Inter; color: #fafafa; }
  .tier-period { font: 400 13px Inter; color: #52525b; }
  hr { border: none; height: 1px; background: #27272a; }
  .feature-list { list-style: none; display: flex; flex-direction: column;
    gap: 10px; flex: 1; }
  .feature-list li { font: 400 13px Inter; color: #a1a1aa;
    display: flex; gap: 8px; align-items: center; }
  .check { font-weight: 600; }
  .tier-cta { background: #27272a; color: #d4d4d8; border: none;
    border-radius: 10px; padding: 12px; font: 600 14px Inter; cursor: pointer; }
  .tier-cta--primary { background: #a78bfa; color: #09090b; }
</style>`,
  },

  profile: {
    geometra: `box({ alignItems: 'center', justifyContent: 'center' }, [
  box({ borderRadius: 20, padding: 36, flexDirection: 'column',
        gap: 20, width: 420, alignItems: 'center' }, [
    box({ width: 80, height: 80, borderRadius: 40, backgroundColor: '#a78bfa' }),
    text({ text: 'Alex Rivera', font: '700 20px Inter' }),
    text({ text: '@alexrivera', font: '400 14px Inter', color: '#71717a' }),
    text({ text: 'Full-stack engineer building the future of UI...', font: '400 13px Inter' }),
    box({ height: 1, backgroundColor: '#27272a' }),
    box({ flexDirection: 'row' }, [
      statBlock('Repos', '142'),
      statBlock('Stars', '8.4k'),
      statBlock('Followers', '1.2k'),
    ]),
    box({ flexDirection: 'row', gap: 12 }, [
      box({ backgroundColor: '#a78bfa', borderRadius: 10, padding: 12, flexGrow: 1 }, [
        text({ text: 'Follow', font: '600 14px Inter' }),
      ]),
      box({ backgroundColor: '#27272a', borderRadius: 10, padding: 12, flexGrow: 1 }, [
        text({ text: 'Message', font: '600 14px Inter' }),
      ]),
    ]),
  ]),
])`,
    html: `<div class="profile-wrapper">
  <div class="profile-card">
    <div class="avatar"></div>
    <h2 class="profile-name">Alex Rivera</h2>
    <span class="profile-handle">@alexrivera</span>
    <p class="profile-bio">
      Full-stack engineer building the future of UI frameworks.
      Open source contributor and coffee enthusiast.
    </p>
    <hr class="divider" />
    <div class="stats-row">
      <div class="stat">
        <span class="stat-value">142</span>
        <span class="stat-label">Repos</span>
      </div>
      <div class="stat-separator"></div>
      <div class="stat">
        <span class="stat-value">8.4k</span>
        <span class="stat-label">Stars</span>
      </div>
      <div class="stat-separator"></div>
      <div class="stat">
        <span class="stat-value">1.2k</span>
        <span class="stat-label">Followers</span>
      </div>
    </div>
    <div class="actions">
      <button class="btn btn--primary">Follow</button>
      <button class="btn btn--secondary">Message</button>
    </div>
  </div>
</div>

<style>
  .profile-wrapper { display: flex; align-items: center; justify-content: center;
    height: 100%; }
  .profile-card { background: #18181b; border-radius: 20px; padding: 36px;
    width: 420px; display: flex; flex-direction: column; align-items: center; gap: 20px; }
  .avatar { width: 80px; height: 80px; border-radius: 50%; background: #a78bfa; }
  .profile-name { font: 700 20px Inter; color: #fafafa; margin: 0; }
  .profile-handle { font: 400 14px Inter; color: #71717a; }
  .profile-bio { font: 400 13px Inter; color: #a1a1aa; text-align: center;
    line-height: 1.5; margin: 0; }
  .divider { border: none; height: 1px; background: #27272a; width: 100%; }
  .stats-row { display: flex; width: 100%; }
  .stat { flex: 1; text-align: center; display: flex; flex-direction: column; gap: 2px; }
  .stat-value { font: 700 20px Inter; color: #fafafa; }
  .stat-label { font: 400 12px Inter; color: #71717a; }
  .stat-separator { width: 1px; background: #27272a; }
  .actions { display: flex; gap: 12px; width: 100%; }
  .btn { flex: 1; border: none; border-radius: 10px; padding: 12px;
    font: 600 14px Inter; cursor: pointer; text-align: center; }
  .btn--primary { background: #a78bfa; color: #09090b; }
  .btn--secondary { background: #27272a; color: #d4d4d8; }
</style>`,
  },

  kanban: {
    geometra: `box({ flexDirection: 'column', padding: 28, gap: 20 }, [
  text({ text: 'Sprint Board', font: '700 22px Inter' }),
  box({ flexDirection: 'row', gap: 14, flexGrow: 1 }, [
    kanbanColumn('To Do', 3, [
      taskCard('Implement auth flow', 'Feature', '#a78bfa', 'AR'),
      taskCard('Update API docs',     'Docs',    '#60a5fa', 'JM'),
      taskCard('Add rate limiting',   'Backend', '#fb923c', 'SK'),
    ]),
    kanbanColumn('In Progress', 2, [
      taskCard('Canvas hit-testing',  'Core', '#4ade80', 'AR'),
      taskCard('Mobile breakpoints',  'UI',   '#f472b6', 'LW'),
    ]),
    kanbanColumn('In Review', 2, [
      taskCard('Text selection polish', 'Core', '#4ade80', 'AR'),
      taskCard('Fix focus trap edge',   'Bug',  '#f87171', 'JM'),
    ]),
    kanbanColumn('Done', 2, [
      taskCard('Yoga WASM upgrade',     'Infra', '#fbbf24', 'SK'),
      taskCard('Keyboard nav for lists', 'A11y', '#2dd4bf', 'LW'),
    ]),
  ]),
])

function taskCard(title, tag, tagColor, assignee) {
  return box({ borderRadius: 10, padding: 14, flexDirection: 'column', gap: 10 }, [
    text({ text: title, font: '500 13px Inter' }),
    box({ flexDirection: 'row', justifyContent: 'space-between' }, [
      box({ backgroundColor: tagColor, borderRadius: 6, padding: 3 }, [
        text({ text: tag, font: '500 11px Inter' }),
      ]),
      text({ text: assignee, font: '400 11px Inter' }),
    ]),
  ])
}`,
    html: `<div class="board">
  <div class="board-header">
    <h1>Sprint Board</h1>
    <span class="sprint-label">Sprint 14 · Mar 24–Apr 4</span>
  </div>
  <div class="columns">
    <div class="column">
      <div class="column-header">
        <span class="col-title">To Do</span>
        <span class="col-count">3</span>
      </div>
      <div class="task-card">
        <p class="task-title">Implement auth flow</p>
        <div class="task-meta">
          <span class="tag" style="background:#a78bfa">Feature</span>
          <div class="assignee"><div class="avatar-sm"></div><span>AR</span></div>
        </div>
      </div>
      <div class="task-card">
        <p class="task-title">Update API docs</p>
        <div class="task-meta">
          <span class="tag" style="background:#60a5fa">Docs</span>
          <div class="assignee"><div class="avatar-sm"></div><span>JM</span></div>
        </div>
      </div>
      <div class="task-card">
        <p class="task-title">Add rate limiting</p>
        <div class="task-meta">
          <span class="tag" style="background:#fb923c">Backend</span>
          <div class="assignee"><div class="avatar-sm"></div><span>SK</span></div>
        </div>
      </div>
    </div>
    <div class="column">
      <div class="column-header">
        <span class="col-title">In Progress</span>
        <span class="col-count">2</span>
      </div>
      <div class="task-card">
        <p class="task-title">Canvas hit-testing</p>
        <div class="task-meta">
          <span class="tag" style="background:#4ade80">Core</span>
          <div class="assignee"><div class="avatar-sm"></div><span>AR</span></div>
        </div>
      </div>
      <div class="task-card">
        <p class="task-title">Mobile breakpoints</p>
        <div class="task-meta">
          <span class="tag" style="background:#f472b6">UI</span>
          <div class="assignee"><div class="avatar-sm"></div><span>LW</span></div>
        </div>
      </div>
    </div>
    <!-- ... 2 more columns (In Review, Done) ... -->
  </div>
</div>

<style>
  .board { display: flex; flex-direction: column; padding: 28px; gap: 20px; }
  .board-header { display: flex; justify-content: space-between; align-items: center; }
  .board-header h1 { font: 700 22px Inter; color: #fafafa; margin: 0; }
  .sprint-label { font: 500 12px Inter; color: #71717a; background: #27272a;
    border-radius: 8px; padding: 8px 14px; }
  .columns { display: flex; gap: 14px; flex: 1; }
  .column { background: #18181b; border-radius: 14px; padding: 16px;
    flex: 1; display: flex; flex-direction: column; gap: 12px; }
  .column-header { display: flex; justify-content: space-between; align-items: center; }
  .col-title { font: 600 13px Inter; color: #d4d4d8; }
  .col-count { font: 600 11px 'JetBrains Mono'; color: #71717a; background: #27272a;
    border-radius: 6px; padding: 2px 8px; }
  .task-card { background: #1e1e2e; border-radius: 10px; padding: 14px;
    display: flex; flex-direction: column; gap: 10px; }
  .task-title { font: 500 13px Inter; color: #e4e4e7; margin: 0; }
  .task-meta { display: flex; justify-content: space-between; align-items: center; }
  .tag { border-radius: 6px; padding: 3px 8px; font: 500 11px Inter; color: #09090b; }
  .assignee { display: flex; gap: 6px; align-items: center; }
  .avatar-sm { width: 20px; height: 20px; border-radius: 50%; background: #3f3f46; }
  .assignee span { font: 400 11px Inter; color: #71717a; }
</style>`,
  },

  settings: {
    geometra: `box({ flexDirection: 'column', padding: 28, gap: 20 }, [
  text({ text: 'Settings', font: '700 22px Inter' }),
  box({ flexDirection: 'row', gap: 16, flexGrow: 1 }, [
    box({ flexDirection: 'column', gap: 16, flexGrow: 1 }, [
      settingSection('Appearance', [
        settingToggle('Dark Mode', 'Use dark color scheme', true),
        settingToggle('Compact Mode', 'Reduce spacing', false),
        settingToggle('Animations', 'Enable transitions', true),
      ]),
      settingSection('Notifications', [
        settingToggle('Email Digests', 'Weekly summary', true),
        settingToggle('Push Notifications', 'Real-time alerts', false),
      ]),
    ]),
    box({ flexDirection: 'column', gap: 16, flexGrow: 1 }, [
      settingSection('Privacy', [
        settingToggle('Profile Visible', 'Others can see you', true),
        settingToggle('Show Activity', 'Display recent activity', false),
        settingToggle('Two-Factor Auth', 'Extra security', true),
      ]),
      settingSection('Data', [
        settingToggle('Analytics', 'Anonymous usage data', false),
        settingToggle('Crash Reports', 'Auto-send reports', true),
      ]),
    ]),
  ]),
])

function settingToggle(label, desc, on) {
  return box({ flexDirection: 'row', justifyContent: 'space-between' }, [
    box({ flexDirection: 'column' }, [
      text({ text: label, font: '500 14px Inter' }),
      text({ text: desc, font: '400 12px Inter', color: '#52525b' }),
    ]),
    box({ width: 44, height: 24, borderRadius: 12, backgroundColor: on ? '#a78bfa' : '#3f3f46' }, [
      box({ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }),
    ]),
  ])
}`,
    html: `<div class="settings-page">
  <h1>Settings</h1>
  <div class="settings-grid">
    <div class="settings-col">
      <div class="section">
        <h3 class="section-title">Appearance</h3>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Dark Mode</span>
            <span class="setting-desc">Use dark color scheme across the app</span>
          </div>
          <div class="toggle toggle--on">
            <div class="toggle-knob"></div>
          </div>
        </div>
        <hr />
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Compact Mode</span>
            <span class="setting-desc">Reduce spacing and font sizes</span>
          </div>
          <div class="toggle">
            <div class="toggle-knob"></div>
          </div>
        </div>
        <hr />
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Animations</span>
            <span class="setting-desc">Enable transition animations</span>
          </div>
          <div class="toggle toggle--on">
            <div class="toggle-knob"></div>
          </div>
        </div>
      </div>
      <div class="section">
        <h3 class="section-title">Notifications</h3>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Email Digests</span>
            <span class="setting-desc">Weekly summary of activity</span>
          </div>
          <div class="toggle toggle--on"><div class="toggle-knob"></div></div>
        </div>
        <hr />
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Push Notifications</span>
            <span class="setting-desc">Real-time alerts on device</span>
          </div>
          <div class="toggle"><div class="toggle-knob"></div></div>
        </div>
      </div>
    </div>
    <!-- ... second column with Privacy & Data sections ... -->
  </div>
</div>

<style>
  .settings-page { display: flex; flex-direction: column; padding: 28px; gap: 20px; }
  .settings-page h1 { font: 700 22px Inter; color: #fafafa; margin: 0; }
  .settings-grid { display: flex; gap: 16px; flex: 1; }
  .settings-col { flex: 1; display: flex; flex-direction: column; gap: 16px; }
  .section { background: #18181b; border-radius: 14px; padding: 20px;
    display: flex; flex-direction: column; }
  .section-title { font: 600 13px Inter; color: #71717a; margin: 0 0 4px; }
  .setting-row { display: flex; justify-content: space-between; align-items: center;
    padding: 12px 0; }
  .setting-info { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .setting-label { font: 500 14px Inter; color: #e4e4e7; }
  .setting-desc { font: 400 12px Inter; color: #52525b; }
  hr { border: none; height: 1px; background: #27272a; }
  .toggle { width: 44px; height: 24px; border-radius: 12px; background: #3f3f46;
    position: relative; cursor: pointer; }
  .toggle--on { background: #a78bfa; }
  .toggle-knob { width: 20px; height: 20px; border-radius: 50%; background: #fff;
    position: absolute; top: 2px; left: 2px; transition: transform 0.2s; }
  .toggle--on .toggle-knob { transform: translateX(20px); }
</style>`,
  },
}
