import { box, text } from '@geometra/core'
import type { UIElement, EventHandlers } from '@geometra/core'

let inputMeasureCtx: CanvasRenderingContext2D | null = null

function getInputMeasureCtx(): CanvasRenderingContext2D | null {
  if (inputMeasureCtx) return inputMeasureCtx
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  inputMeasureCtx = canvas.getContext('2d')
  return inputMeasureCtx
}

function getCaretOffsetFromLocalX(textValue: string, localX: number): number {
  if (textValue.length === 0) return 0
  const clampedX = Math.max(0, localX)
  const ctx = getInputMeasureCtx()
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

  const displayLeft = leftText.replace(/ /g, '\u00A0')
  const displayRight = rightText.replace(/ /g, '\u00A0')

  const children: UIElement[] = []
  if (showPlaceholder) {
    if (focused) {
      children.push(box({ width: 1.5, minHeight: 14, backgroundColor: '#38bdf8' }, []))
    }
    children.push(text({ text: placeholder, font: '13px Inter', lineHeight: 18, color: '#64748b' }))
  } else {
    if (displayLeft.length > 0) {
      children.push(text({ text: displayLeft, font: '13px Inter', lineHeight: 18, color: '#e2e8f0' }))
    }
    if (focused) {
      children.push(box({ width: 1.5, minHeight: 14, backgroundColor: '#38bdf8' }, []))
    }
    if (displayRight.length > 0) {
      children.push(text({ text: displayRight, font: '13px Inter', lineHeight: 18, color: '#e2e8f0' }))
    }
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
    const nextOffset = getCaretOffsetFromLocalX(value.replace(/ /g, '\u00A0'), localX)
    options.onCaretOffsetChange(nextOffset)
  }

  return box(
    {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 0,
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

export interface CheckboxOptions {
  checked?: boolean
  disabled?: boolean
  onChange?: (checked: boolean) => void
}

export function checkbox(label: string, options: CheckboxOptions = {}): UIElement {
  const checked = options.checked === true
  const disabled = options.disabled === true
  const borderColor = disabled ? '#475569' : checked ? '#22c55e' : '#64748b'
  const bg = disabled ? '#0f172a' : checked ? '#14532d' : '#111827'

  const toggle = () => {
    if (disabled) return
    options.onChange?.(!checked)
  }

  return box(
    {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      cursor: disabled ? 'not-allowed' : 'pointer',
      semantic: { role: 'checkbox', ariaLabel: label, ariaSelected: checked, ariaDisabled: disabled },
      onClick: toggle,
      onKeyDown: (e) => {
        if (e.key === ' ' || e.key === 'Enter') toggle()
      },
    },
    [
      box(
        {
          width: 16,
          height: 16,
          borderRadius: 4,
          borderColor,
          borderWidth: 1,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        checked
          ? [text({ text: '✓', font: 'bold 11px Inter', lineHeight: 12, color: disabled ? '#94a3b8' : '#86efac' })]
          : [],
      ),
      text({
        text: label,
        font: '13px Inter',
        lineHeight: 18,
        color: disabled ? '#64748b' : '#e2e8f0',
      }),
    ],
  )
}

export interface RadioOptions {
  checked?: boolean
  disabled?: boolean
  onSelect?: () => void
}

export function radio(label: string, options: RadioOptions = {}): UIElement {
  const checked = options.checked === true
  const disabled = options.disabled === true
  const borderColor = disabled ? '#475569' : checked ? '#38bdf8' : '#64748b'

  const select = () => {
    if (disabled || checked) return
    options.onSelect?.()
  }

  return box(
    {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      cursor: disabled ? 'not-allowed' : 'pointer',
      semantic: { role: 'radio', ariaLabel: label, ariaSelected: checked, ariaDisabled: disabled },
      onClick: select,
      onKeyDown: (e) => {
        if (e.key === ' ' || e.key === 'Enter') select()
      },
    },
    [
      box(
        {
          width: 16,
          height: 16,
          borderRadius: 8,
          borderColor,
          borderWidth: 1,
          backgroundColor: '#111827',
          alignItems: 'center',
          justifyContent: 'center',
        },
        checked
          ? [box({ width: 8, height: 8, borderRadius: 4, backgroundColor: disabled ? '#64748b' : '#38bdf8' }, [])]
          : [],
      ),
      text({
        text: label,
        font: '13px Inter',
        lineHeight: 18,
        color: disabled ? '#64748b' : '#e2e8f0',
      }),
    ],
  )
}

export interface TabItem {
  label: string
  content: UIElement
}

export interface TabsOptions {
  activeIndex?: number
  onTabChange?: (index: number) => void
}

export function tabs(items: TabItem[], options: TabsOptions = {}): UIElement {
  const activeIndex = Math.max(0, Math.min(options.activeIndex ?? 0, Math.max(0, items.length - 1)))
  const active = items[activeIndex]
  return box(
    {
      flexDirection: 'column',
      gap: 10,
      semantic: { role: 'tablist' },
    },
    [
      box(
        {
          flexDirection: 'row',
          gap: 6,
          flexWrap: 'wrap',
        },
        items.map((item, idx) =>
          box(
            {
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 6,
              paddingBottom: 6,
              borderRadius: 8,
              borderColor: idx === activeIndex ? '#38bdf8' : '#334155',
              borderWidth: 1,
              backgroundColor: idx === activeIndex ? '#082f49' : '#111827',
              cursor: 'pointer',
              semantic: { role: 'tab', ariaLabel: item.label, ariaSelected: idx === activeIndex },
              onClick: () => options.onTabChange?.(idx),
            },
            [text({ text: item.label, font: '13px Inter', lineHeight: 18, color: idx === activeIndex ? '#bae6fd' : '#cbd5e1' })],
          ),
        ),
      ),
      box(
        {
          borderColor: '#334155',
          borderWidth: 1,
          borderRadius: 10,
          padding: 12,
          semantic: { role: 'tabpanel' },
        },
        active ? [active.content] : [],
      ),
    ],
  )
}
