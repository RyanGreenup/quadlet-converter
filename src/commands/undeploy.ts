import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import path from 'node:path'
import { readdir, rm } from 'node:fs/promises'

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

/** Print a command before running it. */
async function run(args: string[], opts?: { check?: boolean, quiet?: boolean }): Promise<number> {
  console.log(`$ ${args.join(' ')}`)
  const proc = Bun.spawn(args, {
    stdout: 'inherit',
    stderr: opts?.quiet ? 'pipe' : 'inherit',
  })
  const code = await proc.exited
  if (opts?.check && code !== 0) {
    console.error(`Command failed with exit code ${code}`)
    process.exit(code)
  }
  return code
}

const undeployCommand = defineCommand({
  name: 'undeploy',
  description: 'Stop services, remove quadlet units, and reload systemd',
  options: {
    system: option(
      z.boolean().default(false),
      { description: 'Undeploy system-wide instead of per-user' },
    ),
  },
  handler: async ({ flags, positional }) => {
    const project = positional[0]
    if (!project) {
      console.error('Usage: panlet undeploy <project-name>')
      console.error('  e.g. panlet undeploy postgres-podman-example')
      process.exit(1)
    }

    const targetDir = path.join(quadletDir(), project)
    const scope = flags.system ? [] : ['--user']

    // List unit files to derive service names
    let entries: string[]
    try {
      entries = await readdir(targetDir)
    } catch {
      console.error(`No installed quadlet directory found at ${targetDir}`)
      process.exit(1)
    }

    const services = containerServices(entries)

    // Stop services
    if (services.length > 0) {
      await run(['systemctl', ...scope, 'stop', ...services])
    }

    // Remove quadlet directory
    console.log(`$ rm -r ${targetDir}`)
    await rm(targetDir, { recursive: true })

    // Reload and reset failed
    await run(['systemctl', ...scope, 'daemon-reload'], { check: true })
    if (services.length > 0) {
      await run(['systemctl', ...scope, 'reset-failed', ...services], { quiet: true })
    }

    console.log('\nUndeployed. Quadlet units removed.')
  },
})

export default undeployCommand
