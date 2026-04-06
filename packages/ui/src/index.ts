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
  const clampedX = Number.isFinite(localX) ? Math.max(0, localX) : 0
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

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

export interface LinkOptions {
  /** Font CSS shorthand (default: '12px Inter'). */
  font?: string
  /** Text color (default: '#38bdf8' — cyan). */
  color?: string
  /** Line height in pixels (default: 16). */
  lineHeight?: number
  /** Open in new tab (default: true). */
  newTab?: boolean
}

/**
 * Inline text link that opens a URL on click.
 *
 * Renders with link-style color and pointer cursor. Clicking opens the
 * href via `window.open`.
 */
export function link(label: string, href: string, options: LinkOptions = {}): UIElement {
  const {
    font = '12px Inter',
    color = '#38bdf8',
    lineHeight = 16,
    newTab = true,
  } = options
  return box(
    {
      cursor: 'pointer',
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(href, newTab ? '_blank' : '_self', newTab ? 'noopener,noreferrer' : undefined)
        }
      },
      semantic: { tag: 'a', role: 'link', ariaLabel: label },
    },
    [text({ text: label, font, lineHeight, color })],
  )
}

export interface InputOptions {
  /** When true, the field is non-interactive: no caret, keyboard, pointer, or composition handlers. */
  disabled?: boolean
  focused?: boolean
  caretOffset?: number
  selectionStart?: number
  selectionEnd?: number
  onCaretOffsetChange?: (offset: number) => void
  onSelectAll?: () => void
  onClick?: EventHandlers['onClick']
  onKeyDown?: EventHandlers['onKeyDown']
  onCompositionStart?: EventHandlers['onCompositionStart']
  onCompositionUpdate?: EventHandlers['onCompositionUpdate']
  onCompositionEnd?: EventHandlers['onCompositionEnd']
}

export function input(value: string, placeholder = '', options: InputOptions = {}): UIElement {
  const disabled = options.disabled === true
  const focused = !disabled && options.focused === true
  const valueColor = disabled ? '#64748b' : '#e2e8f0'
  const placeholderColor = disabled ? '#475569' : '#64748b'
  const maxOffset = value.length
  const requestedCaret = options.caretOffset
  const caretBase =
    requestedCaret === undefined || !Number.isFinite(requestedCaret) ? maxOffset : requestedCaret
  const caretOffset = Math.max(0, Math.min(caretBase, maxOffset))
  const showPlaceholder = value.length === 0

  const rawSelStart = options.selectionStart
  const rawSelEnd = options.selectionEnd
  const s0 =
    rawSelStart === undefined || !Number.isFinite(rawSelStart) ? caretOffset : rawSelStart
  const s1 = rawSelEnd === undefined || !Number.isFinite(rawSelEnd) ? caretOffset : rawSelEnd
  const selStart = Math.max(0, Math.min(Math.min(s0, s1), maxOffset))
  const selEnd = Math.max(0, Math.min(Math.max(s0, s1), maxOffset))
  const hasSelection = focused && selStart !== selEnd

  const children: UIElement[] = []
  if (showPlaceholder) {
    if (focused) {
      children.push(box({ width: 1.5, minHeight: 14, backgroundColor: '#38bdf8' }, []))
    }
    children.push(text({ text: placeholder, font: '13px Inter', lineHeight: 18, color: placeholderColor }))
  } else if (hasSelection) {
    const beforeSel = value.slice(0, selStart).replace(/ /g, '\u00A0')
    const selectedText = value.slice(selStart, selEnd).replace(/ /g, '\u00A0')
    const afterSel = value.slice(selEnd).replace(/ /g, '\u00A0')
    if (beforeSel.length > 0) {
      children.push(text({ text: beforeSel, font: '13px Inter', lineHeight: 18, color: valueColor }))
    }
    children.push(
      box(
        { backgroundColor: 'rgba(56, 189, 248, 0.3)', borderRadius: 2 },
        [text({ text: selectedText, font: '13px Inter', lineHeight: 18, color: valueColor })],
      ),
    )
    if (afterSel.length > 0) {
      children.push(text({ text: afterSel, font: '13px Inter', lineHeight: 18, color: valueColor }))
    }
  } else {
    const leftText = value.slice(0, caretOffset)
    const rightText = value.slice(caretOffset)
    const displayLeft = leftText.replace(/ /g, '\u00A0')
    const displayRight = rightText.replace(/ /g, '\u00A0')
    if (displayLeft.length > 0) {
      children.push(text({ text: displayLeft, font: '13px Inter', lineHeight: 18, color: valueColor }))
    }
    if (focused) {
      children.push(box({ width: 1.5, minHeight: 14, backgroundColor: '#38bdf8' }, []))
    }
    if (displayRight.length > 0) {
      children.push(text({ text: displayRight, font: '13px Inter', lineHeight: 18, color: valueColor }))
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

  const wrappedKeyDown: EventHandlers['onKeyDown'] | undefined =
    (options.onKeyDown || options.onSelectAll)
      ? (e) => {
          const keyIsSelectAll =
            typeof e.key === 'string' && e.key.toLowerCase() === 'a'
          if ((e.metaKey || e.ctrlKey) && keyIsSelectAll && options.onSelectAll) {
            options.onSelectAll()
            return
          }
          options.onKeyDown?.(e)
        }
      : undefined

  return box(
    {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 0,
      paddingLeft: 10,
      paddingRight: 10,
      paddingTop: 8,
      paddingBottom: 8,
      borderColor: disabled ? '#475569' : focused ? '#38bdf8' : '#334155',
      borderWidth: 1,
      borderRadius: 8,
      cursor: disabled ? 'not-allowed' : 'text',
      pointerEvents: disabled ? 'none' : undefined,
      backgroundColor: disabled ? '#0f172a' : focused ? '#111827' : undefined,
      semantic: disabled ? { tag: 'input', ariaDisabled: true } : { tag: 'input' },
      onClick: disabled ? undefined : handleClick,
      onKeyDown: disabled ? undefined : wrappedKeyDown,
      onCompositionStart: disabled ? undefined : options.onCompositionStart,
      onCompositionUpdate: disabled ? undefined : options.onCompositionUpdate,
      onCompositionEnd: disabled ? undefined : options.onCompositionEnd,
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

const toastVariantStyle: Record<
  'info' | 'success' | 'warning' | 'error',
  { border: string; background: string; color: string }
> = {
  info: { border: '#334155', background: '#0f172a', color: '#e2e8f0' },
  success: { border: '#166534', background: '#052e16', color: '#bbf7d0' },
  warning: { border: '#a16207', background: '#422006', color: '#fef08a' },
  error: { border: '#991b1b', background: '#450a0a', color: '#fecaca' },
}

export interface ToastOptions {
  /** Visual tone. Default `info`. */
  variant?: keyof typeof toastVariantStyle
  /** Optional title above the message. */
  title?: string
  onDismiss?: () => void
}

/**
 * Inline toast / status region (app controls visibility by swapping the tree).
 * Uses `role="status"` for assistive tech.
 */
export function toast(message: string, options: ToastOptions = {}): UIElement {
  const variant = options.variant ?? 'info'
  const s = toastVariantStyle[variant]
  const children: UIElement[] = []
  if (options.title) {
    children.push(
      text({
        text: options.title,
        font: 'bold 13px Inter',
        lineHeight: 18,
        color: s.color,
      }),
    )
  }
  children.push(
    text({
      text: message,
      font: '13px Inter',
      lineHeight: 18,
      color: s.color,
    }),
  )
  const row: UIElement[] = [
    box({ flexDirection: 'column', gap: 4, flexGrow: 1 }, children),
  ]
  if (options.onDismiss) {
    row.push(
      box(
        {
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          borderRadius: 6,
          cursor: 'pointer',
          semantic: { role: 'button', ariaLabel: 'Dismiss' },
          onClick: options.onDismiss,
        },
        [text({ text: '✕', font: '12px Inter', lineHeight: 14, color: s.color })],
      ),
    )
  }
  return box(
    {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: s.border,
      backgroundColor: s.background,
      maxWidth: 360,
      semantic: { role: 'status', ariaLabel: options.title ? `${options.title}: ${message}` : message },
    },
    row,
  )
}

export interface CommandItem {
  id: string
  label: string
  shortcut?: string
}

export interface CommandPaletteOptions {
  onSelect?: (id: string) => void
}

/**
 * Command list surface (⌘K-style palette body). Selection is driven by the app
 * (filtering, keyboard) — this renders rows with optional shortcuts.
 */
export function commandPalette(commands: CommandItem[], options: CommandPaletteOptions = {}): UIElement {
  const muted = '#64748b'
  return box(
    {
      flexDirection: 'column',
      gap: 2,
      padding: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#334155',
      backgroundColor: '#020617',
      semantic: { role: 'listbox', ariaLabel: 'Commands' },
    },
    commands.map((cmd) =>
      box(
        {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 8,
          cursor: 'pointer',
          semantic: { role: 'option', ariaLabel: cmd.label },
          onClick: () => options.onSelect?.(cmd.id),
        },
        [
          text({ text: cmd.label, font: '13px Inter', lineHeight: 18, color: '#e2e8f0' }),
          cmd.shortcut
            ? text({ text: cmd.shortcut, font: '12px Inter', lineHeight: 16, color: muted })
            : box({ width: 1, height: 1 }, []),
        ],
      ),
    ),
  )
}

export interface MenuItem {
  id: string
  label: string
  disabled?: boolean
  /** Style as destructive (e.g. delete). */
  danger?: boolean
}

export interface MenuOptions {
  onSelect?: (id: string) => void
  /** Accessible name for the menu surface. */
  ariaLabel?: string
}

/**
 * Vertical menu (`role="menu"`). App owns open/close and positioning.
 */
export function menu(items: MenuItem[], options: MenuOptions = {}): UIElement {
  return box(
    {
      flexDirection: 'column',
      gap: 2,
      padding: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#334155',
      backgroundColor: '#020617',
      semantic: { role: 'menu', ariaLabel: options.ariaLabel ?? 'Menu' },
    },
    items.map((item) => {
      const color = item.disabled ? '#475569' : item.danger ? '#fca5a5' : '#e2e8f0'
      return box(
        {
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 8,
          cursor: item.disabled ? 'not-allowed' : 'pointer',
          semantic: {
            role: 'menuitem',
            ariaLabel: item.label,
            ariaDisabled: item.disabled === true,
          },
          onClick: item.disabled ? undefined : () => options.onSelect?.(item.id),
        },
        [text({ text: item.label, font: '13px Inter', lineHeight: 18, color })],
      )
    }),
  )
}

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectControlOptions {
  options: SelectOption[]
  /** Current value (may be empty string when unset). */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** When true, option list is shown (app toggles). */
  open: boolean
  onToggle?: () => void
}

/**
 * Select / dropdown trigger + optional `menu` panel. Caller should set `open: false`
 * after `onChange` if the panel should close.
 */
export function selectControl(opts: SelectControlOptions): UIElement {
  const selected = opts.options.find(o => o.value === opts.value)
  const label = selected?.label ?? opts.placeholder ?? 'Select…'
  const trigger = box(
    {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingLeft: 10,
      paddingRight: 10,
      paddingTop: 8,
      paddingBottom: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#334155',
      backgroundColor: '#0f172a',
      cursor: 'pointer',
      semantic: { role: 'button', ariaLabel: 'Select', ariaExpanded: opts.open },
      onClick: () => opts.onToggle?.(),
    },
    [
      text({ text: label, font: '13px Inter', lineHeight: 18, color: '#e2e8f0' }),
      text({
        text: opts.open ? '▲' : '▼',
        font: '10px Inter',
        lineHeight: 18,
        color: '#94a3b8',
      }),
    ],
  )
  if (!opts.open) {
    return box({ flexDirection: 'column', gap: 4 }, [trigger])
  }
  const panel = menu(
    opts.options.map(o => ({
      id: o.value,
      label: o.label,
      disabled: o.disabled,
    })),
    {
      ariaLabel: 'Options',
      onSelect: (id) => opts.onChange(id),
    },
  )
  return box({ flexDirection: 'column', gap: 4 }, [trigger, panel])
}

export interface DataTableColumn {
  key: string
  header: string
}

export interface DataTableOptions {
  /** Invoked with row index when a data row is clicked. */
  onRowClick?: (rowIndex: number) => void
  ariaLabel?: string
}

/**
 * Simple columnar table (header + uniform rows). Keys in each row match `columns[].key`.
 */
export function dataTable(
  columns: DataTableColumn[],
  rows: Array<Record<string, string>>,
  options: DataTableOptions = {},
): UIElement {
  const headerRow = box(
    {
      flexDirection: 'row',
      gap: 8,
      paddingBottom: 8,
      semantic: { role: 'row' },
    },
    columns.map(col =>
      box(
        { flexGrow: 1, semantic: { role: 'columnheader', ariaLabel: col.header } },
        [text({ text: col.header, font: 'bold 12px Inter', lineHeight: 16, color: '#94a3b8' })],
      ),
    ),
  )
  const divider = box({ height: 1, backgroundColor: '#334155' }, [])
  const bodyRows = rows.map((row, ri) =>
    box(
      {
        flexDirection: 'row',
        gap: 8,
        paddingTop: 6,
        paddingBottom: 6,
        cursor: options.onRowClick ? 'pointer' : 'default',
        semantic: { role: 'row' },
        onClick: options.onRowClick ? () => options.onRowClick?.(ri) : undefined,
      },
      columns.map(col =>
        box({ flexGrow: 1, semantic: { role: 'cell' } }, [
          text({ text: row[col.key] ?? '', font: '13px Inter', lineHeight: 18, color: '#e2e8f0' }),
        ]),
      ),
    ),
  )
  return box(
    {
      flexDirection: 'column',
      gap: 0,
      semantic: { role: 'table', ariaLabel: options.ariaLabel ?? 'Table' },
    },
    [headerRow, divider, ...bodyRows],
  )
}

export interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
}

export interface TreeViewOptions {
  /** Expanded branch ids. */
  expandedIds: ReadonlySet<string>
  onToggle: (id: string) => void
  selectedId?: string
  onSelect?: (id: string) => void
  ariaLabel?: string
}

function treeNodeElement(node: TreeNode, depth: number, options: TreeViewOptions): UIElement {
  const hasChildren = !!(node.children && node.children.length > 0)
  const expanded = options.expandedIds.has(node.id)
  const selected = options.selectedId === node.id
  const row = box(
    {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 8 + depth * 14,
      paddingTop: 4,
      paddingBottom: 4,
      borderRadius: 6,
      backgroundColor: selected ? '#1e3a5f' : undefined,
      cursor: 'pointer',
      semantic: {
        role: 'treeitem',
        ariaLabel: node.label,
        ariaExpanded: hasChildren ? expanded : undefined,
      },
      onClick: () => {
        if (hasChildren) options.onToggle(node.id)
        options.onSelect?.(node.id)
      },
    },
    [
      hasChildren
        ? text({
            text: expanded ? '▼' : '▶',
            font: '10px Inter',
            lineHeight: 14,
            color: '#94a3b8',
          })
        : box({ width: 14 }, []),
      text({ text: node.label, font: '13px Inter', lineHeight: 18, color: '#e2e8f0' }),
    ],
  )
  if (!hasChildren || !expanded) return row
  return box(
    { flexDirection: 'column', gap: 2 },
    [
      row,
      ...node.children!.map(c => treeNodeElement(c, depth + 1, options)),
    ],
  )
}

/**
 * Expandable tree (`role="tree"`). Expansion and selection are app-controlled.
 */
export function treeView(nodes: TreeNode[], options: TreeViewOptions): UIElement {
  return box(
    {
      flexDirection: 'column',
      gap: 2,
      semantic: { role: 'tree', ariaLabel: options.ariaLabel ?? 'Tree' },
    },
    nodes.map(n => treeNodeElement(n, 0, options)),
  )
}

export interface ComboboxFieldOptions {
  /** Props forwarded to `input()` (caret, key handlers, etc.). */
  input: InputOptions
  onPickSuggestion?: (value: string) => void
}

/**
 * Text field stacked above a `commandPalette` of suggestions (app filters the list).
 */
export function comboboxField(
  value: string,
  placeholder: string,
  suggestions: CommandItem[],
  options: ComboboxFieldOptions,
): UIElement {
  const palette = commandPalette(suggestions, {
    onSelect: (id) => options.onPickSuggestion?.(id),
  })
  return box(
    { flexDirection: 'column', gap: 8 },
    [input(value, placeholder, options.input), palette],
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface CardOptions {
  header?: UIElement
  footer?: UIElement
  children?: UIElement[]
  borderColor?: string
  backgroundColor?: string
  gap?: number
}

export function card(options: CardOptions = {}): UIElement {
  const sections: UIElement[] = []
  if (options.header) {
    sections.push(
      box({ paddingLeft: 16, paddingRight: 16, paddingTop: 14, paddingBottom: 14, borderBottom: 1, borderColor: options.borderColor ?? '#334155', minWidth: 0 }, [options.header]),
    )
  }
  if (options.children && options.children.length > 0) {
    sections.push(box({ flexDirection: 'column', padding: 16, gap: options.gap ?? 14, minWidth: 0 }, options.children))
  }
  if (options.footer) {
    sections.push(
      box({ paddingLeft: 16, paddingRight: 16, paddingTop: 14, paddingBottom: 14, borderTop: 1, borderColor: options.borderColor ?? '#334155', minWidth: 0 }, [options.footer]),
    )
  }
  return box(
    {
      flexDirection: 'column',
      minWidth: 0,
      borderRadius: 10, borderWidth: 1,
      borderColor: options.borderColor ?? '#334155',
      backgroundColor: options.backgroundColor ?? '#0f172a',
      overflow: 'hidden',
    },
    sections,
  )
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

const badgeVariantStyle = {
  default: { bg: '#334155', color: '#e2e8f0' },
  success: { bg: '#14532d', color: '#bbf7d0' },
  warning: { bg: '#422006', color: '#fef08a' },
  error: { bg: '#450a0a', color: '#fecaca' },
  info: { bg: '#082f49', color: '#bae6fd' },
} as const

export interface BadgeOptions {
  variant?: keyof typeof badgeVariantStyle
}

export function badge(label: string, options: BadgeOptions = {}): UIElement {
  const s = badgeVariantStyle[options.variant ?? 'default']
  return box(
    {
      paddingLeft: 8, paddingRight: 8, paddingTop: 2, paddingBottom: 2,
      borderRadius: 9999, backgroundColor: s.bg,
    },
    [text({ text: label, font: 'bold 11px Inter', lineHeight: 14, color: s.color })],
  )
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

export interface SeparatorOptions {
  direction?: 'horizontal' | 'vertical'
  color?: string
}

export function separator(options: SeparatorOptions = {}): UIElement {
  const vertical = options.direction === 'vertical'
  const color = options.color ?? '#334155'
  return box(
    vertical
      ? { width: 1, alignSelf: 'stretch', backgroundColor: color, semantic: { role: 'separator' } }
      : { height: 1, alignSelf: 'stretch', backgroundColor: color, semantic: { role: 'separator' } },
    [],
  )
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

export interface AvatarOptions {
  size?: number
  backgroundColor?: string
}

export function avatar(name: string, options: AvatarOptions = {}): UIElement {
  const size = options.size ?? 32
  const bg = options.backgroundColor ?? '#2563eb'
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('')
  const fontSize = Math.max(10, Math.round(size * 0.4))
  return box(
    {
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
      semantic: { ariaLabel: name },
    },
    [text({ text: initials, font: `bold ${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.2), color: '#ffffff' })],
  )
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

const alertVariantStyle = {
  info: { border: '#334155', bg: '#0f172a', color: '#e2e8f0', icon: 'ℹ' },
  success: { border: '#166534', bg: '#052e16', color: '#bbf7d0', icon: '✓' },
  warning: { border: '#a16207', bg: '#422006', color: '#fef08a', icon: '⚠' },
  error: { border: '#991b1b', bg: '#450a0a', color: '#fecaca', icon: '✕' },
} as const

export interface AlertOptions {
  variant?: keyof typeof alertVariantStyle
  title?: string
  onDismiss?: () => void
}

export function alert(message: string, options: AlertOptions = {}): UIElement {
  const variant = options.variant ?? 'info'
  const s = alertVariantStyle[variant]
  const content: UIElement[] = []
  if (options.title) {
    content.push(text({ text: options.title, font: 'bold 13px Inter', lineHeight: 18, color: s.color }))
  }
  content.push(text({ text: message, font: '13px Inter', lineHeight: 18, color: s.color }))

  const body: UIElement[] = [
    text({ text: s.icon, font: '13px Inter', lineHeight: 18, color: s.color }),
    box({ flexDirection: 'column', gap: 4, flexGrow: 1, flexShrink: 1, minWidth: 0 }, content),
  ]
  if (options.onDismiss) {
    body.push(
      box(
        {
          paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4,
          borderRadius: 6, cursor: 'pointer',
          semantic: { role: 'button', ariaLabel: 'Dismiss' },
          onClick: options.onDismiss,
        },
        [text({ text: '✕', font: '12px Inter', lineHeight: 14, color: s.color })],
      ),
    )
  }
  return box(
    {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      padding: 12, borderRadius: 10, borderWidth: 1, minWidth: 0,
      borderColor: s.border, backgroundColor: s.bg,
      semantic: { role: 'alert', ariaLabel: options.title ? `${options.title}: ${message}` : message },
    },
    body,
  )
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface ProgressOptions {
  label?: string
}

export function progress(value: number, options: ProgressOptions = {}): UIElement {
  const clamped = Math.max(0, Math.min(100, value))
  const children: UIElement[] = []
  if (options.label) {
    children.push(
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
        text({ text: options.label, font: '12px Inter', lineHeight: 16, color: '#94a3b8' }),
        text({ text: `${Math.round(clamped)}%`, font: '12px Inter', lineHeight: 16, color: '#94a3b8' }),
      ]),
    )
  }
  children.push(
    box(
      { flexDirection: 'row', height: 6, borderRadius: 3, backgroundColor: '#334155', overflow: 'hidden' },
      [
        box({ flexGrow: Math.max(clamped, 0.001), minWidth: 0, height: 6, borderRadius: 3, backgroundColor: '#2563eb' }),
        box({ flexGrow: Math.max(100 - clamped, 0.001), minWidth: 0, height: 6 }),
      ],
    ),
  )
  return box(
    {
      flexDirection: 'column', gap: 6,
      semantic: { role: 'progressbar', ariaLabel: options.label ?? 'Progress' },
    },
    children,
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export interface SkeletonOptions {
  width?: number
  height?: number
  borderRadius?: number
}

export function skeleton(options: SkeletonOptions = {}): UIElement {
  return box(
    {
      width: options.width ?? 100,
      height: options.height ?? 16,
      borderRadius: options.borderRadius ?? 4,
      backgroundColor: '#1e293b',
    },
    [],
  )
}

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

export interface BreadcrumbOptions {
  separator?: string
}

export function breadcrumb(items: BreadcrumbItem[], options: BreadcrumbOptions = {}): UIElement {
  const sep = options.separator ?? '/'
  const children: UIElement[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const isLast = i === items.length - 1
    if (item.onClick && !isLast) {
      children.push(
        box(
          { cursor: 'pointer', onClick: item.onClick },
          [text({ text: item.label, font: '13px Inter', lineHeight: 18, color: '#38bdf8' })],
        ),
      )
    } else {
      children.push(
        text({ text: item.label, font: '13px Inter', lineHeight: 18, color: isLast ? '#e2e8f0' : '#94a3b8' }),
      )
    }
    if (!isLast) {
      children.push(text({ text: ` ${sep} `, font: '13px Inter', lineHeight: 18, color: '#475569' }))
    }
  }
  return box(
    {
      flexDirection: 'row', alignItems: 'center',
      semantic: { tag: 'nav', ariaLabel: 'Breadcrumb' },
    },
    children,
  )
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginationOptions {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function pagination(options: PaginationOptions): UIElement {
  const { page, totalPages, onPageChange } = options
  const current = Math.max(1, Math.min(page, totalPages))

  const pageBtn = (label: string, target: number, active: boolean, disabled: boolean): UIElement =>
    box(
      {
        paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4,
        borderRadius: 6,
        borderWidth: active ? 1 : 0,
        borderColor: active ? '#38bdf8' : undefined,
        backgroundColor: active ? '#082f49' : undefined,
        cursor: disabled ? 'not-allowed' : 'pointer',
        onClick: disabled ? undefined : () => onPageChange(target),
        semantic: { role: 'button', ariaLabel: label, ariaDisabled: disabled },
      },
      [text({ text: label, font: '13px Inter', lineHeight: 18, color: disabled ? '#475569' : active ? '#bae6fd' : '#e2e8f0' })],
    )

  const children: UIElement[] = [
    pageBtn('‹', current - 1, false, current <= 1),
  ]

  const start = Math.max(1, Math.min(current - 2, totalPages - 4))
  const end = Math.min(totalPages, start + 4)
  for (let p = start; p <= end; p++) {
    children.push(pageBtn(String(p), p, p === current, false))
  }

  children.push(pageBtn('›', current + 1, false, current >= totalPages))

  return box(
    {
      flexDirection: 'row', gap: 4, alignItems: 'center',
      semantic: { tag: 'nav', ariaLabel: 'Pagination' },
    },
    children,
  )
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

export interface SwitchOptions {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function switchControl(options: SwitchOptions): UIElement {
  const { checked, disabled } = options
  const isDisabled = disabled === true

  const toggle = () => {
    if (isDisabled) return
    options.onChange(!checked)
  }

  const trackBg = isDisabled ? '#1e293b' : checked ? '#166534' : '#334155'
  const thumbBg = isDisabled ? '#475569' : checked ? '#22c55e' : '#94a3b8'

  const track = box(
    {
      width: 36, height: 20, borderRadius: 10,
      backgroundColor: trackBg,
      flexDirection: 'row', alignItems: 'center',
      paddingLeft: checked ? 18 : 2,
      paddingRight: checked ? 2 : 18,
    },
    [box({ width: 16, height: 16, borderRadius: 8, backgroundColor: thumbBg }, [])],
  )

  const children: UIElement[] = [track]
  if (options.label) {
    children.push(text({ text: options.label, font: '13px Inter', lineHeight: 18, color: isDisabled ? '#64748b' : '#e2e8f0' }))
  }

  return box(
    {
      flexDirection: 'row', gap: 10, alignItems: 'center',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      semantic: { role: 'switch', ariaLabel: options.label ?? 'Toggle', ariaSelected: checked, ariaDisabled: isDisabled },
      onClick: toggle,
      onKeyDown: (e) => { if (e.key === ' ' || e.key === 'Enter') toggle() },
    },
    children,
  )
}

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------

export interface TextareaOptions {
  disabled?: boolean
  focused?: boolean
  rows?: number
  onKeyDown?: EventHandlers['onKeyDown']
  onClick?: EventHandlers['onClick']
}

export function textarea(value: string, placeholder = '', options: TextareaOptions = {}): UIElement {
  const disabled = options.disabled === true
  const focused = !disabled && options.focused === true
  const rows = options.rows ?? 4
  const minH = rows * 18 + 16
  const valueColor = disabled ? '#64748b' : '#e2e8f0'
  const placeholderColor = disabled ? '#475569' : '#64748b'
  const showPlaceholder = value.length === 0

  return box(
    {
      flexDirection: 'column',
      paddingLeft: 10, paddingRight: 10, paddingTop: 8, paddingBottom: 8,
      borderColor: disabled ? '#475569' : focused ? '#38bdf8' : '#334155',
      borderWidth: 1, borderRadius: 8,
      backgroundColor: disabled ? '#0f172a' : focused ? '#111827' : undefined,
      cursor: disabled ? 'not-allowed' : 'text',
      pointerEvents: disabled ? 'none' : undefined,
      minHeight: minH,
      semantic: disabled ? { tag: 'textarea', ariaDisabled: true } : { tag: 'textarea' },
      onClick: disabled ? undefined : options.onClick,
      onKeyDown: disabled ? undefined : options.onKeyDown,
    },
    [
      text({
        text: showPlaceholder ? placeholder : value,
        font: '13px Inter', lineHeight: 18,
        color: showPlaceholder ? placeholderColor : valueColor,
        whiteSpace: 'pre-wrap',
      }),
    ],
  )
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

export interface SliderOptions {
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
  label?: string
  disabled?: boolean
}

export function slider(options: SliderOptions): UIElement {
  const { value, onChange, disabled } = options
  const isDisabled = disabled === true
  const min = options.min ?? 0
  const max = options.max ?? 100
  const range = max - min || 1
  const pct = Math.max(0, Math.min(100, ((value - min) / range) * 100))

  const track = box(
    {
      height: 6, borderRadius: 3, backgroundColor: '#334155',
      flexDirection: 'row', overflow: 'hidden',
    },
    [box({ width: pct, height: 6, backgroundColor: isDisabled ? '#475569' : '#2563eb' }, [])],
  )

  const topRow: UIElement[] = []
  if (options.label) {
    topRow.push(
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
        text({ text: options.label, font: '12px Inter', lineHeight: 16, color: '#94a3b8' }),
        text({ text: String(Math.round(value)), font: '12px Inter', lineHeight: 16, color: '#94a3b8' }),
      ]),
    )
  }

  const handleClick = isDisabled
    ? undefined
    : (e: { x: number; y: number; localX?: number }) => {
        const localX = e.localX ?? e.x
        const fraction = Math.max(0, Math.min(1, localX / 200))
        onChange(Math.round(min + fraction * range))
      }

  return box(
    {
      flexDirection: 'column', gap: 6,
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      semantic: { role: 'slider', ariaLabel: options.label ?? 'Slider', ariaDisabled: isDisabled },
      onClick: handleClick,
    },
    [...topRow, track],
  )
}

// ---------------------------------------------------------------------------
// Accordion
// ---------------------------------------------------------------------------

export interface AccordionItem {
  id: string
  title: string
  content: UIElement
}

export interface AccordionOptions {
  expandedIds?: ReadonlySet<string>
  onToggle?: (id: string) => void
}

export function accordion(items: AccordionItem[], options: AccordionOptions = {}): UIElement {
  const expandedIds = options.expandedIds ?? new Set<string>()
  return box(
    {
      flexDirection: 'column',
      borderWidth: 1, borderColor: '#334155', borderRadius: 10, overflow: 'hidden',
    },
    items.map((item, i) => {
      const expanded = expandedIds.has(item.id)
      const header = box(
        {
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingLeft: 14, paddingRight: 14, paddingTop: 10, paddingBottom: 10,
          backgroundColor: '#0f172a', cursor: 'pointer',
          borderTop: i > 0 ? 1 : 0, borderColor: '#334155',
          semantic: { role: 'button', ariaLabel: item.title, ariaExpanded: expanded },
          onClick: () => options.onToggle?.(item.id),
        },
        [
          text({ text: item.title, font: 'bold 13px Inter', lineHeight: 18, color: '#e2e8f0' }),
          text({ text: expanded ? '▲' : '▼', font: '10px Inter', lineHeight: 14, color: '#94a3b8' }),
        ],
      )
      if (!expanded) return header
      return box({ flexDirection: 'column' }, [
        header,
        box(
          { padding: 14, backgroundColor: '#020617', borderTop: 1, borderColor: '#334155' },
          [item.content],
        ),
      ])
    }),
  )
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

export type SheetSide = 'left' | 'right' | 'top' | 'bottom'

export interface SheetOptions {
  side?: SheetSide
  open: boolean
  onClose?: () => void
  title?: string
  children?: UIElement[]
  width?: number
  height?: number
}

export function sheet(options: SheetOptions): UIElement {
  if (!options.open) return box({ display: 'none' }, [])

  const side = options.side ?? 'right'
  const isVertical = side === 'left' || side === 'right'
  const panelWidth = isVertical ? (options.width ?? 320) : undefined
  const panelHeight = !isVertical ? (options.height ?? 240) : undefined

  const header: UIElement[] = []
  if (options.title || options.onClose) {
    const headerChildren: UIElement[] = []
    if (options.title) {
      headerChildren.push(text({ text: options.title, font: 'bold 16px Inter', lineHeight: 20, color: '#f8fafc' }))
    }
    if (options.onClose) {
      headerChildren.push(
        box(
          {
            paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4,
            borderRadius: 6, cursor: 'pointer',
            semantic: { role: 'button', ariaLabel: 'Close' },
            onClick: options.onClose,
          },
          [text({ text: '✕', font: '12px Inter', lineHeight: 14, color: '#94a3b8' })],
        ),
      )
    }
    header.push(
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 }, headerChildren),
    )
  }

  const panel = box(
    {
      flexDirection: 'column',
      width: panelWidth, height: panelHeight,
      padding: 16, backgroundColor: '#0f172a',
      borderColor: '#334155',
      ...(side === 'left' ? { borderRight: 1 } : {}),
      ...(side === 'right' ? { borderLeft: 1 } : {}),
      ...(side === 'top' ? { borderBottom: 1 } : {}),
      ...(side === 'bottom' ? { borderTop: 1 } : {}),
      semantic: { role: 'dialog', ariaLabel: options.title ?? 'Panel' },
    },
    [...header, ...(options.children ?? [])],
  )

  const backdrop = box(
    {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      onClick: options.onClose,
    },
    [],
  )

  const containerAlign = side === 'right' ? 'flex-end' as const
    : side === 'bottom' ? 'flex-end' as const
    : 'flex-start' as const

  const containerDir = isVertical ? 'row' as const : 'column' as const

  return box(
    {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      flexDirection: containerDir, justifyContent: containerAlign,
      zIndex: 50,
    },
    [backdrop, panel],
  )
}
