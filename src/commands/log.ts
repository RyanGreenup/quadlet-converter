import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import path from 'node:path'
import { readdir } from 'node:fs/promises'

function quadletDir(): string {
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(process.env.HOME!, '.config'),
    'containers', 'systemd',
  )
}

function containerServices(files: string[]): string[] {
  return files
    .filter(f => f.endsWith('.container'))
    .map(f => f.replace(/\.container$/, '.service'))
}

const logCommand = defineCommand({
  name: 'log',
  description: 'Follow journald logs for a deployed project',
  options: {
    system: option(
      z.boolean().default(false),
      { description: 'Use system scope instead of user' },
    ),
    follow: option(
      z.boolean().default(true),
      { description: 'Follow log output (default: true)', short: 'f' },
    ),
  },
  handler: async ({ flags, positional }) => {
    const project = positional[0]
    if (!project) {
      console.error('Usage: panlet log <project-name>')
      process.exit(1)
    }

    const targetDir = path.join(quadletDir(), project)
    let entries: string[]
    try {
      entries = await readdir(targetDir)
    } catch {
      console.error(`No installed quadlet directory found at ${targetDir}`)
      process.exit(1)
    }

    const services = containerServices(entries)
    if (services.length === 0) {
      console.error(`No .container files found in ${targetDir}`)
      process.exit(1)
    }

    const args = ['journalctl']
    if (!flags.system) args.push('--user')
    if (flags.follow) args.push('-f')

    // Remaining positional args (after project) passed through to journalctl
    args.push(...positional.slice(1))

    for (const svc of services) {
      args.push('-u', svc)
    }

    const proc = Bun.spawn(args, {
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'inherit',
    })
    const code = await proc.exited
    process.exit(code)
  },
})

export default logCommand
