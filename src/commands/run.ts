import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import { parseQuadlet, toQuadletIR } from '../lib/quadlet.js'
import { quadletIRToCompose } from '../lib/converter.js'

const runCommand = defineCommand({
  name: 'run',
  description: 'Run a .container quadlet file via podman-compose',
  options: {
    service: option(
      z.string().optional(),
      {
        description: 'Service name to use (default: derived from filename)',
        short: 's'
      }
    ),
    detach: option(
      z.boolean().default(false),
      {
        description: 'Run in detached mode',
        short: 'd'
      }
    ),
  },
  handler: async ({ flags, positional }) => {
    const filePath = positional[0]
    if (!filePath) {
      console.error('Error: please provide a .container file path')
      process.exit(1)
    }

    const file = Bun.file(filePath)
    const text = await file.text()
    const data = parseQuadlet(text)
    const ir = toQuadletIR(data)

    const defaultName = filePath.replace(/.*\//, '').replace(/\.container$/, '')
    const serviceName = flags.service ?? defaultName

    const compose = quadletIRToCompose(ir, serviceName)
    const yaml = Bun.YAML.stringify(compose)

    const tmpDir = await import('node:os').then(os => os.tmpdir())
    const tmpFile = `${tmpDir}/quadlet-serde-${serviceName}-${process.pid}.yaml`
    await Bun.write(tmpFile, yaml)

    try {
      const args = ['up']
      if (flags.detach) args.push('-d')

      const proc = Bun.spawn(['podman-compose', '-f', tmpFile, ...args], {
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: 'inherit',
      })
      const exitCode = await proc.exited
      process.exit(exitCode)
    } finally {
      await import('node:fs/promises').then(fs => fs.unlink(tmpFile).catch(() => {}))
    }
  }
})

export default runCommand
