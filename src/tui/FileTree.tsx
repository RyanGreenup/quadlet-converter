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

  const toggle = useCallback((dir: TreeDir) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(dir.path)) next.delete(dir.path)
      else next.add(dir.path)
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
    key.preventDefault()

    switch (key.name) {
      case 'j':
      case 'down':
        moveCursor(cursor + 1)
        break
      case 'k':
      case 'up':
        moveCursor(cursor - 1)
        break
      case 'g':
        moveCursor(0)
        break
      case 'G':
        moveCursor(rows.length - 1)
        break
      case 'return':
      case 'space':
      case 'l':
      case 'right': {
        const row = rows[cursor]
        if (!row) break
        if (row.node.kind === 'dir') {
          toggle(row.node)
        } else {
          onSelect?.(row.node)
        }
        break
      }
      case 'h':
      case 'left': {
        const row = rows[cursor]
        if (!row) break
        if (row.node.kind === 'dir' && expanded.has(row.node.path)) {
          toggle(row.node)
        }
        break
      }
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
