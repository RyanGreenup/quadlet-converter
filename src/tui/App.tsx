import { useState, useEffect, useMemo } from 'react'
import { useKeyboard } from '@opentui/react'
import { SyntaxStyle, type StyleDefinition } from '@opentui/core'
import { parseCompose } from '../lib/compose/index.js'
import { composeToQuadletFiles, quadletIRToCompose } from '../lib/converter.js'
import { parseQuadlet, toQuadletIR, serializeQuadlet, irToQuadletData } from '../lib/quadlet.js'
import { FileTree, scanDir, type TreeNode, type TreeFile } from './FileTree.js'
import { RGBA } from '@opentui/core'
import path from 'node:path'

// Tree-sitter scope → color mapping (Tokyo Night-inspired palette)
const highlightStyles: Record<string, StyleDefinition> = {
  'keyword':              { fg: RGBA.fromHex('#bb9af7') },
  'keyword.directive':    { fg: RGBA.fromHex('#bb9af7') },
  'keyword.return':       { fg: RGBA.fromHex('#bb9af7') },
  'type':                 { fg: RGBA.fromHex('#2ac3de') },
  'type.builtin':         { fg: RGBA.fromHex('#2ac3de') },
  'string':               { fg: RGBA.fromHex('#9ece6a') },
  'string.special':       { fg: RGBA.fromHex('#9ece6a') },
  'number':               { fg: RGBA.fromHex('#ff9e64') },
  'float':                { fg: RGBA.fromHex('#ff9e64') },
  'boolean':              { fg: RGBA.fromHex('#ff9e64') },
  'constant':             { fg: RGBA.fromHex('#ff9e64') },
  'constant.builtin':     { fg: RGBA.fromHex('#ff9e64') },
  'comment':              { fg: RGBA.fromHex('#565f89'), italic: true },
  'property':             { fg: RGBA.fromHex('#73daca') },
  'variable':             { fg: RGBA.fromHex('#c0caf5') },
  'variable.builtin':     { fg: RGBA.fromHex('#7dcfff') },
  'function':             { fg: RGBA.fromHex('#7aa2f7') },
  'function.builtin':     { fg: RGBA.fromHex('#7aa2f7') },
  'operator':             { fg: RGBA.fromHex('#89ddff') },
  'punctuation':          { fg: RGBA.fromHex('#a9b1d6') },
  'punctuation.bracket':  { fg: RGBA.fromHex('#a9b1d6') },
  'punctuation.delimiter':{ fg: RGBA.fromHex('#89ddff') },
  'punctuation.special':  { fg: RGBA.fromHex('#89ddff') },
  'tag':                  { fg: RGBA.fromHex('#f7768e') },
  'tag.attribute':        { fg: RGBA.fromHex('#bb9af7') },
  'label':                { fg: RGBA.fromHex('#73daca') },
  'text.title':           { fg: RGBA.fromHex('#7aa2f7'), bold: true },
  'text.uri':             { fg: RGBA.fromHex('#73daca'), underline: true },
}

interface PreviewState {
  content: string
  filetype: string  // tree-sitter filetype for syntax highlighting
}

function convertFile(text: string, file: TreeFile): PreviewState {
  try {
    if (file.fileType === 'compose') {
      const compose = parseCompose(text)
      if (!compose.services || Object.keys(compose.services).length === 0) {
        return { content: '(no services found)', filetype: 'text' }
      }
      const basename = path.basename(file.name, path.extname(file.name))
      const podName = basename === 'docker-compose' || basename === 'compose'
        ? path.basename(path.dirname(file.path))
        : basename
      const files = composeToQuadletFiles(compose, podName)
      const content = files.map(({ filename, ir }) =>
        `### ${filename} ###\n${serializeQuadlet(irToQuadletData(ir))}`
      ).join('\n')
      return { content, filetype: 'ini' }
    } else {
      const data = parseQuadlet(text)
      const ir = toQuadletIR(data)
      const serviceName = path.basename(file.name, path.extname(file.name))
      const compose = quadletIRToCompose(ir, serviceName)
      return { content: Bun.YAML.stringify(compose, null, 2), filetype: 'yaml' }
    }
  } catch (err) {
    return { content: `Error: ${err instanceof Error ? err.message : String(err)}`, filetype: 'text' }
  }
}

export function App({ dir }: { dir: string }) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [preview, setPreview] = useState<PreviewState>({ content: '', filetype: 'text' })
  const [panel, setPanel] = useState<'files' | 'preview'>('files')

  const syntaxStyle = useMemo(() => SyntaxStyle.fromStyles(highlightStyles), [])

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
            {preview.content
              ? <code content={preview.content} filetype={preview.filetype} syntaxStyle={syntaxStyle} />
              : <text>(select a file)</text>
            }
          </scrollbox>
        </box>
      </box>
      <box height={1} paddingX={1}>
        <text> ↑↓/jk: navigate  ←→/hl: collapse/expand  Enter: activate  *: expand level  Tab: panel  q: quit</text>
      </box>
    </box>
  )
}
