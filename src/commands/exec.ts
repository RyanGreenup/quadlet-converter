import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import { findContainer } from '../lib/find-container.js'

const execCommand = defineCommand({
  name: 'exec',
  description: 'Execute a command in a running container by service name',
  options: {
    project: option(
      z.string().optional(),
      { description: 'Filter by project name', short: 'p' },
    ),
    interactive: option(
      z.boolean().default(true),
      { description: 'Allocate a TTY (default: true)', short: 'i' },
    ),
  },
  handler: async ({ flags, positional }) => {
    const service = positional[0]
    if (!service) {
      console.error('Usage: panlet exec <service> -- <command...>')
      process.exit(1)
    }

    const cmd = positional.slice(1)
    if (cmd.length === 0) {
      console.error('Error: please provide a command to execute')
      console.error('Usage: panlet exec <service> -- <command...>')
      process.exit(1)
    }

    const id = await findContainer(service, flags.project)
    if (!id) {
      console.error(`No running container found for service "${service}"`)
      process.exit(1)
    }

    const execArgs = ['podman', 'exec']
    if (flags.interactive) execArgs.push('-it')
    execArgs.push(id, ...cmd)

    const proc = Bun.spawn(execArgs, {
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'inherit',
    })
    const exitCode = await proc.exited
    process.exit(exitCode)
  },
})

export default execCommand
