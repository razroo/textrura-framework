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
  const focused = options.focused === true
  const maxOffset = value.length
  const requestedOffset = options.caretOffset ?? maxOffset
  const caretOffset = Math.max(0, Math.min(requestedOffset, maxOffset))
  const showPlaceholder = value.length === 0

  const rawSelStart = options.selectionStart ?? caretOffset
  const rawSelEnd = options.selectionEnd ?? caretOffset
  const selStart = Math.max(0, Math.min(Math.min(rawSelStart, rawSelEnd), maxOffset))
  const selEnd = Math.max(0, Math.min(Math.max(rawSelStart, rawSelEnd), maxOffset))
  const hasSelection = focused && selStart !== selEnd

  const children: UIElement[] = []
  if (showPlaceholder) {
    if (focused) {
      children.push(box({ width: 1.5, minHeight: 14, backgroundColor: '#38bdf8' }, []))
    }
    children.push(text({ text: placeholder, font: '13px Inter', lineHeight: 18, color: '#64748b' }))
  } else if (hasSelection) {
    const beforeSel = value.slice(0, selStart).replace(/ /g, '\u00A0')
    const selectedText = value.slice(selStart, selEnd).replace(/ /g, '\u00A0')
    const afterSel = value.slice(selEnd).replace(/ /g, '\u00A0')
    if (beforeSel.length > 0) {
      children.push(text({ text: beforeSel, font: '13px Inter', lineHeight: 18, color: '#e2e8f0' }))
    }
    children.push(
      box(
        { backgroundColor: 'rgba(56, 189, 248, 0.3)', borderRadius: 2 },
        [text({ text: selectedText, font: '13px Inter', lineHeight: 18, color: '#e2e8f0' })],
      ),
    )
    if (afterSel.length > 0) {
      children.push(text({ text: afterSel, font: '13px Inter', lineHeight: 18, color: '#e2e8f0' }))
    }
  } else {
    const leftText = value.slice(0, caretOffset)
    const rightText = value.slice(caretOffset)
    const displayLeft = leftText.replace(/ /g, '\u00A0')
    const displayRight = rightText.replace(/ /g, '\u00A0')
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

  const wrappedKeyDown: EventHandlers['onKeyDown'] | undefined =
    (options.onKeyDown || options.onSelectAll)
      ? (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && options.onSelectAll) {
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
      borderColor: focused ? '#38bdf8' : '#334155',
      borderWidth: 1,
      borderRadius: 8,
      cursor: 'text',
      backgroundColor: focused ? '#111827' : undefined,
      semantic: { tag: 'input' },
      onClick: handleClick,
      onKeyDown: wrappedKeyDown,
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
