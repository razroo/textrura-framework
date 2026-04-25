import { box, createApp, signal, text } from '@geometra/core'
import { CanvasRenderer } from '@geometra/renderer-canvas'
import replay from '../../examples/replays/claims-review.json'

const selectedStep = signal(0)
const action = replay.actions[0]
const before = action?.frameBefore
const after = action?.frameAfter
const target = action?.target
const beforeNode = before?.geometry.nodes.find(node => node.id === action?.actionId)
const afterNode = after?.geometry.nodes.find(node => node.id === action?.actionId)

const colors = {
  bg: '#0f172a',
  panel: '#111827',
  card: '#1f2937',
  border: '#334155',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#38bdf8',
  success: '#34d399',
  warning: '#f59e0b',
}

function label(value: unknown): string {
  if (value === undefined || value === null) return 'n/a'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function card(title: string, lines: string[], accent = colors.border) {
  return box({
    style: {
      backgroundColor: colors.card,
      borderColor: accent,
      borderWidth: 1,
      borderRadius: 14,
      padding: 18,
      gap: 8,
    },
  }, [
    text({ text: title, font: '700 18px Inter, system-ui', lineHeight: 24, style: { color: colors.text } }),
    ...lines.map(line => text({ text: line, font: '14px Inter, system-ui', lineHeight: 21, style: { color: colors.muted } })),
  ])
}

function framePreview(title: string, node: typeof beforeNode | typeof afterNode, status: string) {
  const bounds = node?.bounds
  return box({
    style: {
      flex: 1,
      backgroundColor: '#020617',
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 18,
      gap: 14,
    },
  }, [
    text({ text: title, font: '700 17px Inter, system-ui', lineHeight: 24, style: { color: colors.text } }),
    box({
      style: {
        height: 178,
        backgroundColor: colors.panel,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 18,
        gap: 12,
      },
    }, [
      text({ text: 'Claims review surface', font: '700 15px Inter, system-ui', lineHeight: 20, style: { color: colors.text } }),
      text({ text: 'CLM-1042 / Northstar Fabrication', font: '14px Inter, system-ui', lineHeight: 20, style: { color: colors.muted } }),
      box({
        style: {
          width: bounds ? Math.max(132, Math.min(220, bounds.width)) : 160,
          height: bounds ? Math.max(38, Math.min(54, bounds.height)) : 44,
          backgroundColor: status === 'completed' ? '#064e3b' : '#1e3a8a',
          borderColor: status === 'completed' ? colors.success : colors.accent,
          borderWidth: 2,
          borderRadius: 10,
          padding: 10,
        },
      }, [
        text({ text: target?.title ?? 'Approve payout', font: '700 13px Inter, system-ui', lineHeight: 18, style: { color: colors.text } }),
      ]),
    ]),
    text({
      text: bounds
        ? `Target ${node?.id}: x ${Math.round(bounds.x)}, y ${Math.round(bounds.y)}, ${Math.round(bounds.width)}x${Math.round(bounds.height)}`
        : 'Target bounds unavailable',
      font: '13px Inter, system-ui',
      lineHeight: 19,
      style: { color: colors.muted },
    }),
  ])
}

function timelineItem(index: number, title: string, detail: string) {
  const active = selectedStep.value === index
  return box({
    onClick: () => {
      selectedStep.value = index
    },
    style: {
      backgroundColor: active ? '#0c4a6e' : colors.card,
      borderColor: active ? colors.accent : colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      gap: 4,
    },
    semantic: { id: `replay-step-${index}`, role: 'button', ariaLabel: title },
  }, [
    text({ text: title, font: '700 14px Inter, system-ui', lineHeight: 19, style: { color: colors.text } }),
    text({ text: detail, font: '12px Inter, system-ui', lineHeight: 17, style: { color: colors.muted } }),
  ])
}

function root() {
  const selected =
    selectedStep.value === 0
      ? 'Agent inspected semantic geometry and selected the action id.'
      : selectedStep.value === 1
        ? 'Gateway paused execution until a manager approval was recorded.'
        : 'Replay now contains frame-before, output, approval, and frame-after proof.'

  return box({
    style: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.bg,
      padding: 28,
      gap: 22,
    },
  }, [
    box({ style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } }, [
      box({ style: { gap: 6 } }, [
        text({ text: 'Agent-Native Audit Replay Viewer', font: '800 30px Inter, system-ui', lineHeight: 38, style: { color: colors.text } }),
        text({ text: 'A visual packet of exactly what the agent saw, requested, approved, and completed.', font: '15px Inter, system-ui', lineHeight: 22, style: { color: colors.muted } }),
      ]),
      card('Replay artifact', [
        `Session ${replay.sessionId}`,
        `${replay.frames.length} frames / ${replay.actions.length} action`,
      ], colors.accent),
    ]),
    box({ style: { flexDirection: 'row', gap: 16 } }, [
      timelineItem(0, '1. Inspect', `${before?.geometry.nodes.length ?? 0} geometry nodes`),
      timelineItem(1, '2. Approval', `${action?.approval?.actor ?? 'manager'} approved`),
      timelineItem(2, '3. Completion', `${label(action?.output)}`),
    ]),
    card('Selected replay step', [selected], selectedStep.value === 2 ? colors.success : colors.accent),
    box({ style: { flexDirection: 'row', gap: 18, flex: 1 } }, [
      framePreview('Frame before', beforeNode, 'pending'),
      framePreview('Frame after', afterNode, action?.status ?? 'completed'),
    ]),
    box({ style: { flexDirection: 'row', gap: 18 } }, [
      card('Action contract', [
        `id: ${action?.actionId ?? 'unknown'}`,
        `risk: ${target?.risk ?? 'unknown'}`,
        `requires confirmation: ${target?.requiresConfirmation ? 'yes' : 'no'}`,
      ], colors.warning),
      card('Audit result', [
        `status: ${action?.status ?? 'unknown'}`,
        `approval: ${action?.approval?.approved ? 'approved' : 'not approved'}`,
        `output: ${label(action?.output)}`,
      ], colors.success),
    ]),
  ])
}

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer(canvas)
createApp(root, renderer).mount()
