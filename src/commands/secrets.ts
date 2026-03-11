import { defineCommand, defineGroup, option } from '@bunli/core'
import { z } from 'zod'
import path from 'node:path'
import { parseCompose } from '../lib/compose/index.js'
import { extractSecretDefs, type SecretDef } from '../lib/secrets.js'

/** Read the value for a secret, decrypting with sops if needed. */
async function readSecretValue(secret: SecretDef, opts: { sops: boolean, composeDir: string }): Promise<string | null> {
  if (secret.external) return null

  if (secret.environment) {
    const val = process.env[secret.environment]
    if (!val) {
      console.error(`Environment variable ${secret.environment} is not set (needed for secret "${secret.name}")`)
      process.exit(1)
    }
    return val
  }

  if (secret.file) {
    const filePath = secret.file.startsWith('/')
      ? secret.file
      : path.resolve(opts.composeDir, secret.file)

    if (opts.sops) {
      const proc = Bun.spawn(['sops', '-d', filePath], { stdout: 'pipe', stderr: 'pipe' })
      const code = await proc.exited
      if (code !== 0) {
        const stderr = await new Response(proc.stderr).text()
        console.error(`Failed to decrypt ${filePath}: ${stderr.trim()}`)
        process.exit(1)
      }
      return (await new Response(proc.stdout).text()).trimEnd()
    }

    return (await Bun.file(filePath).text()).trimEnd()
  }

  return null
}

/** Run podman secret create, either locally or via SSH. */
async function createSecret(name: string, value: string, opts: { host?: string, replace: boolean }): Promise<void> {
  const args = opts.host
    ? ['ssh', opts.host, 'podman', 'secret', 'create', ...(opts.replace ? ['--replace'] : []), name, '-']
    : ['podman', 'secret', 'create', ...(opts.replace ? ['--replace'] : []), name, '-']

  console.log(`$ ${args.join(' ')} <<< ***`)
  const proc = Bun.spawn(args, {
    stdin: new Response(value + '\n').body!,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const code = await proc.exited
  if (code !== 0) {
    console.error(`Failed to create secret "${name}"`)
    process.exit(code)
  }
}

const pushCommand = defineCommand({
  name: 'push',
  description: 'Create podman secrets locally or on a remote host via SSH',
  options: {
    host: option(
      z.string().optional(),
      { description: 'Remote host (user@host) to create secrets on via SSH', short: 'H' },
    ),
    sops: option(
      z.boolean().default(false),
      { description: 'Decrypt secret files with sops before pushing' },
    ),
    replace: option(
      z.boolean().default(true),
      { description: 'Replace existing secrets (default: true)' },
    ),
  },
  handler: async ({ flags, positional }) => {
    const filePath = positional[0]
    if (!filePath) {
      console.error('Usage: panlet secrets push <compose-file> [--host user@host] [--sops]')
      process.exit(1)
    }

    const resolvedPath = path.resolve(filePath)
    const composeDir = path.dirname(resolvedPath)
    const text = await Bun.file(resolvedPath).text()
    const compose = parseCompose(text)
    const defs = extractSecretDefs(compose)

    if (defs.length === 0) {
      console.log('No secrets defined in compose file.')
      return
    }

    const target = flags.host ? `on ${flags.host}` : 'locally'
    console.log(`Creating ${defs.length} secret(s) ${target}:\n`)

    for (const def of defs) {
      if (def.external) {
        console.log(`  Skipping "${def.name}" (external)`)
        continue
      }

      const value = await readSecretValue(def, { sops: flags.sops, composeDir })
      if (value == null) continue

      await createSecret(def.name, value, { host: flags.host, replace: flags.replace })
    }

    console.log('\nDone.')
  },
})

const listCommand = defineCommand({
  name: 'list',
  description: 'List podman secrets locally or on a remote host',
  options: {
    host: option(
      z.string().optional(),
      { description: 'Remote host (user@host)', short: 'H' },
    ),
  },
  handler: async ({ flags }) => {
    const args = flags.host
      ? ['ssh', flags.host, 'podman', 'secret', 'ls']
      : ['podman', 'secret', 'ls']

    console.log(`$ ${args.join(' ')}`)
    const proc = Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' })
    process.exit(await proc.exited)
  },
})

const secretsGroup = defineGroup({
  name: 'secrets',
  description: 'Manage podman secrets',
  commands: [pushCommand, listCommand],
})

export default secretsGroup
