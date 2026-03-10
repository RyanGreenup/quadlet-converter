import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import { parseCompose } from '../../lib/compose/index.js'
import { composeToQuadletFiles } from '../../lib/converter.js'
import { serializeQuadlet } from '../../lib/quadlet.js'
import { extractSecretDefs, generateSecretsJustfile } from '../../lib/secrets.js'
import type { QuadletData } from '../../lib/quadlet.js'
import type { QuadletIR } from '../../lib/quadlet.js'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

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
  options: {
    output: option(
      z.string().optional(),
      {
        description: 'Output directory (writes individual files instead of stdout)',
        short: 'o',
      }
    ),
  },
  handler: async ({ flags, positional }) => {
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
    const secretDefs = extractSecretDefs(compose)

    if (flags.output) {
      await mkdir(flags.output, { recursive: true })

      for (const { filename, ir } of files) {
        const outPath = path.join(flags.output, filename)
        await writeFile(outPath, serializeQuadlet(irToQuadletData(ir)))
        console.log(outPath)
      }

      if (secretDefs.length > 0) {
        const outPath = path.join(flags.output, 'secrets.just')
        await writeFile(outPath, generateSecretsJustfile(secretDefs))
        console.log(outPath)
      }
    } else {
      for (let i = 0; i < files.length; i++) {
        const { filename, ir } = files[i]
        if (i > 0) console.log()
        console.log(`### ${filename} ###`)
        process.stdout.write(serializeQuadlet(irToQuadletData(ir)))
      }

      if (secretDefs.length > 0) {
        console.log()
        console.log(`### secrets.just ###`)
        process.stdout.write(generateSecretsJustfile(secretDefs))
      }
    }
  }
})

export default composeToQuadletCommand
