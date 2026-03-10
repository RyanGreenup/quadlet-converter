import { defineCommand } from '@bunli/core'
import { parseCompose } from '../../lib/compose/index.js'
import { composeToQuadletFiles } from '../../lib/converter.js'
import { serializeQuadlet } from '../../lib/quadlet.js'
import type { QuadletData } from '../../lib/quadlet.js'
import type { QuadletIR } from '../../lib/quadlet.js'
import path from 'node:path'

/** Convert QuadletIR back to QuadletData for serialization. */
function irToQuadletData(ir: QuadletIR): QuadletData {
  const data: QuadletData = {}
  for (const [section, entries] of Object.entries(ir)) {
    const sectionData: Record<string, string | string[]> = {}
    for (const { key, value } of entries) {
      if (key in sectionData) {
        const existing = sectionData[key]
        if (Array.isArray(existing)) {
          existing.push(value)
        } else {
          sectionData[key] = [existing, value]
        }
      } else {
        sectionData[key] = value
      }
    }
    data[section] = sectionData
  }
  return data
}

const composeToQuadletCommand = defineCommand({
  name: 'compose-to-quadlet',
  description: 'Convert a Docker Compose file to Quadlet unit file(s)',
  handler: async ({ positional }) => {
    const filePath = positional[0]
    if (!filePath) {
      console.error('Error: please provide a compose file path')
      process.exit(1)
    }

    const file = Bun.file(filePath)
    const text = await file.text()
    const compose = parseCompose(text)

    if (!compose.services || Object.keys(compose.services).length === 0) {
      console.error('Error: no services found in compose file')
      process.exit(1)
    }

    // Derive pod name from the compose filename (without extension)
    const basename = path.basename(filePath, path.extname(filePath))
    const podName = basename === 'docker-compose' || basename === 'compose'
      ? path.basename(path.dirname(filePath))
      : basename

    const files = composeToQuadletFiles(compose, podName)

    for (let i = 0; i < files.length; i++) {
      const { filename, ir } = files[i]
      if (i > 0) console.log()
      console.log(`### ${filename} ###`)
      const data = irToQuadletData(ir)
      process.stdout.write(serializeQuadlet(data))
    }
  }
})

export default composeToQuadletCommand
