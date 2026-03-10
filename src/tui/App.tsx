import { useState, useEffect } from 'react'
import { useKeyboard } from '@opentui/react'
import { parseCompose } from '../lib/compose/index.js'
import { composeToQuadletFiles, quadletIRToCompose } from '../lib/converter.js'
import { parseQuadlet, toQuadletIR, serializeQuadlet, irToQuadletData } from '../lib/quadlet.js'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

interface FileEntry {
  name: string
  path: string
  type: 'compose' | 'quadlet'
}

const COMPOSE_EXTS = new Set(['.yml', '.yaml'])
const QUADLET_EXTS = new Set(['.container', '.pod', '.network', '.volume'])

function detectType(name: string): 'compose' | 'quadlet' | null {
  const ext = path.extname(name)
  if (COMPOSE_EXTS.has(ext)) return 'compose'
  if (QUADLET_EXTS.has(ext)) return 'quadlet'
  return null
}

function convertFile(text: string, entry: FileEntry): string {
  try {
    if (entry.type === 'compose') {
      const compose = parseCompose(text)
      if (!compose.services || Object.keys(compose.services).length === 0) {
        return '(no services found)'
      }
      const basename = path.basename(entry.name, path.extname(entry.name))
      const podName = basename === 'docker-compose' || basename === 'compose'
        ? path.basename(path.dirname(entry.path))
        : basename
      const files = composeToQuadletFiles(compose, podName)
      return files.map(({ filename, ir }) =>
        `### ${filename} ###\n${serializeQuadlet(irToQuadletData(ir))}`
      ).join('\n')
    } else {
      const data = parseQuadlet(text)
      const ir = toQuadletIR(data)
      const serviceName = path.basename(entry.name, path.extname(entry.name))
      const compose = quadletIRToCompose(ir, serviceName)
      return Bun.YAML.stringify(compose)
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

export function App({ dir }: { dir: string }) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [preview, setPreview] = useState('')
  const [panel, setPanel] = useState<'files' | 'preview'>('files')

  // Scan directory on mount
  useEffect(() => {
    readdir(path.resolve(dir)).then(entries => {
      const matched: FileEntry[] = []
      for (const name of entries.sort()) {
        const type = detectType(name)
        if (type) matched.push({ name, path: path.resolve(dir, name), type })
      }
      setFiles(matched)
    })
  }, [dir])

  // Load preview when selection changes
  const loadPreview = async (entry: FileEntry) => {
    const text = await Bun.file(entry.path).text()
    setPreview(convertFile(text, entry))
  }

  // Load first file when files list populates
  useEffect(() => {
    if (files.length > 0) loadPreview(files[0])
  }, [files.length])

  useKeyboard((key) => {
    if (key.name === 'q' && !key.ctrl && !key.meta) {
      process.exit(0)
    }
    if (key.name === 'tab') {
      setPanel((p: 'files' | 'preview') => p === 'files' ? 'preview' : 'files')
    }
  })

  const fileOptions = files.map((f: FileEntry) => ({
    name: f.name,
    description: f.type === 'compose' ? 'Compose → Quadlet' : 'Quadlet → Compose',
  }))

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" flexGrow={1}>
        <box width="40%" borderStyle="rounded" title=" Files " focused={panel === 'files'}>
          {files.length === 0
            ? <text>No files found</text>
            : <select
                options={fileOptions}
                focused={panel === 'files'}
                showDescription
                onChange={(index) => {
                  if (files[index]) loadPreview(files[index])
                }}
              />
          }
        </box>
        <box flexGrow={1} borderStyle="rounded" title=" Preview " focused={panel === 'preview'}>
          <scrollbox focused={panel === 'preview'}>
            <text>{preview || '(select a file)'}</text>
          </scrollbox>
        </box>
      </box>
      <box height={1} paddingX={1}>
        <text> j/k: navigate  Tab: switch panel  q: quit</text>
      </box>
    </box>
  )
}
