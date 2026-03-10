import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import { parseCompose } from '../../lib/compose/index.js'
import { composeServiceToQuadletIR } from '../../lib/converter.js'
import { serializeQuadlet } from '../../lib/quadlet.js'
import type { QuadletData } from '../../lib/quadlet.js'
import type { QuadletIR } from '../../lib/quadlet.js'

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
    service: option(
      z.string().optional(),
      {
        description: 'Service name to convert (defaults to first service)',
        short: 's'
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

    const serviceName = flags.service ?? Object.keys(compose.services)[0]
    const service = compose.services[serviceName]
    if (!service) {
      console.error(`Error: service "${serviceName}" not found`)
      process.exit(1)
    }

    const ir = composeServiceToQuadletIR(serviceName, service)
    const data = irToQuadletData(ir)
    const output = serializeQuadlet(data)
    console.log(`# ${serviceName}.container`)
    process.stdout.write(output)
  }
})

export default composeToQuadletCommand
