import {
  signal,
  box,
  text,
  createApp,
  insertInputText,
  backspaceInput,
  deleteInput,
  moveInputCaret,
  createTextInputHistory,
  pushTextInputHistory,
  undoTextInputHistory,
  redoTextInputHistory,
} from '@geometra/core'
import type { App, TextInputHistoryState, TextInputState, KeyboardHitEvent } from '@geometra/core'
import { CanvasRenderer } from '@geometra/renderer-canvas'

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new CanvasRenderer({ canvas, background: '#09090b' })

const history = signal<TextInputHistoryState>(createTextInputHistory({
  nodes: ['Type here. Shift+Arrow selects. Cmd/Ctrl+Z undo.'],
  selection: { anchorNode: 0, anchorOffset: 10, focusNode: 0, focusOffset: 10 },
}))
const focused = signal(false)
const compositionDraft = signal('')
const compositionSelection = signal<TextInputState['selection'] | null>(null)

function state(): TextInputState {
  return history.peek().present
}

function setPresent(next: TextInputState): void {
  const current = history.peek()
  history.set({ ...current, present: next })
}

function push(next: TextInputState): void {
  history.set(pushTextInputHistory(history.peek(), next))
}

function normalizeSelection(sel: TextInputState['selection']): {
  startNode: number
  startOffset: number
  endNode: number
  endOffset: number
} {
  const anchorBeforeFocus =
    sel.anchorNode < sel.focusNode ||
    (sel.anchorNode === sel.focusNode && sel.anchorOffset <= sel.focusOffset)
  return anchorBeforeFocus
    ? { startNode: sel.anchorNode, startOffset: sel.anchorOffset, endNode: sel.focusNode, endOffset: sel.focusOffset }
    : { startNode: sel.focusNode, startOffset: sel.focusOffset, endNode: sel.anchorNode, endOffset: sel.anchorOffset }
}

function withSelection(nextState: TextInputState, selection: TextInputState['selection']): TextInputState {
  return { nodes: nextState.nodes, selection: { ...selection } }
}

function onKeyDown(e: KeyboardHitEvent): void {
  const current = state()
  if (e.key === 'Process') return

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    history.set(e.shiftKey ? redoTextInputHistory(history.peek()) : undoTextInputHistory(history.peek()))
    return
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'y') {
    history.set(redoTextInputHistory(history.peek()))
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
    const last = current.nodes.length - 1
    setPresent({
      nodes: current.nodes,
      selection: {
        anchorNode: 0,
        anchorOffset: 0,
        focusNode: last,
        focusOffset: current.nodes[last]?.length ?? 0,
      },
    })
    return
  }

  if (e.key === 'Backspace') {
    push(backspaceInput(current))
    return
  }
  if (e.key === 'Delete') {
    push(deleteInput(current))
    return
  }
  if (e.key === 'ArrowLeft') {
    setPresent(moveInputCaret(current, 'left', e.shiftKey))
    return
  }
  if (e.key === 'ArrowRight') {
    setPresent(moveInputCaret(current, 'right', e.shiftKey))
    return
  }
  if (e.key === 'Enter') {
    push(insertInputText(current, '\n'))
    return
  }
  if (e.key === 'Escape') {
    focused.set(false)
    return
  }

  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    push(insertInputText(current, e.key))
  }
}

function onCompositionStart(): void {
  compositionSelection.set({ ...state().selection })
  compositionDraft.set('')
}

function onCompositionUpdate(e: { data: string }): void {
  compositionDraft.set(e.data)
}

function onCompositionEnd(e: { data: string }): void {
  compositionDraft.set('')
  const sel = compositionSelection.peek() ?? state().selection
  compositionSelection.set(null)
  if (!e.data) return
  push(insertInputText(withSelection(state(), sel), e.data))
}

function view() {
  const current = history.value.present
  const sel = current.selection
  const norm = normalizeSelection(sel)
  const draft = compositionDraft.value
  const compSel = compositionSelection.value
  const effective = draft && compSel ? normalizeSelection(compSel) : norm
  const collapsed = sel.anchorNode === sel.focusNode && sel.anchorOffset === sel.focusOffset

  const rows = current.nodes.map((rawLine, lineIndex) => {
    const line = rawLine ?? ''
    const start = lineIndex === effective.startNode ? Math.max(0, Math.min(effective.startOffset, line.length)) : 0
    const end = lineIndex === effective.endNode ? Math.max(0, Math.min(effective.endOffset, line.length)) : line.length
    const hasSelection =
      lineIndex > effective.startNode && lineIndex < effective.endNode
      || (lineIndex === effective.startNode && lineIndex === effective.endNode && end > start)
      || (lineIndex === effective.startNode && lineIndex < effective.endNode && start < line.length)
      || (lineIndex > effective.startNode && lineIndex === effective.endNode && end > 0)

    const isCaretLine = focused.value && collapsed && !draft && lineIndex === sel.focusNode
    const caretOffset = isCaretLine ? Math.max(0, Math.min(sel.focusOffset, line.length)) : -1

    const left = isCaretLine ? line.slice(0, caretOffset) : line.slice(0, hasSelection ? start : line.length)
    const middle = hasSelection ? line.slice(start, end) : ''
    const right = isCaretLine ? line.slice(caretOffset) : (hasSelection ? line.slice(end) : '')

    const children = []
    if (left.length > 0) {
      children.push(text({ text: left, font: '15px JetBrains Mono', lineHeight: 22, color: '#d4d4d8' }))
    }
    if (isCaretLine) {
      children.push(box({ width: 2, minHeight: 18, backgroundColor: '#38bdf8' }, []))
    }
    if (draft && compSel && lineIndex === compSel.anchorNode) {
      children.push(text({ text: draft, font: '15px JetBrains Mono', lineHeight: 22, color: '#7dd3fc', backgroundColor: 'rgba(14,165,233,0.18)' }))
    } else if (middle.length > 0) {
      children.push(text({ text: middle, font: '15px JetBrains Mono', lineHeight: 22, color: '#e4e4e7', backgroundColor: 'rgba(56,189,248,0.28)' }))
    }
    if (right.length > 0) {
      children.push(text({ text: right, font: '15px JetBrains Mono', lineHeight: 22, color: '#d4d4d8' }))
    }
    if (children.length === 0) {
      children.push(text({ text: ' ', font: '15px JetBrains Mono', lineHeight: 22, color: '#d4d4d8' }))
    }
    return box({ flexDirection: 'row', minHeight: 22, alignItems: 'center' }, children)
  })

  return box(
    { flexDirection: 'column', padding: 24, gap: 12, width: canvas.width, height: canvas.height },
    [
      text({ text: 'Text Input Playground', font: 'bold 22px Inter', lineHeight: 30, color: '#fafafa' }),
      text({
        text: 'Click editor to focus. Type, Backspace/Delete, Enter, Shift+Arrow selection, Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo, Ctrl+Y redo.',
        font: '13px Inter',
        lineHeight: 19,
        color: '#a1a1aa',
      }),
      box(
        {
          backgroundColor: focused.value ? '#111827' : '#111111',
          borderColor: focused.value ? '#38bdf8' : '#3f3f46',
          borderWidth: 1,
          borderRadius: 10,
          padding: 14,
          minHeight: 220,
          flexDirection: 'column',
          gap: 2,
          onClick: () => focused.set(true),
          onKeyDown,
          onCompositionStart: () => onCompositionStart(),
          onCompositionUpdate: (e) => onCompositionUpdate(e),
          onCompositionEnd: (e) => onCompositionEnd(e),
        },
        rows,
      ),
      text({
        text: `History: undo ${history.value.past.length} | redo ${history.value.future.length} | focus ${focused.value ? 'on' : 'off'}`,
        font: '12px JetBrains Mono',
        lineHeight: 17,
        color: '#71717a',
      }),
    ],
  )
}

let app: App | null = null
createApp(view, renderer, { width: canvas.width, height: canvas.height }).then((mounted) => {
  app = mounted
})

canvas.width = window.innerWidth
canvas.height = window.innerHeight
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  app?.update()
})

window.addEventListener('keydown', (e) => {
  if (!focused.peek() || !app) return
  e.preventDefault()
  app.dispatchKey('onKeyDown', {
    key: e.key,
    code: e.code,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    altKey: e.altKey,
  })
})

canvas.addEventListener('click', (e) => {
  if (!app) return
  const rect = canvas.getBoundingClientRect()
  app.dispatch('onClick', e.clientX - rect.left, e.clientY - rect.top)
})

window.addEventListener('compositionstart', () => {
  if (!focused.peek() || !app) return
  app.dispatchComposition('onCompositionStart', { data: '' })
})

window.addEventListener('compositionupdate', (e) => {
  if (!focused.peek() || !app) return
  app.dispatchComposition('onCompositionUpdate', { data: e.data })
})

window.addEventListener('compositionend', (e) => {
  if (!focused.peek() || !app) return
  app.dispatchComposition('onCompositionEnd', { data: e.data })
})
