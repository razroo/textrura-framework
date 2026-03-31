import { box, text } from '@geometra/core'
import type { UIElement, EventHandlers } from '@geometra/core'

export function button(label: string, onClick?: EventHandlers['onClick']): UIElement {
  return box(
    {
      paddingLeft: 12,
      paddingRight: 12,
      paddingTop: 8,
      paddingBottom: 8,
      borderRadius: 8,
      backgroundColor: '#2563eb',
      cursor: 'pointer',
      onClick,
    },
    [text({ text: label, font: '13px Inter', lineHeight: 18, color: '#ffffff' })],
  )
}

export function input(value: string, placeholder = ''): UIElement {
  const content = value.length > 0 ? value : placeholder
  return box(
    {
      paddingLeft: 10,
      paddingRight: 10,
      paddingTop: 8,
      paddingBottom: 8,
      borderColor: '#334155',
      borderWidth: 1,
      borderRadius: 8,
      semantic: { tag: 'input' },
    },
    [text({ text: content, font: '13px Inter', lineHeight: 18, color: value ? '#e2e8f0' : '#64748b' })],
  )
}

export function list(items: string[]): UIElement {
  return box(
    { flexDirection: 'column', gap: 4, semantic: { tag: 'ul' } },
    items.map((item) =>
      box({ paddingLeft: 8, paddingTop: 4, paddingBottom: 4, semantic: { tag: 'li' } }, [
        text({ text: item, font: '13px Inter', lineHeight: 18, color: '#e2e8f0' }),
      ]),
    ),
  )
}

export function dialog(title: string, body: string, actions: UIElement[] = []): UIElement {
  return box(
    {
      flexDirection: 'column',
      gap: 10,
      padding: 14,
      borderRadius: 10,
      borderColor: '#334155',
      borderWidth: 1,
      backgroundColor: '#0f172a',
      semantic: { role: 'dialog', ariaLabel: title },
    },
    [
      text({ text: title, font: 'bold 16px Inter', lineHeight: 20, color: '#f8fafc' }),
      text({ text: body, font: '13px Inter', lineHeight: 18, color: '#cbd5e1' }),
      box({ flexDirection: 'row', gap: 8 }, actions),
    ],
  )
}
