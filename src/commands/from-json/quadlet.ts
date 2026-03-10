import { defineCommand } from '@bunli/core'
import { type QuadletData, serializeQuadlet } from '../../lib/quadlet.js'

const quadletCommand = defineCommand({
  name: 'quadlet',
  description: 'Convert a JSON file to Quadlet unit format',
  handler: async ({ positional }) => {
    const filePath = positional[0]
    if (!filePath) {
      console.error('Error: please provide a JSON file path')
      process.exit(1)
    }

    const file = Bun.file(filePath)
    const data: QuadletData = await file.json()
    const output = serializeQuadlet(data)
    process.stdout.write(output)
  }
})

export default quadletCommand
