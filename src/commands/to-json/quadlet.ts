import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import { parseQuadlet } from '../../lib/quadlet.js'

const quadletCommand = defineCommand({
  name: 'quadlet',
  description: 'Convert a Quadlet unit file to JSON',
  options: {
    pretty: option(
      z.boolean().default(true),
      {
        description: 'Pretty-print the JSON output',
        short: 'p'
      }
    )
  },
  handler: async ({ flags, positional }) => {
    const filePath = positional[0]
    if (!filePath) {
      console.error('Error: please provide a quadlet file path')
      process.exit(1)
    }

    const file = Bun.file(filePath)
    const text = await file.text()
    const parsed = parseQuadlet(text)
    const indent = flags.pretty ? 2 : undefined
    console.log(JSON.stringify(parsed, null, indent))
  }
})

export default quadletCommand
