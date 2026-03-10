import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import { parseQuadlet } from '../../lib/quadlet.js'
import { toQuadletIR } from '../../lib/quadlet.js'
import { quadletIRToCompose } from '../../lib/converter.js'

const quadletToComposeCommand = defineCommand({
  name: 'quadlet-to-compose',
  description: 'Convert a Quadlet unit file to Docker Compose YAML',
  options: {
    service: option(
      z.string().optional(),
      {
        description: 'Service name to use in the compose output',
        short: 's'
      }
    ),
  },
  handler: async ({ flags, positional }) => {
    const filePath = positional[0]
    if (!filePath) {
      console.error('Error: please provide a quadlet file path')
      process.exit(1)
    }

    const file = Bun.file(filePath)
    const text = await file.text()
    const data = parseQuadlet(text)
    const ir = toQuadletIR(data)

    // Derive service name from filename if not provided
    const defaultName = filePath.replace(/.*\//, '').replace(/\.container$/, '')
    const serviceName = flags.service ?? defaultName

    const compose = quadletIRToCompose(ir, serviceName)
    const yaml = Bun.YAML.stringify(compose)
    process.stdout.write(yaml)
  }
})

export default quadletToComposeCommand
