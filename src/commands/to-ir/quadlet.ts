import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import { toQuadletIR, type QuadletData } from '../../lib/quadlet.js'

const quadletCommand = defineCommand({
  name: 'quadlet',
  description: 'Convert QuadletData JSON to QuadletIR',
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
      console.error('Error: please provide a JSON file path')
      process.exit(1)
    }

    const file = Bun.file(filePath)
    const data: QuadletData = await file.json()
    const ir = toQuadletIR(data)
    const indent = flags.pretty ? 2 : undefined
    console.log(JSON.stringify(ir, null, indent))
  }
})

export default quadletCommand
