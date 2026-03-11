import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import path from 'node:path'
import { cp, mkdir, readdir } from 'node:fs/promises'

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
async function run(args: string[], opts?: { check?: boolean }): Promise<number> {
  console.log(`$ ${args.join(' ')}`)
  const proc = Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit' })
  const code = await proc.exited
  if (opts?.check && code !== 0) {
    console.error(`Command failed with exit code ${code}`)
    process.exit(code)
  }
  return code
}

const deployCommand = defineCommand({
  name: 'deploy',
  description: 'Install quadlet units and start services',
  options: {
    system: option(
      z.boolean().default(false),
      { description: 'Deploy system-wide instead of per-user' },
    ),
  },
  handler: async ({ flags, positional }) => {
    const deployDir = positional[0]
    if (!deployDir) {
      console.error('Usage: panlet deploy <deploy-dir>')
      console.error('  e.g. panlet deploy deploy/postgres-podman-example')
      process.exit(1)
    }

    const resolvedDir = path.resolve(deployDir)
    const projectName = path.basename(resolvedDir)
    const targetRoot = quadletDir()
    const targetDir = path.join(targetRoot, projectName)
    const scope = flags.system ? [] : ['--user']

    // List unit files in the deploy dir
    const entries = await readdir(resolvedDir)
    const services = containerServices(entries)

    if (services.length === 0) {
      console.error(`No .container files found in ${resolvedDir}`)
      process.exit(1)
    }

    // Copy units to quadlet directory
    console.log(`$ mkdir -p ${targetRoot}`)
    await mkdir(targetRoot, { recursive: true })
    console.log(`$ cp -r ${resolvedDir} ${targetDir}`)
    await cp(resolvedDir, targetDir, { recursive: true })

    // Reload and start
    await run(['systemctl', ...scope, 'daemon-reload'], { check: true })
    await run(['systemctl', ...scope, 'start', ...services], { check: true })

    console.log('\nDeployed. Services started:')
    await run(['systemctl', ...scope, '--no-pager', 'status', ...services])
  },
})

export default deployCommand
