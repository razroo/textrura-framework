import { box, text } from '@geometra/core'
import type { UIElement, EventHandlers } from '@geometra/core'

let caretMeasureCtx: CanvasRenderingContext2D | null = null

function getCaretMeasureCtx(): CanvasRenderingContext2D | null {
  if (caretMeasureCtx) return caretMeasureCtx
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  caretMeasureCtx = canvas.getContext('2d')
  return caretMeasureCtx
}

function getCaretOffsetFromLocalX(textValue: string, localX: number): number {
  if (textValue.length === 0) return 0
  const clampedX = Math.max(0, localX)
  const ctx = getCaretMeasureCtx()
  if (!ctx) {
    const approxCharWidth = 8
    return Math.max(0, Math.min(textValue.length, Math.round(clampedX / approxCharWidth)))
  }
  ctx.font = '13px Inter'
  let running = 0
  for (let i = 0; i < textValue.length; i++) {
    const ch = textValue[i]!
    const w = ctx.measureText(ch).width
    if (clampedX < running + w / 2) return i
    running += w
  }
  return textValue.length
}

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

export interface InputOptions {
  focused?: boolean
  caretOffset?: number
  onCaretOffsetChange?: (offset: number) => void
  onClick?: EventHandlers['onClick']
  onKeyDown?: EventHandlers['onKeyDown']
  onCompositionStart?: EventHandlers['onCompositionStart']
  onCompositionUpdate?: EventHandlers['onCompositionUpdate']
  onCompositionEnd?: EventHandlers['onCompositionEnd']
}

export function input(value: string, placeholder = '', options: InputOptions = {}): UIElement {
  const focused = options.focused === true
  const maxOffset = value.length
  const requestedOffset = options.caretOffset ?? maxOffset
  const caretOffset = Math.max(0, Math.min(requestedOffset, maxOffset))
  const leftText = value.slice(0, caretOffset)
  const rightText = value.slice(caretOffset)
  const showPlaceholder = value.length === 0

  const children: UIElement[] = []
  if (showPlaceholder) {
    children.push(text({ text: placeholder, font: '13px Inter', lineHeight: 18, color: '#64748b' }))
  } else {
    if (leftText.length > 0) {
      children.push(text({ text: leftText, font: '13px Inter', lineHeight: 18, color: '#e2e8f0' }))
    }
    if (focused) {
      children.push(box({ width: 1.5, minHeight: 14, backgroundColor: '#38bdf8' }, []))
    }
    if (rightText.length > 0) {
      children.push(text({ text: rightText, font: '13px Inter', lineHeight: 18, color: '#e2e8f0' }))
    }
  }
  if (focused && showPlaceholder) {
    children.push(box({ width: 1.5, minHeight: 14, backgroundColor: '#38bdf8' }, []))
  }

  const handleClick: EventHandlers['onClick'] = (e) => {
    options.onClick?.(e)
    if (!options.onCaretOffsetChange) return
    if (value.length === 0) {
      options.onCaretOffsetChange(0)
      return
    }
    const pointerX = e.localX ?? e.x
    const localX = pointerX - 10 // paddingLeft
    const nextOffset = getCaretOffsetFromLocalX(value, localX)
    options.onCaretOffsetChange(nextOffset)
  }

  return box(
    {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 10,
      paddingRight: 10,
      paddingTop: 8,
      paddingBottom: 8,
      borderColor: focused ? '#38bdf8' : '#334155',
      borderWidth: 1,
      borderRadius: 8,
      cursor: 'text',
      backgroundColor: focused ? '#111827' : undefined,
      semantic: { tag: 'input' },
      onClick: handleClick,
      onKeyDown: options.onKeyDown,
      onCompositionStart: options.onCompositionStart,
      onCompositionUpdate: options.onCompositionUpdate,
      onCompositionEnd: options.onCompositionEnd,
    },
    children,
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
