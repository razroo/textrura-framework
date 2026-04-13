import { box, bodyText, text } from '@geometra/core'
import type { UIElement, EventHandlers } from '@geometra/core'
import { theme, font, lineHeight } from './theme.js'

// Re-export theme API
export { theme, setTheme, peekTheme, mergeTheme, darkTheme, font, lineHeight } from './theme.js'
export type { Theme, ThemeColors, ThemeTypography, ThemeSpacing, ThemeRadii, DeepPartial } from './theme.js'

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
  ctx.font = font('', 'base')
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
  const t = theme()
  return box(
    {
      paddingLeft: 12,
      paddingRight: 12,
      paddingTop: 8,
      paddingBottom: 8,
      borderRadius: t.radii.md,
      backgroundColor: t.colors.accent,
      cursor: 'pointer',
      onClick,
    },
    [text({ text: label, font: font('', 'base'), lineHeight: lineHeight('base'), color: t.colors.accentText })],
  )
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

export interface LinkOptions {
  /** Font CSS shorthand (default: theme small font). */
  font?: string
  /** Text color (default: theme link color). */
  color?: string
  /** Line height in pixels (default: theme small line height). */
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
  const t = theme()
  const {
    font: fontOverride = font('', 'small'),
    color = t.colors.link,
    lineHeight: lhOverride = lineHeight('small'),
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
    [bodyText({ text: label, font: fontOverride, lineHeight: lhOverride, color })],
  )
}

export interface InputOptions {
  /** When true, the field is non-interactive: no caret, keyboard, pointer, or composition handlers. */
  disabled?: boolean
  /**
   * When true, the value is treated as read-only for accessibility (`ariaReadOnly`); handlers remain
   * wired so hosts can still route focus, selection, and navigation keys. Ignored when `disabled` is true.
   */
  readOnly?: boolean
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
  const t = theme()
  const disabled = options.disabled === true
  const readOnly = !disabled && options.readOnly === true
  const focused = !disabled && options.focused === true
  const valueColor = disabled ? t.colors.textDisabled : t.colors.text
  const placeholderColor = disabled ? t.colors.borderMuted : t.colors.textDisabled
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

  const f = font('', 'base')
  const lh = lineHeight('base')

  const children: UIElement[] = []
  if (showPlaceholder) {
    if (focused) {
      children.push(box({ width: 1.5, minHeight: 14, backgroundColor: t.colors.focus }, []))
    }
    children.push(text({ text: placeholder, font: f, lineHeight: lh, color: placeholderColor }))
  } else if (hasSelection) {
    const beforeSel = value.slice(0, selStart).replace(/ /g, '\u00A0')
    const selectedText = value.slice(selStart, selEnd).replace(/ /g, '\u00A0')
    const afterSel = value.slice(selEnd).replace(/ /g, '\u00A0')
    if (beforeSel.length > 0) {
      children.push(text({ text: beforeSel, font: f, lineHeight: lh, color: valueColor }))
    }
    children.push(
      box(
        { backgroundColor: t.colors.selectionBg, borderRadius: 2 },
        [text({ text: selectedText, font: f, lineHeight: lh, color: valueColor })],
      ),
    )
    if (afterSel.length > 0) {
      children.push(text({ text: afterSel, font: f, lineHeight: lh, color: valueColor }))
    }
  } else {
    const leftText = value.slice(0, caretOffset)
    const rightText = value.slice(caretOffset)
    const displayLeft = leftText.replace(/ /g, '\u00A0')
    const displayRight = rightText.replace(/ /g, '\u00A0')
    if (displayLeft.length > 0) {
      children.push(text({ text: displayLeft, font: f, lineHeight: lh, color: valueColor }))
    }
    if (focused) {
      children.push(box({ width: 1.5, minHeight: 14, backgroundColor: t.colors.focus }, []))
    }
    if (displayRight.length > 0) {
      children.push(text({ text: displayRight, font: f, lineHeight: lh, color: valueColor }))
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
      paddingLeft: t.spacing.md,
      paddingRight: t.spacing.md,
      paddingTop: 8,
      paddingBottom: 8,
      borderColor: disabled ? t.colors.borderMuted : focused ? t.colors.focus : t.colors.border,
      borderWidth: 1,
      borderRadius: t.radii.md,
      cursor: disabled ? 'not-allowed' : 'text',
      pointerEvents: disabled ? 'none' : undefined,
      backgroundColor: disabled ? t.colors.bg : focused ? t.colors.bgSubtle : undefined,
      semantic: disabled
        ? { tag: 'input', ariaDisabled: true }
        : readOnly
          ? { tag: 'input', ariaReadOnly: true }
          : { tag: 'input' },
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
  const t = theme()
  return box(
    { flexDirection: 'column', gap: t.spacing.xs, semantic: { tag: 'ul' } },
    items.map((item) =>
      box({ paddingLeft: 8, paddingTop: t.spacing.xs, paddingBottom: t.spacing.xs, semantic: { tag: 'li' } }, [
        bodyText({ text: item, font: font('', 'base'), lineHeight: lineHeight('base'), color: t.colors.text }),
      ]),
    ),
  )
}

export function dialog(title: string, body: string, actions: UIElement[] = []): UIElement {
  const t = theme()
  return box(
    {
      flexDirection: 'column',
      gap: t.spacing.md,
      padding: t.spacing.lg,
      borderRadius: t.radii.lg,
      borderColor: t.colors.border,
      borderWidth: 1,
      backgroundColor: t.colors.bg,
      semantic: { role: 'dialog', ariaLabel: title },
    },
    [
      bodyText({ text: title, font: font('bold', 'heading'), lineHeight: lineHeight('heading'), color: t.colors.textHeading }),
      bodyText({ text: body, font: font('', 'base'), lineHeight: lineHeight('base'), color: t.colors.textSubtle }),
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
  const t = theme()
  const checked = options.checked === true
  const disabled = options.disabled === true
  const borderColor = disabled ? t.colors.borderMuted : checked ? t.colors.success : t.colors.textDisabled
  const bg = disabled ? t.colors.bg : checked ? t.colors.successBg : t.colors.bgSubtle

  const toggle = () => {
    if (disabled) return
    options.onChange?.(!checked)
  }

  return box(
    {
      flexDirection: 'row',
      gap: t.spacing.md,
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
          borderRadius: t.radii.sm,
          borderColor,
          borderWidth: 1,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        checked
          ? [text({ text: '✓', font: `bold 11px ${t.typography.fontFamily}`, lineHeight: 12, color: disabled ? t.colors.textMuted : t.colors.successTextLight })]
          : [],
      ),
      box({ flexGrow: 1, minWidth: 0 }, [
        bodyText({
          text: label,
          font: font('', 'base'),
          lineHeight: lineHeight('base'),
          color: disabled ? t.colors.textDisabled : t.colors.text,
        }),
      ]),
    ],
  )
}

export interface RadioOptions {
  checked?: boolean
  disabled?: boolean
  onSelect?: () => void
}

export function radio(label: string, options: RadioOptions = {}): UIElement {
  const t = theme()
  const checked = options.checked === true
  const disabled = options.disabled === true
  const borderColor = disabled ? t.colors.borderMuted : checked ? t.colors.focus : t.colors.textDisabled

  const select = () => {
    if (disabled || checked) return
    options.onSelect?.()
  }

  return box(
    {
      flexDirection: 'row',
      gap: t.spacing.md,
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
          borderRadius: t.radii.md,
          borderColor,
          borderWidth: 1,
          backgroundColor: t.colors.bgSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        },
        checked
          ? [box({ width: 8, height: 8, borderRadius: t.radii.sm, backgroundColor: disabled ? t.colors.textDisabled : t.colors.focus }, [])]
          : [],
      ),
      box({ flexGrow: 1, minWidth: 0 }, [
        bodyText({
          text: label,
          font: font('', 'base'),
          lineHeight: lineHeight('base'),
          color: disabled ? t.colors.textDisabled : t.colors.text,
        }),
      ]),
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
  const t = theme()
  const activeIndex = Math.max(0, Math.min(options.activeIndex ?? 0, Math.max(0, items.length - 1)))
  const active = items[activeIndex]
  return box(
    {
      flexDirection: 'column',
      gap: t.spacing.md,
      semantic: { role: 'tablist' },
    },
    [
      box(
        {
          flexDirection: 'row',
          gap: t.spacing.sm,
          flexWrap: 'wrap',
        },
        items.map((item, idx) =>
          box(
            {
              paddingLeft: t.spacing.md,
              paddingRight: t.spacing.md,
              paddingTop: t.spacing.sm,
              paddingBottom: t.spacing.sm,
              borderRadius: t.radii.md,
              borderColor: idx === activeIndex ? t.colors.focus : t.colors.border,
              borderWidth: 1,
              backgroundColor: idx === activeIndex ? t.colors.accentSoft : t.colors.bgSubtle,
              cursor: 'pointer',
              semantic: { role: 'tab', ariaLabel: item.label, ariaSelected: idx === activeIndex },
              onClick: () => options.onTabChange?.(idx),
            },
            [bodyText({ text: item.label, font: font('', 'base'), lineHeight: lineHeight('base'), color: idx === activeIndex ? t.colors.accentSoftText : t.colors.textSubtle })],
          ),
        ),
      ),
      box(
        {
          borderColor: t.colors.border,
          borderWidth: 1,
          borderRadius: t.radii.lg,
          padding: 12,
          semantic: { role: 'tabpanel' },
        },
        active ? [active.content] : [],
      ),
    ],
  )
}

export interface ToastOptions {
  /** Visual tone. Default `info`. */
  variant?: 'info' | 'success' | 'warning' | 'error'
  /** Optional title above the message. */
  title?: string
  onDismiss?: () => void
}

/**
 * Inline toast / status region (app controls visibility by swapping the tree).
 * Uses `role="status"` for assistive tech.
 */
export function toast(message: string, options: ToastOptions = {}): UIElement {
  const t = theme()
  const variant = options.variant ?? 'info'
  const s = t.colors.variants[variant]
  const children: UIElement[] = []
  if (options.title) {
    children.push(
      bodyText({
        text: options.title,
        font: font('bold', 'base'),
        lineHeight: lineHeight('base'),
        color: s.text,
      }),
    )
  }
  children.push(
    bodyText({
      text: message,
      font: font('', 'base'),
      lineHeight: lineHeight('base'),
      color: s.text,
    }),
  )
  const row: UIElement[] = [
    box({ flexDirection: 'column', gap: t.spacing.xs, flexGrow: 1 }, children),
  ]
  if (options.onDismiss) {
    row.push(
      box(
        {
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          borderRadius: t.spacing.sm,
          cursor: 'pointer',
          semantic: { role: 'button', ariaLabel: 'Dismiss' },
          onClick: options.onDismiss,
        },
        [text({ text: '✕', font: font('', 'small'), lineHeight: 14, color: s.text })],
      ),
    )
  }
  return box(
    {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 12,
      borderRadius: t.radii.lg,
      borderWidth: 1,
      borderColor: s.border,
      backgroundColor: s.bg,
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
  const t = theme()
  return box(
    {
      flexDirection: 'column',
      gap: 2,
      padding: t.spacing.sm,
      borderRadius: t.radii.lg,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.bgAlt,
      semantic: { role: 'listbox', ariaLabel: 'Commands' },
    },
    commands.map((cmd) =>
      box(
        {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          minWidth: 0,
          paddingLeft: t.spacing.md,
          paddingRight: t.spacing.md,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: t.radii.md,
          cursor: 'pointer',
          semantic: { role: 'option', ariaLabel: cmd.label },
          onClick: () => options.onSelect?.(cmd.id),
        },
        [
          box({ flexGrow: 1, minWidth: 0 }, [
            bodyText({ text: cmd.label, font: font('', 'base'), lineHeight: lineHeight('base'), color: t.colors.text }),
          ]),
          cmd.shortcut
            ? text({ text: cmd.shortcut, font: font('', 'small'), lineHeight: lineHeight('small'), color: t.colors.textDisabled })
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
  const t = theme()
  return box(
    {
      flexDirection: 'column',
      gap: 2,
      padding: t.spacing.sm,
      borderRadius: t.radii.lg,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.bgAlt,
      semantic: { role: 'menu', ariaLabel: options.ariaLabel ?? 'Menu' },
    },
    items.map((item) => {
      const color = item.disabled ? t.colors.borderMuted : item.danger ? t.colors.danger : t.colors.text
      return box(
        {
          paddingLeft: t.spacing.md,
          paddingRight: t.spacing.md,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: t.radii.md,
          cursor: item.disabled ? 'not-allowed' : 'pointer',
          semantic: {
            role: 'menuitem',
            ariaLabel: item.label,
            ariaDisabled: item.disabled === true,
          },
          onClick: item.disabled ? undefined : () => options.onSelect?.(item.id),
        },
        [bodyText({ text: item.label, font: font('', 'base'), lineHeight: lineHeight('base'), color })],
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
  const t = theme()
  const selected = opts.options.find(o => o.value === opts.value)
  const label = selected?.label ?? opts.placeholder ?? 'Select…'
  const trigger = box(
    {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
      paddingLeft: t.spacing.md,
      paddingRight: t.spacing.md,
      paddingTop: 8,
      paddingBottom: 8,
      borderRadius: t.radii.md,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.bg,
      cursor: 'pointer',
      semantic: { role: 'button', ariaLabel: 'Select', ariaExpanded: opts.open },
      onClick: () => opts.onToggle?.(),
    },
    [
      box({ flexGrow: 1, minWidth: 0 }, [
        bodyText({ text: label, font: font('', 'base'), lineHeight: lineHeight('base'), color: t.colors.text }),
      ]),
      text({
        text: opts.open ? '▲' : '▼',
        font: `10px ${t.typography.fontFamily}`,
        lineHeight: lineHeight('base'),
        color: t.colors.textMuted,
      }),
    ],
  )
  if (!opts.open) {
    return box({ flexDirection: 'column', gap: t.spacing.xs }, [trigger])
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
  return box({ flexDirection: 'column', gap: t.spacing.xs }, [trigger, panel])
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
  const t = theme()
  const headerRow = box(
    {
      flexDirection: 'row',
      gap: 8,
      paddingBottom: 8,
      semantic: { role: 'row' },
    },
    columns.map(col =>
      box(
        { flexGrow: 1, minWidth: 0, semantic: { role: 'columnheader', ariaLabel: col.header } },
        [bodyText({ text: col.header, font: font('bold', 'small'), lineHeight: lineHeight('small'), color: t.colors.textMuted })],
      ),
    ),
  )
  const divider = box({ height: 1, backgroundColor: t.colors.border }, [])
  const bodyRows = rows.map((row, ri) =>
    box(
      {
        flexDirection: 'row',
        gap: 8,
        paddingTop: t.spacing.sm,
        paddingBottom: t.spacing.sm,
        cursor: options.onRowClick ? 'pointer' : 'default',
        semantic: { role: 'row' },
        onClick: options.onRowClick ? () => options.onRowClick?.(ri) : undefined,
      },
      columns.map(col =>
        box({ flexGrow: 1, minWidth: 0, semantic: { role: 'cell' } }, [
          bodyText({ text: row[col.key] ?? '', font: font('', 'base'), lineHeight: lineHeight('base'), color: t.colors.text }),
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
  const t = theme()
  const hasChildren = !!(node.children && node.children.length > 0)
  const expanded = options.expandedIds.has(node.id)
  const selected = options.selectedId === node.id
  const row = box(
    {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      minWidth: 0,
      paddingLeft: 8 + depth * t.spacing.lg,
      paddingTop: t.spacing.xs,
      paddingBottom: t.spacing.xs,
      borderRadius: t.spacing.sm,
      backgroundColor: selected ? t.colors.selected : undefined,
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
            font: `10px ${t.typography.fontFamily}`,
            lineHeight: 14,
            color: t.colors.textMuted,
          })
        : box({ width: 14 }, []),
      box({ flexGrow: 1, minWidth: 0 }, [
        bodyText({ text: node.label, font: font('', 'base'), lineHeight: lineHeight('base'), color: t.colors.text }),
      ]),
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
  const t = theme()
  const border = options.borderColor ?? t.colors.border
  const bg = options.backgroundColor ?? t.colors.bg
  const sections: UIElement[] = []
  if (options.header) {
    sections.push(
      box({ paddingLeft: t.spacing.xl, paddingRight: t.spacing.xl, paddingTop: t.spacing.lg, paddingBottom: t.spacing.lg, borderBottom: 1, borderColor: border, minWidth: 0 }, [options.header]),
    )
  }
  if (options.children && options.children.length > 0) {
    sections.push(box({ flexDirection: 'column', padding: t.spacing.xl, gap: options.gap ?? t.spacing.lg, minWidth: 0 }, options.children))
  }
  if (options.footer) {
    sections.push(
      box({ paddingLeft: t.spacing.xl, paddingRight: t.spacing.xl, paddingTop: t.spacing.lg, paddingBottom: t.spacing.lg, borderTop: 1, borderColor: border, minWidth: 0 }, [options.footer]),
    )
  }
  return box(
    {
      flexDirection: 'column',
      minWidth: 0,
      borderRadius: t.radii.lg, borderWidth: 1,
      borderColor: border,
      backgroundColor: bg,
      overflow: 'hidden',
    },
    sections,
  )
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export interface BadgeOptions {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
}

export function badge(label: string, options: BadgeOptions = {}): UIElement {
  const t = theme()
  const s = t.colors.badgeVariants[options.variant ?? 'default']
  return box(
    {
      paddingLeft: 8, paddingRight: 8, paddingTop: 2, paddingBottom: 2,
      borderRadius: t.radii.full, backgroundColor: s.bg,
    },
    [bodyText({ text: label, font: `bold 11px ${t.typography.fontFamily}`, lineHeight: 14, color: s.text })],
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
  const t = theme()
  const vertical = options.direction === 'vertical'
  const color = options.color ?? t.colors.border
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
  const t = theme()
  const size = options.size ?? 32
  const bg = options.backgroundColor ?? t.colors.accent
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
    [text({ text: initials, font: `bold ${fontSize}px ${t.typography.fontFamily}`, lineHeight: Math.round(fontSize * 1.2), color: t.colors.accentText })],
  )
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

export interface AlertOptions {
  variant?: 'info' | 'success' | 'warning' | 'error'
  title?: string
  onDismiss?: () => void
}

const alertIcons: Record<string, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✕',
}

export function alert(message: string, options: AlertOptions = {}): UIElement {
  const t = theme()
  const variant = options.variant ?? 'info'
  const s = t.colors.variants[variant]
  const icon = alertIcons[variant] ?? 'ℹ'
  const content: UIElement[] = []
  if (options.title) {
    content.push(bodyText({ text: options.title, font: font('bold', 'base'), lineHeight: lineHeight('base'), color: s.text }))
  }
  content.push(bodyText({ text: message, font: font('', 'base'), lineHeight: lineHeight('base'), color: s.text }))

  const body: UIElement[] = [
    text({ text: icon, font: font('', 'base'), lineHeight: lineHeight('base'), color: s.text }),
    box({ flexDirection: 'column', gap: t.spacing.xs, flexGrow: 1, flexShrink: 1, minWidth: 0 }, content),
  ]
  if (options.onDismiss) {
    body.push(
      box(
        {
          paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4,
          borderRadius: t.spacing.sm, cursor: 'pointer',
          semantic: { role: 'button', ariaLabel: 'Dismiss' },
          onClick: options.onDismiss,
        },
        [text({ text: '✕', font: font('', 'small'), lineHeight: 14, color: s.text })],
      ),
    )
  }
  return box(
    {
      flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md,
      padding: 12, borderRadius: t.radii.lg, borderWidth: 1, minWidth: 0,
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
  const t = theme()
  const clamped = Math.max(0, Math.min(100, value))
  const children: UIElement[] = []
  if (options.label) {
    children.push(
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, minWidth: 0 }, [
        box({ flexGrow: 1, minWidth: 0 }, [
          bodyText({ text: options.label, font: font('', 'small'), lineHeight: lineHeight('small'), color: t.colors.textMuted }),
        ]),
        text({ text: `${Math.round(clamped)}%`, font: font('', 'small'), lineHeight: lineHeight('small'), color: t.colors.textMuted }),
      ]),
    )
  }
  children.push(
    box(
      { flexDirection: 'row', height: 6, borderRadius: 3, backgroundColor: t.colors.border, overflow: 'hidden' },
      [
        box({ flexGrow: Math.max(clamped, 0.001), minWidth: 0, height: 6, borderRadius: 3, backgroundColor: t.colors.accent }),
        box({ flexGrow: Math.max(100 - clamped, 0.001), minWidth: 0, height: 6 }),
      ],
    ),
  )
  return box(
    {
      flexDirection: 'column', gap: t.spacing.sm,
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
  const t = theme()
  return box(
    {
      width: options.width ?? 100,
      height: options.height ?? 16,
      borderRadius: options.borderRadius ?? t.radii.sm,
      backgroundColor: t.colors.skeleton,
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
  const t = theme()
  const sep = options.separator ?? '/'
  const children: UIElement[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const isLast = i === items.length - 1
    if (item.onClick && !isLast) {
      children.push(
        box(
          { cursor: 'pointer', onClick: item.onClick },
          [bodyText({ text: item.label, font: font('', 'base'), lineHeight: lineHeight('base'), color: t.colors.link })],
        ),
      )
    } else {
      children.push(
        bodyText({ text: item.label, font: font('', 'base'), lineHeight: lineHeight('base'), color: isLast ? t.colors.text : t.colors.textMuted }),
      )
    }
    if (!isLast) {
      children.push(text({ text: ` ${sep} `, font: font('', 'base'), lineHeight: lineHeight('base'), color: t.colors.borderMuted }))
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
  const t = theme()
  const { page, totalPages, onPageChange } = options
  const current = Math.max(1, Math.min(page, totalPages))

  const pageBtn = (label: string, target: number, active: boolean, disabled: boolean): UIElement =>
    box(
      {
        paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4,
        borderRadius: t.spacing.sm,
        borderWidth: active ? 1 : 0,
        borderColor: active ? t.colors.focus : undefined,
        backgroundColor: active ? t.colors.accentSoft : undefined,
        cursor: disabled ? 'not-allowed' : 'pointer',
        onClick: disabled ? undefined : () => onPageChange(target),
        semantic: { role: 'button', ariaLabel: label, ariaDisabled: disabled },
      },
      [text({ text: label, font: font('', 'base'), lineHeight: lineHeight('base'), color: disabled ? t.colors.borderMuted : active ? t.colors.accentSoftText : t.colors.text })],
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
      flexDirection: 'row', gap: t.spacing.xs, alignItems: 'center',
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
  const t = theme()
  const { checked, disabled } = options
  const isDisabled = disabled === true

  const toggle = () => {
    if (isDisabled) return
    options.onChange(!checked)
  }

  const trackBg = isDisabled ? t.colors.switchTrackDisabled : checked ? t.colors.switchTrackOn : t.colors.border
  const thumbBg = isDisabled ? t.colors.switchThumbDisabled : checked ? t.colors.switchThumbOn : t.colors.switchThumbOff

  const track = box(
    {
      width: 36, height: 20, borderRadius: t.radii.lg,
      backgroundColor: trackBg,
      flexDirection: 'row', alignItems: 'center',
      paddingLeft: checked ? 18 : 2,
      paddingRight: checked ? 2 : 18,
    },
    [box({ width: 16, height: 16, borderRadius: t.radii.md, backgroundColor: thumbBg }, [])],
  )

  const children: UIElement[] = [track]
  if (options.label) {
    children.push(
      box({ flexGrow: 1, minWidth: 0 }, [
        bodyText({ text: options.label, font: font('', 'base'), lineHeight: lineHeight('base'), color: isDisabled ? t.colors.textDisabled : t.colors.text }),
      ]),
    )
  }

  return box(
    {
      flexDirection: 'row', gap: t.spacing.md, alignItems: 'center', minWidth: 0,
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
  const t = theme()
  const disabled = options.disabled === true
  const focused = !disabled && options.focused === true
  const rows = options.rows ?? 4
  const minH = rows * lineHeight('base') + t.spacing.xl
  const valueColor = disabled ? t.colors.textDisabled : t.colors.text
  const placeholderColor = disabled ? t.colors.borderMuted : t.colors.textDisabled
  const showPlaceholder = value.length === 0

  return box(
    {
      flexDirection: 'column',
      paddingLeft: t.spacing.md, paddingRight: t.spacing.md, paddingTop: 8, paddingBottom: 8,
      borderColor: disabled ? t.colors.borderMuted : focused ? t.colors.focus : t.colors.border,
      borderWidth: 1, borderRadius: t.radii.md,
      backgroundColor: disabled ? t.colors.bg : focused ? t.colors.bgSubtle : undefined,
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
        font: font('', 'base'), lineHeight: lineHeight('base'),
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
  const t = theme()
  const { value, onChange, disabled } = options
  const isDisabled = disabled === true
  const min = options.min ?? 0
  const max = options.max ?? 100
  const range = max - min || 1
  const pct = Math.max(0, Math.min(100, ((value - min) / range) * 100))

  const track = box(
    {
      height: 6, borderRadius: 3, backgroundColor: t.colors.border,
      flexDirection: 'row', overflow: 'hidden',
    },
    [box({ width: pct, height: 6, backgroundColor: isDisabled ? t.colors.borderMuted : t.colors.accent }, [])],
  )

  const topRow: UIElement[] = []
  if (options.label) {
    topRow.push(
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, minWidth: 0 }, [
        box({ flexGrow: 1, minWidth: 0 }, [
          bodyText({ text: options.label, font: font('', 'small'), lineHeight: lineHeight('small'), color: t.colors.textMuted }),
        ]),
        text({ text: String(Math.round(value)), font: font('', 'small'), lineHeight: lineHeight('small'), color: t.colors.textMuted }),
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
      flexDirection: 'column', gap: t.spacing.sm,
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
  const t = theme()
  const expandedIds = options.expandedIds ?? new Set<string>()
  return box(
    {
      flexDirection: 'column',
      borderWidth: 1, borderColor: t.colors.border, borderRadius: t.radii.lg, overflow: 'hidden',
    },
    items.map((item, i) => {
      const expanded = expandedIds.has(item.id)
      const header = box(
        {
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, minWidth: 0,
          paddingLeft: t.spacing.lg, paddingRight: t.spacing.lg, paddingTop: t.spacing.md, paddingBottom: t.spacing.md,
          backgroundColor: t.colors.bg, cursor: 'pointer',
          borderTop: i > 0 ? 1 : 0, borderColor: t.colors.border,
          semantic: { role: 'button', ariaLabel: item.title, ariaExpanded: expanded },
          onClick: () => options.onToggle?.(item.id),
        },
        [
          box({ flexGrow: 1, minWidth: 0 }, [
            bodyText({ text: item.title, font: font('bold', 'base'), lineHeight: lineHeight('base'), color: t.colors.text }),
          ]),
          text({ text: expanded ? '▲' : '▼', font: `10px ${t.typography.fontFamily}`, lineHeight: 14, color: t.colors.textMuted }),
        ],
      )
      if (!expanded) return header
      return box({ flexDirection: 'column' }, [
        header,
        box(
          { padding: t.spacing.lg, backgroundColor: t.colors.bgAlt, borderTop: 1, borderColor: t.colors.border },
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

  const t = theme()
  const side = options.side ?? 'right'
  const isVertical = side === 'left' || side === 'right'
  const panelWidth = isVertical ? (options.width ?? 320) : undefined
  const panelHeight = !isVertical ? (options.height ?? 240) : undefined

  const header: UIElement[] = []
  if (options.title || options.onClose) {
    const headerChildren: UIElement[] = []
    if (options.title) {
      headerChildren.push(
        box({ flexGrow: 1, minWidth: 0 }, [
          bodyText({ text: options.title, font: font('bold', 'heading'), lineHeight: lineHeight('heading'), color: t.colors.textHeading }),
        ]),
      )
    }
    if (options.onClose) {
      headerChildren.push(
        box(
          {
            paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4,
            borderRadius: t.spacing.sm, cursor: 'pointer',
            semantic: { role: 'button', ariaLabel: 'Close' },
            onClick: options.onClose,
          },
          [text({ text: '✕', font: font('', 'small'), lineHeight: 14, color: t.colors.textMuted })],
        ),
      )
    }
    header.push(
      box(
        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, minWidth: 0, paddingBottom: 12 },
        headerChildren,
      ),
    )
  }

  const panel = box(
    {
      flexDirection: 'column',
      width: panelWidth, height: panelHeight,
      padding: t.spacing.xl, backgroundColor: t.colors.bg,
      borderColor: t.colors.border,
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
