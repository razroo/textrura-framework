import { describe, it, expect } from 'vitest'
import type { HitEvent, KeyboardHitEvent } from '../../../core/src/types.js'
import { box, text } from '../../../core/src/index.js'
import {
  accordion,
  alert,
  avatar,
  badge,
  breadcrumb,
  card,
  checkbox,
  comboboxField,
  commandPalette,
  darkTheme,
  dataTable,
  menu,
  pagination,
  progress,
  radio,
  selectControl,
  separator,
  sheet,
  skeleton,
  slider,
  switchControl,
  tabs,
  textarea,
  toast,
  treeView,
} from '../index.js'

describe('@geometra/ui primitives', () => {
  it('checkbox toggles on click and keyboard', () => {
    let seen: boolean | null = null
    const el = checkbox('Email me', {
      checked: false,
      onChange: (next) => {
        seen = next
      },
    })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return

    el.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(seen).toBe(true)

    seen = null
    el.handlers?.onKeyDown?.({
      key: ' ',
      code: 'Space',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: {} as KeyboardHitEvent['target'],
    })
    expect(seen).toBe(true)
  })

  it('radio calls onSelect only when unchecked', () => {
    let selected = 0
    const unchecked = radio('Option A', { checked: false, onSelect: () => selected++ })
    const checked = radio('Option B', { checked: true, onSelect: () => selected++ })

    expect(unchecked.kind).toBe('box')
    expect(checked.kind).toBe('box')
    if (unchecked.kind !== 'box' || checked.kind !== 'box') return

    unchecked.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    checked.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(selected).toBe(1)
  })

  it('tabs renders active content and emits index on click', () => {
    let nextIdx = -1
    const tabEl = tabs(
      [
        { label: 'One', content: text({ text: 'First', font: '13px Inter', lineHeight: 18, color: '#fff' }) },
        { label: 'Two', content: box({ width: 20, height: 10 }, []) },
      ],
      { activeIndex: 0, onTabChange: (idx) => { nextIdx = idx } },
    )
    expect(tabEl.kind).toBe('box')
    if (tabEl.kind !== 'box') return

    const headerRow = tabEl.children[0]
    expect(headerRow?.kind).toBe('box')
    if (!headerRow || headerRow.kind !== 'box') return
    const secondTab = headerRow.children[1]
    expect(secondTab?.kind).toBe('box')
    if (!secondTab || secondTab.kind !== 'box') return
    secondTab.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(nextIdx).toBe(1)

    const panel = tabEl.children[1]
    expect(panel?.kind).toBe('box')
    if (!panel || panel.kind !== 'box') return
    expect(panel.children).toHaveLength(1)
    expect(panel.children[0]?.kind).toBe('text')
  })

  it('toast exposes status semantics and optional dismiss', () => {
    let dismissed = false
    const el = toast('Saved.', { title: 'Done', variant: 'success', onDismiss: () => { dismissed = true } })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.semantic?.role).toBe('status')
    expect(el.children.length).toBe(2)
    const dismiss = el.children[1]
    expect(dismiss?.kind).toBe('box')
    if (!dismiss || dismiss.kind !== 'box') return
    dismiss.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(dismissed).toBe(true)
  })

  it('commandPalette invokes onSelect with command id', () => {
    let id = ''
    const el = commandPalette(
      [
        { id: 'a', label: 'Alpha', shortcut: '⌘A' },
        { id: 'b', label: 'Beta' },
      ],
      { onSelect: (x) => { id = x } },
    )
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    const first = el.children[0]
    expect(first?.kind).toBe('box')
    if (!first || first.kind !== 'box') return
    first.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(id).toBe('a')
  })

  it('menu does not fire onSelect for disabled rows', () => {
    let picked = ''
    const el = menu(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B', disabled: true },
      ],
      { onSelect: (id) => { picked = id } },
    )
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    const disabledRow = el.children[1]
    expect(disabledRow?.kind).toBe('box')
    if (!disabledRow || disabledRow.kind !== 'box') return
    expect(disabledRow.handlers?.onClick).toBeUndefined()
    disabledRow.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(picked).toBe('')
  })

  it('selectControl routes menu picks to onChange when open', () => {
    let v = ''
    const el = selectControl({
      options: [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
      ],
      value: 'x',
      open: true,
      onChange: (nv) => { v = nv },
    })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    const menuBox = el.children[1]
    expect(menuBox?.kind).toBe('box')
    if (!menuBox || menuBox.kind !== 'box') return
    const secondItem = menuBox.children[1]
    expect(secondItem?.kind).toBe('box')
    if (!secondItem || secondItem.kind !== 'box') return
    secondItem.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(v).toBe('y')
  })

  it('dataTable invokes onRowClick with row index', () => {
    let row = -1
    const el = dataTable(
      [{ key: 'a', header: 'A' }],
      [{ a: '1' }, { a: '2' }],
      { onRowClick: (i) => { row = i } },
    )
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    const firstBody = el.children[2]
    expect(firstBody?.kind).toBe('box')
    if (!firstBody || firstBody.kind !== 'box') return
    firstBody.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(row).toBe(0)
  })

  it('treeView calls onToggle for expandable rows', () => {
    let toggled = ''
    const el = treeView(
      [
        {
          id: 'r',
          label: 'Root',
          children: [{ id: 'c', label: 'Child' }],
        },
      ],
      {
        expandedIds: new Set<string>(),
        onToggle: (id) => { toggled = id },
      },
    )
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    const rootRow = el.children[0]
    expect(rootRow?.kind).toBe('box')
    if (!rootRow || rootRow.kind !== 'box') return
    rootRow.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(toggled).toBe('r')
  })

  it('comboboxField forwards palette selection to onPickSuggestion', () => {
    let picked = ''
    const el = comboboxField(
      '',
      'Search…',
      [{ id: 'foo', label: 'Foo' }],
      { input: {}, onPickSuggestion: (s) => { picked = s } },
    )
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    const palette = el.children[1]
    expect(palette?.kind).toBe('box')
    if (!palette || palette.kind !== 'box') return
    const opt = palette.children[0]
    expect(opt?.kind).toBe('box')
    if (!opt || opt.kind !== 'box') return
    opt.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(picked).toBe('foo')
  })

  it('card renders header, body, and footer sections', () => {
    const el = card({
      header: text({ text: 'Title', font: '13px Inter', lineHeight: 18, color: '#fff' }),
      children: [text({ text: 'Body', font: '13px Inter', lineHeight: 18, color: '#fff' })],
      footer: text({ text: 'Footer', font: '13px Inter', lineHeight: 18, color: '#fff' }),
    })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.children).toHaveLength(3)
  })

  it('card without header/footer renders only body', () => {
    const el = card({
      children: [text({ text: 'Body', font: '13px Inter', lineHeight: 18, color: '#fff' })],
    })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.children).toHaveLength(1)
  })

  it('badge renders with variant styling', () => {
    const el = badge('New', { variant: 'success' })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.props.backgroundColor).toBe(darkTheme.colors.badgeVariants.success.bg)
    expect(el.children).toHaveLength(1)
    expect(el.children[0]?.kind).toBe('text')
  })

  it('separator renders horizontal by default', () => {
    const el = separator()
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.props.height).toBe(1)
    expect(el.semantic?.role).toBe('separator')
  })

  it('separator renders vertical when specified', () => {
    const el = separator({ direction: 'vertical' })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.props.width).toBe(1)
  })

  it('avatar shows initials from name', () => {
    const el = avatar('John Doe', { size: 40 })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.props.width).toBe(40)
    expect(el.props.borderRadius).toBe(20)
    if (el.children[0]?.kind === 'text') {
      expect(el.children[0].props.text).toBe('JD')
    }
  })

  it('alert renders with dismiss button when onDismiss provided', () => {
    let dismissed = false
    const el = alert('Error occurred', { variant: 'error', title: 'Oops', onDismiss: () => { dismissed = true } })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.semantic?.role).toBe('alert')
    expect(el.children).toHaveLength(3)
    const dismiss = el.children[2]
    if (dismiss?.kind === 'box') {
      dismiss.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
      expect(dismissed).toBe(true)
    }
  })

  it('alert without dismiss has no dismiss button', () => {
    const el = alert('Info message')
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.children).toHaveLength(2)
  })

  it('progress renders with semantic role', () => {
    const el = progress(75, { label: 'Loading' })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.semantic?.role).toBe('progressbar')
  })

  it('skeleton renders with default dimensions', () => {
    const el = skeleton()
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.props.width).toBe(100)
    expect(el.props.height).toBe(16)
  })

  it('skeleton accepts custom dimensions', () => {
    const el = skeleton({ width: 200, height: 24, borderRadius: 8 })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.props.width).toBe(200)
    expect(el.props.height).toBe(24)
    expect(el.props.borderRadius).toBe(8)
  })

  it('breadcrumb renders items with separators', () => {
    let clicked = false
    const el = breadcrumb([
      { label: 'Home', onClick: () => { clicked = true } },
      { label: 'Products' },
      { label: 'Widget' },
    ])
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.semantic?.tag).toBe('nav')
    expect(el.children).toHaveLength(5)
    const first = el.children[0]
    if (first?.kind === 'box') {
      first.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
      expect(clicked).toBe(true)
    }
  })

  it('pagination emits page change on click', () => {
    let page = -1
    const el = pagination({ page: 3, totalPages: 10, onPageChange: (p) => { page = p } })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    const prev = el.children[0]
    if (prev?.kind === 'box') {
      prev.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
      expect(page).toBe(2)
    }
  })

  it('pagination disables prev on first page', () => {
    const el = pagination({ page: 1, totalPages: 5, onPageChange: () => {} })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    const prev = el.children[0]
    if (prev?.kind === 'box') {
      expect(prev.handlers?.onClick).toBeUndefined()
    }
  })

  it('pagination clamps page above totalPages so next is disabled and prev still works', () => {
    let page = -1
    const el = pagination({ page: 99, totalPages: 3, onPageChange: (p) => { page = p } })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    const next = el.children[el.children.length - 1]
    if (next?.kind === 'box') {
      expect(next.handlers?.onClick).toBeUndefined()
    }
    const prev = el.children[0]
    if (prev?.kind === 'box') {
      prev.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
      expect(page).toBe(2)
    }
  })

  it('pagination with zero totalPages clamps current to 1 and disables prev and next', () => {
    const el = pagination({ page: 1, totalPages: 0, onPageChange: () => {} })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.children.length).toBe(2)
    const prev = el.children[0]
    const next = el.children[1]
    if (prev?.kind === 'box') expect(prev.handlers?.onClick).toBeUndefined()
    if (next?.kind === 'box') expect(next.handlers?.onClick).toBeUndefined()
  })

  it('switchControl toggles on click and keyboard', () => {
    let val: boolean | null = null
    const el = switchControl({ checked: false, onChange: (v) => { val = v }, label: 'Dark mode' })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.semantic?.role).toBe('switch')
    el.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(val).toBe(true)
    val = null
    el.handlers?.onKeyDown?.({
      key: 'Enter', code: 'Enter',
      shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
      target: {} as KeyboardHitEvent['target'],
    })
    expect(val).toBe(true)
  })

  it('switchControl disabled does not toggle', () => {
    let val: boolean | null = null
    const el = switchControl({ checked: false, onChange: (v) => { val = v }, disabled: true })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    el.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
    expect(val).toBeNull()
  })

  it('textarea renders placeholder when empty', () => {
    const el = textarea('', 'Type here...')
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.semantic?.tag).toBe('textarea')
    if (el.children[0]?.kind === 'text') {
      expect(el.children[0].props.text).toBe('Type here...')
    }
  })

  it('textarea renders value with pre-wrap', () => {
    const el = textarea('Hello\nWorld', '')
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    if (el.children[0]?.kind === 'text') {
      expect(el.children[0].props.text).toBe('Hello\nWorld')
      expect(el.children[0].props.whiteSpace).toBe('pre-wrap')
    }
  })

  it('slider fires onChange on click', () => {
    let val = -1
    const el = slider({ value: 50, min: 0, max: 100, onChange: (v) => { val = v }, label: 'Volume' })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.semantic?.role).toBe('slider')
    el.handlers?.onClick?.({ x: 100, y: 0, localX: 100, target: {} as HitEvent['target'] })
    expect(val).toBeGreaterThanOrEqual(0)
  })

  it('accordion toggles sections on click', () => {
    let toggled = ''
    const contentEl = text({ text: 'Content', font: '13px Inter', lineHeight: 18, color: '#fff' })
    const el = accordion(
      [
        { id: 'a', title: 'Section A', content: contentEl },
        { id: 'b', title: 'Section B', content: contentEl },
      ],
      { expandedIds: new Set(['a']), onToggle: (id) => { toggled = id } },
    )
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    const firstSection = el.children[0]
    if (firstSection?.kind === 'box') {
      const header = firstSection.children[0]
      if (header?.kind === 'box') {
        header.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
        expect(toggled).toBe('a')
      }
    }
  })

  it('sheet returns hidden box when closed', () => {
    const el = sheet({ open: false })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.props.display).toBe('none')
  })

  it('sheet renders overlay with close on backdrop click', () => {
    let closed = false
    const el = sheet({ open: true, title: 'Settings', onClose: () => { closed = true } })
    expect(el.kind).toBe('box')
    if (el.kind !== 'box') return
    expect(el.props.position).toBe('absolute')
    expect(el.children).toHaveLength(2)
    const backdrop = el.children[0]
    if (backdrop?.kind === 'box') {
      backdrop.handlers?.onClick?.({ x: 0, y: 0, target: {} as HitEvent['target'] })
      expect(closed).toBe(true)
    }
  })
})
