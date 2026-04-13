import { box, signal, text, type UIElement } from '@geometra/core/node'
import { createServer, type TexturaServer } from '@geometra/server'
import { button, checkbox, input } from '@geometra/ui'

// ---------------------------------------------------------------------------
// Types & state
// ---------------------------------------------------------------------------

interface Task {
  id: string
  title: string
  done: boolean
  priority: 'low' | 'medium' | 'high'
}

type Filter = 'all' | 'active' | 'done'

let nextId = 5
function genId(): string { return String(nextId++) }

const tasks = signal<Task[]>([
  { id: '1', title: 'Set up Geometra server', done: true, priority: 'high' },
  { id: '2', title: 'Connect MCP agent', done: false, priority: 'high' },
  { id: '3', title: 'Build CRUD demo', done: false, priority: 'medium' },
  { id: '4', title: 'Write documentation', done: false, priority: 'low' },
])

const filter = signal<Filter>('all')
const editingId = signal<string | null>(null) // null = list view, 'new' = adding, id = editing
const inputTitle = signal('')
const inputCaret = signal(0)
const inputPriority = signal<'low' | 'medium' | 'high'>('medium')
const statusMessage = signal('')

// ---------------------------------------------------------------------------
// Keyboard handler for text input (same pattern as agent-demo)
// ---------------------------------------------------------------------------

let server: TexturaServer

function handleKeyDown(e: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): void {
  if (e.key === 'Enter' && !e.shiftKey) { handleSave(); return }
  if (e.key === 'Escape') { handleCancel(); return }

  if (e.key === 'Backspace') {
    const val = inputTitle.peek(); const c = inputCaret.peek()
    if (c > 0) { inputTitle.set(val.slice(0, c - 1) + val.slice(c)); inputCaret.set(c - 1); server.update() }
    return
  }
  if (e.key === 'Delete') {
    const val = inputTitle.peek(); const c = inputCaret.peek()
    if (c < val.length) { inputTitle.set(val.slice(0, c) + val.slice(c + 1)); server.update() }
    return
  }
  if (e.key === 'ArrowLeft') {
    const c = inputCaret.peek(); if (c > 0) { inputCaret.set(c - 1); server.update() }
    return
  }
  if (e.key === 'ArrowRight') {
    const c = inputCaret.peek(); if (c < inputTitle.peek().length) { inputCaret.set(c + 1); server.update() }
    return
  }
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
    const val = inputTitle.peek(); const c = inputCaret.peek()
    inputTitle.set(val.slice(0, c) + e.key + val.slice(c))
    inputCaret.set(c + 1)
    server.update()
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function setStatus(msg: string): void {
  statusMessage.set(msg)
  server.update()
}

function handleAdd(): void {
  editingId.set('new')
  inputTitle.set('')
  inputCaret.set(0)
  inputPriority.set('medium')
  server.update()
}

function handleEdit(task: Task): void {
  editingId.set(task.id)
  inputTitle.set(task.title)
  inputCaret.set(task.title.length)
  inputPriority.set(task.priority)
  server.update()
}

function handleSave(): void {
  const title = inputTitle.peek().trim()
  if (title.length === 0) return

  const eid = editingId.peek()
  if (eid === 'new') {
    const newTask: Task = { id: genId(), title, done: false, priority: inputPriority.peek() }
    tasks.set([...tasks.peek(), newTask])
    setStatus(`Task created: ${title}`)
  } else if (eid) {
    tasks.set(tasks.peek().map(t => t.id === eid ? { ...t, title, priority: inputPriority.peek() } : t))
    setStatus(`Task updated: ${title}`)
  }
  editingId.set(null)
  server.update()
}

function handleCancel(): void {
  editingId.set(null)
  server.update()
}

function handleDelete(task: Task): void {
  tasks.set(tasks.peek().filter(t => t.id !== task.id))
  setStatus(`Task deleted: ${task.title}`)
  server.update()
}

function handleToggle(task: Task): void {
  tasks.set(tasks.peek().map(t => t.id === task.id ? { ...t, done: !t.done } : t))
  setStatus(`Task ${task.done ? 'reopened' : 'completed'}: ${task.title}`)
  server.update()
}

function handleFilter(f: Filter): void {
  filter.set(f)
  server.update()
}

function cyclePriority(): void {
  const cur = inputPriority.peek()
  const next = cur === 'low' ? 'medium' : cur === 'medium' ? 'high' : 'low'
  inputPriority.set(next)
  server.update()
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
}

const BG = '#0f172a'
const PANEL = '#1e293b'
const BORDER = '#334155'
const TEXT_PRIMARY = '#f8fafc'
const TEXT_MUTED = '#94a3b8'
const ACCENT = '#38bdf8'
const ACCENT_DIM = '#0c4a6e'

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------

function badge(label: string, color: string): UIElement {
  return box(
    {
      paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2,
      borderRadius: 4, backgroundColor: color + '22',
    },
    [text({ text: label, font: 'bold 10px Inter, system-ui', lineHeight: 14, color })],
  )
}

function filterButton(label: string, value: Filter): UIElement {
  const active = filter.value === value
  return box(
    {
      paddingLeft: 12, paddingRight: 12, paddingTop: 6, paddingBottom: 6,
      borderRadius: 6,
      backgroundColor: active ? ACCENT : PANEL,
      cursor: 'pointer',
      onClick: () => handleFilter(value),
      semantic: { role: 'button', ariaLabel: `Filter ${label}` },
    },
    [text({ text: label, font: `${active ? 'bold ' : ''}12px Inter, system-ui`, lineHeight: 16, color: active ? '#0f172a' : TEXT_MUTED })],
  )
}

function taskRow(task: Task): UIElement {
  return box(
    {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
      borderRadius: 6, backgroundColor: PANEL,
      semantic: { role: 'listitem', ariaLabel: task.title },
    },
    [
      checkbox(task.title, { checked: task.done, onChange: () => handleToggle(task) }),
      box({ flexGrow: 1, minWidth: 0 }, []),
      badge(task.priority, PRIORITY_COLORS[task.priority] ?? TEXT_MUTED),
      box(
        {
          paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4,
          borderRadius: 4, cursor: 'pointer',
          onClick: () => handleEdit(task),
          semantic: { role: 'button', ariaLabel: `Edit ${task.title}` },
        },
        [text({ text: 'Edit', font: '11px Inter, system-ui', lineHeight: 14, color: ACCENT })],
      ),
      box(
        {
          paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4,
          borderRadius: 4, cursor: 'pointer',
          onClick: () => handleDelete(task),
          semantic: { role: 'button', ariaLabel: `Delete ${task.title}` },
        },
        [text({ text: 'Delete', font: '11px Inter, system-ui', lineHeight: 14, color: '#ef4444' })],
      ),
    ],
  )
}

function editForm(): UIElement {
  const isNew = editingId.value === 'new'
  const title = isNew ? 'New Task' : 'Edit Task'

  return box(
    {
      flexDirection: 'column', gap: 10, padding: 16,
      borderRadius: 8, backgroundColor: PANEL, borderColor: BORDER, borderWidth: 1,
      semantic: { role: 'dialog', ariaLabel: title },
    },
    [
      text({ text: title, font: 'bold 14px Inter, system-ui', lineHeight: 20, color: TEXT_PRIMARY }),
      box({ flexDirection: 'column', gap: 4 }, [
        text({ text: 'Title', font: '11px Inter, system-ui', lineHeight: 14, color: TEXT_MUTED }),
        input(inputTitle.value, 'Enter task title...', {
          focused: true,
          caretOffset: inputCaret.value,
          onKeyDown: handleKeyDown,
        }),
      ]),
      box({ flexDirection: 'row', alignItems: 'center', gap: 8 }, [
        text({ text: 'Priority:', font: '11px Inter, system-ui', lineHeight: 14, color: TEXT_MUTED }),
        box(
          {
            paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4,
            borderRadius: 4, cursor: 'pointer',
            backgroundColor: (PRIORITY_COLORS[inputPriority.value] ?? TEXT_MUTED) + '22',
            onClick: cyclePriority,
            semantic: { role: 'button', ariaLabel: `Priority ${inputPriority.value}` },
          },
          [text({
            text: inputPriority.value,
            font: 'bold 11px Inter, system-ui', lineHeight: 14,
            color: PRIORITY_COLORS[inputPriority.value] ?? TEXT_MUTED,
          })],
        ),
      ]),
      box({ flexDirection: 'row', gap: 8 }, [
        button('Save', handleSave),
        box(
          {
            paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
            borderRadius: 6, cursor: 'pointer',
            backgroundColor: BORDER,
            onClick: handleCancel,
            semantic: { role: 'button', ariaLabel: 'Cancel' },
          },
          [text({ text: 'Cancel', font: '13px Inter, system-ui', lineHeight: 18, color: TEXT_MUTED })],
        ),
      ]),
    ],
  )
}

// ---------------------------------------------------------------------------
// Root view
// ---------------------------------------------------------------------------

function view(): UIElement {
  const filtered = tasks.value.filter(t => {
    if (filter.value === 'active') return !t.done
    if (filter.value === 'done') return t.done
    return true
  })

  const isEditing = editingId.value !== null
  const total = tasks.value.length
  const doneCount = tasks.value.filter(t => t.done).length

  return box(
    { flexDirection: 'column', padding: 20, gap: 14, width: 700, height: 500, backgroundColor: BG },
    [
      // Header
      box({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, [
        box({ flexDirection: 'column', gap: 2 }, [
          text({ text: 'Task Manager', font: 'bold 18px Inter, system-ui', lineHeight: 24, color: TEXT_PRIMARY }),
          text({ text: `${doneCount}/${total} completed`, font: '12px Inter, system-ui', lineHeight: 16, color: TEXT_MUTED }),
        ]),
        button('Add Task', handleAdd),
      ]),

      // Filter bar
      box({ flexDirection: 'row', gap: 6 }, [
        filterButton('All', 'all'),
        filterButton('Active', 'active'),
        filterButton('Done', 'done'),
      ]),

      // Edit form or task list
      ...(isEditing
        ? [editForm()]
        : [
            box(
              { flexDirection: 'column', gap: 6, flexGrow: 1, overflow: 'scroll', semantic: { tag: 'ul' } },
              filtered.length > 0
                ? filtered.map(t => taskRow(t))
                : [box({ padding: 20, alignItems: 'center' }, [
                    text({ text: 'No tasks match this filter', font: '13px Inter, system-ui', lineHeight: 18, color: TEXT_MUTED }),
                  ])],
            ),
          ]
      ),

      // Status bar
      ...(statusMessage.value.length > 0
        ? [box(
            { paddingTop: 6, semantic: { role: 'status', ariaLabel: statusMessage.value } },
            [text({ text: statusMessage.value, font: '11px Inter, system-ui', lineHeight: 14, color: ACCENT })],
          )]
        : []),
    ],
  )
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

server = await createServer(view, { port: 3100, width: 700, height: 500 })

console.log('MCP Native CRUD server listening on ws://localhost:3100')
console.log('')
console.log('Connect from a browser:  npm run client  (then open http://localhost:5173/)')
console.log('Connect from MCP:        geometra_connect({ url: "ws://localhost:3100" })')
