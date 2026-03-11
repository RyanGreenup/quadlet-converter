import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import { findContainer } from '../lib/find-container.js'

const findCommand = defineCommand({
  name: 'find',
  description: 'Find a running container by service name',
  options: {
    project: option(
      z.string().optional(),
      { description: 'Filter by project name', short: 'p' },
    ),
  },
  handler: async ({ flags, positional }) => {
    const service = positional[0]
    if (!service) {
      console.error('Error: please provide a service name')
      process.exit(1)
    }

    const id = await findContainer(service, flags.project)
    if (!id) {
      console.error(`No running container found for service "${service}"`)
      process.exit(1)
    }

    console.log(id)
  },
})

export default findCommand
