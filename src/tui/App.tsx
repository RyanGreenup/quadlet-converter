import { useState, useEffect } from 'react'
import { useKeyboard } from '@opentui/react'
import { parseCompose } from '../lib/compose/index.js'
import { composeToQuadletFiles, quadletIRToCompose } from '../lib/converter.js'
import { parseQuadlet, toQuadletIR, serializeQuadlet, irToQuadletData } from '../lib/quadlet.js'
import { FileTree, scanDir, type TreeNode, type TreeFile } from './FileTree.js'
import path from 'node:path'

function convertFile(text: string, file: TreeFile): string {
  try {
    if (file.fileType === 'compose') {
      const compose = parseCompose(text)
      if (!compose.services || Object.keys(compose.services).length === 0) {
        return '(no services found)'
      }
      const basename = path.basename(file.name, path.extname(file.name))
      const podName = basename === 'docker-compose' || basename === 'compose'
        ? path.basename(path.dirname(file.path))
        : basename
      const files = composeToQuadletFiles(compose, podName)
      return files.map(({ filename, ir }) =>
        `### ${filename} ###\n${serializeQuadlet(irToQuadletData(ir))}`
      ).join('\n')
    } else {
      const data = parseQuadlet(text)
      const ir = toQuadletIR(data)
      const serviceName = path.basename(file.name, path.extname(file.name))
      const compose = quadletIRToCompose(ir, serviceName)
      return Bun.YAML.stringify(compose, null, 2)
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

export function App({ dir }: { dir: string }) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [preview, setPreview] = useState('')
  const [panel, setPanel] = useState<'files' | 'preview'>('files')

  useEffect(() => {
    scanDir(path.resolve(dir)).then(setTree)
  }, [dir])

  const handleSelect = async (file: TreeFile) => {
    const text = await Bun.file(file.path).text()
    setPreview(convertFile(text, file))
  }

  useKeyboard((key) => {
    if (key.name === 'q' && !key.ctrl && !key.meta) {
      process.exit(0)
    }
    if (key.name === 'tab') {
      setPanel((p: 'files' | 'preview') => p === 'files' ? 'preview' : 'files')
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" flexGrow={1}>
        <box width="40%" borderStyle="rounded" title=" Files " focused={panel === 'files'}>
          <scrollbox focused={panel === 'files'}>
            <FileTree tree={tree} focused={panel === 'files'} onSelect={handleSelect} />
          </scrollbox>
        </box>
        <box flexGrow={1} borderStyle="rounded" title=" Preview " focused={panel === 'preview'}>
          <scrollbox focused={panel === 'preview'}>
            <text>{preview || '(select a file)'}</text>
          </scrollbox>
        </box>
      </box>
      <box height={1} paddingX={1}>
        <text> ↑↓/jk: navigate  ←→/hl: collapse/expand  Enter: activate  *: expand level  Tab: panel  q: quit</text>
      </box>
    </box>
  )
}
