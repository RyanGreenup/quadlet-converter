import { useState, useCallback } from 'react'
import { useKeyboard } from '@opentui/react'
import path from 'node:path'
import { readdir, stat } from 'node:fs/promises'

// ── Data types ──────────────────────────────────────────────

export type FileType = 'compose' | 'quadlet'

export interface TreeFile {
  kind: 'file'
  name: string
  path: string
  fileType: FileType
}

export interface TreeDir {
  kind: 'dir'
  name: string
  path: string
  children: TreeNode[]
}

export type TreeNode = TreeFile | TreeDir

/** A flattened row for rendering — produced from the tree + expanded state. */
interface FlatRow {
  node: TreeNode
  depth: number
}

// ── Scanning ────────────────────────────────────────────────

const COMPOSE_EXTS = new Set(['.yml', '.yaml'])
const QUADLET_EXTS = new Set(['.container', '.pod', '.network', '.volume'])

function detectType(name: string): FileType | null {
  const ext = path.extname(name)
  if (COMPOSE_EXTS.has(ext)) return 'compose'
  if (QUADLET_EXTS.has(ext)) return 'quadlet'
  return null
}

/** Recursively scan a directory for compose/quadlet files. */
export async function scanDir(dir: string): Promise<TreeNode[]> {
  const resolved = path.resolve(dir)
  const entries = await readdir(resolved)
  const nodes: TreeNode[] = []

  for (const name of entries.sort()) {
    if (name.startsWith('.')) continue
    const full = path.join(resolved, name)
    const s = await stat(full)

    if (s.isDirectory()) {
      const children = await scanDir(full)
      if (children.length > 0) {
        nodes.push({ kind: 'dir', name, path: full, children })
      }
    } else {
      const fileType = detectType(name)
      if (fileType) {
        nodes.push({ kind: 'file', name, path: full, fileType })
      }
    }
  }
  return nodes
}

// ── Flatten ─────────────────────────────────────────────────

function flatten(
  nodes: TreeNode[],
  expanded: Set<string>,
  depth: number = 0,
): FlatRow[] {
  const rows: FlatRow[] = []
  for (const node of nodes) {
    rows.push({ node, depth })
    if (node.kind === 'dir' && expanded.has(node.path)) {
      rows.push(...flatten(node.children, expanded, depth + 1))
    }
  }
  return rows
}

// ── ARIA TreeView helpers ────────────────────────────────────

/** Find the parent directory row index for a given row. */
function findParent(rows: FlatRow[], index: number): number | null {
  const targetDepth = rows[index].depth
  if (targetDepth === 0) return null
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].depth < targetDepth) return i
  }
  return null
}

/** Find first row whose name starts with the given character (type-ahead). */
function findByChar(rows: FlatRow[], startIndex: number, char: string): number | null {
  const lower = char.toLowerCase()
  // Search from after cursor to end, then wrap to start
  for (let offset = 1; offset <= rows.length; offset++) {
    const i = (startIndex + offset) % rows.length
    if (rows[i].node.name.toLowerCase().startsWith(lower)) return i
  }
  return null
}

// ── Component ───────────────────────────────────────────────

export interface FileTreeProps {
  tree: TreeNode[]
  focused?: boolean
  onSelect?: (file: TreeFile) => void
}

export function FileTree({ tree, focused, onSelect }: FileTreeProps) {
  const [cursor, setCursor] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const rows = flatten(tree, expanded)

  const clamp = (i: number) => Math.max(0, Math.min(rows.length - 1, i))

  const expand = useCallback((dirPath: string) => {
    setExpanded(prev => {
      if (prev.has(dirPath)) return prev
      const next = new Set(prev)
      next.add(dirPath)
      return next
    })
  }, [])

  const collapse = useCallback((dirPath: string) => {
    setExpanded(prev => {
      if (!prev.has(dirPath)) return prev
      const next = new Set(prev)
      next.delete(dirPath)
      return next
    })
  }, [])

  const moveCursor = (next: number) => {
    const clamped = clamp(next)
    setCursor(clamped)
    const row = rows[clamped]
    if (row?.node.kind === 'file') onSelect?.(row.node)
  }

  useKeyboard((key) => {
    if (!focused) return

    const row = rows[cursor]
    if (!row) return

    // ARIA TreeView keyboard interactions
    // https://www.w3.org/WAI/ARIA/apg/patterns/treeview/#keyboardinteraction
    //
    // Down Arrow (j)  — Move to next visible row
    // Up Arrow (k)    — Move to previous visible row
    // Right Arrow (l) — On closed dir: open. On open dir: move to first child. On file: no-op.
    // Left Arrow (h)  — On open dir: close. On child: move to parent dir.
    // Home (g)        — Move to first row
    // End (G)         — Move to last row
    // Enter / Space   — Activate (toggle dir, or select file)
    // * (asterisk)    — Expand all siblings at this level
    // Type-ahead      — Single printable character jumps to next matching name

    switch (key.name) {
      // ── Vertical movement ──
      case 'down':
      case 'j':
        key.preventDefault()
        moveCursor(cursor + 1)
        break

      case 'up':
      case 'k':
        key.preventDefault()
        moveCursor(cursor - 1)
        break

      // ── Horizontal / expand-collapse ──
      case 'right':
      case 'l':
        key.preventDefault()
        if (row.node.kind === 'dir') {
          if (!expanded.has(row.node.path)) {
            // Closed dir → open it
            expand(row.node.path)
          } else {
            // Open dir → move to first child
            if (cursor + 1 < rows.length && rows[cursor + 1].depth > row.depth) {
              moveCursor(cursor + 1)
            }
          }
        }
        break

      case 'left':
      case 'h':
        key.preventDefault()
        if (row.node.kind === 'dir' && expanded.has(row.node.path)) {
          // Open dir → close it
          collapse(row.node.path)
        } else {
          // Child node or closed dir → move to parent
          const parent = findParent(rows, cursor)
          if (parent != null) moveCursor(parent)
        }
        break

      // ── Activate ──
      case 'return':
      case 'space':
        key.preventDefault()
        if (row.node.kind === 'dir') {
          if (expanded.has(row.node.path)) collapse(row.node.path)
          else expand(row.node.path)
        } else {
          onSelect?.(row.node)
        }
        break

      // ── Jump to ends ──
      case 'home':
        key.preventDefault()
        moveCursor(0)
        break

      case 'end':
        key.preventDefault()
        moveCursor(rows.length - 1)
        break

      default:
        // g / G as vim Home/End aliases
        if (key.name === 'g' && !key.shift && !key.ctrl) {
          key.preventDefault()
          moveCursor(0)
          break
        }
        if (key.name === 'G' || (key.name === 'g' && key.shift)) {
          key.preventDefault()
          moveCursor(rows.length - 1)
          break
        }

        // * — expand all sibling directories at this level
        if (key.sequence === '*') {
          key.preventDefault()
          // Find all siblings at this depth
          const depth = row.depth
          setExpanded(prev => {
            const next = new Set(prev)
            for (const r of rows) {
              if (r.depth === depth && r.node.kind === 'dir') {
                next.add(r.node.path)
              }
            }
            return next
          })
          break
        }

        // Type-ahead: single printable character
        if (key.name.length === 1 && !key.ctrl && !key.meta) {
          const match = findByChar(rows, cursor, key.name)
          if (match != null) {
            key.preventDefault()
            moveCursor(match)
          }
        }
        break
    }
  })

  if (rows.length === 0) {
    return <text>No files found</text>
  }

  return (
    <box flexDirection="column">
      {rows.map((row, i) => {
        const isCursor = i === cursor
        const indent = '  '.repeat(row.depth)
        const icon = row.node.kind === 'dir'
          ? (expanded.has(row.node.path) ? '▼ ' : '▶ ')
          : '  '
        const label = `${indent}${icon}${row.node.name}`

        return (
          <text
            key={row.node.path}
            bg={isCursor && focused ? '#3a3a5c' : undefined}
            fg={row.node.kind === 'dir' ? '#7aa2f7' : undefined}
          >
            {label}
          </text>
        )
      })}
    </box>
  )
}
