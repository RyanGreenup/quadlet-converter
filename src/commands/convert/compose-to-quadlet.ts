import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import { parseCompose } from '../../lib/compose/index.js'
import { composeToQuadletFiles, detectUnresolvedVariables } from '../../lib/converter.js'
import { serializeQuadlet, irToQuadletData } from '../../lib/quadlet.js'
import { extractBuildDefs, generateBuildJustfile } from '../../lib/build.js'
import { extractSecretDefs, generateSecretsJustfile } from '../../lib/secrets.js'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const composeToQuadletCommand = defineCommand({
  name: 'compose-to-quadlet',
  description: 'Convert a Docker Compose file to Quadlet unit file(s)',
  options: {
    output: option(
      z.string().optional(),
      {
        description: 'Output directory (writes individual files instead of stdout)',
        short: 'o',
      }
    ),
    sops: option(
      z.boolean().default(false),
      {
        description: 'Use sops to decrypt file-based secrets in justfile recipes',
      }
    ),
    build: option(
      z.boolean().default(false),
      {
        description: 'Generate build recipes for services with build contexts',
      }
    ),
    'start-port': option(
      z.coerce.number().optional(),
      {
        description: 'Starting host port for scaled instances',
      }
    ),
    'no-pod': option(
      z.boolean().default(false),
      {
        description: 'Generate standalone containers instead of pods for scaled services',
      }
    ),
  },
  handler: async ({ flags, positional }) => {
    const filePath = positional[0]
    if (!filePath) {
      console.error('Error: please provide a compose file path')
      process.exit(1)
    }

    const resolvedPath = path.resolve(filePath)
    const composeDir = path.dirname(resolvedPath)
    const file = Bun.file(resolvedPath)
    const text = await file.text()
    const compose = parseCompose(text)

    // Resolve relative volume paths against the compose file's directory
    if (compose.services) {
      for (const service of Object.values(compose.services)) {
        if (!service.volumes) continue
        service.volumes = service.volumes.map(vol => {
          if (typeof vol === 'string') {
            const sep = vol.indexOf(':')
            if (sep === -1) return vol
            const source = vol.slice(0, sep)
            const rest = vol.slice(sep)
            if (source.startsWith('./') || source.startsWith('../')) {
              return path.resolve(composeDir, source) + rest
            }
            return vol
          }
          if (vol.source && (vol.source.startsWith('./') || vol.source.startsWith('../'))) {
            return { ...vol, source: path.resolve(composeDir, vol.source) }
          }
          return vol
        })
      }
    }

    if (!compose.services || Object.keys(compose.services).length === 0) {
      console.error('Error: no services found in compose file')
      process.exit(1)
    }

    const unresolvedVars = detectUnresolvedVariables(compose)
    if (unresolvedVars.length > 0) {
      console.warn('Warning: compose file contains unresolved variable references.')
      console.warn('  Compose variable interpolation (${VAR}) is not performed by this tool.')
      console.warn('  The following values will be emitted as literal strings:\n')
      for (const { service, field, value } of unresolvedVars) {
        console.warn(`    ${service}.${field}: ${value}`)
      }
      console.warn()
    }

    // Derive project name: top-level name > directory name > filename
    const basename = path.basename(resolvedPath, path.extname(resolvedPath))
    const podName = compose.name
      ?? (basename === 'docker-compose' || basename === 'compose'
        ? path.basename(path.dirname(resolvedPath))
        : basename)

    const files = composeToQuadletFiles(compose, podName, {
      build: flags.build,
      startPort: flags['start-port'],
      usePod: !flags['no-pod'],
    })
    const secretDefs = extractSecretDefs(compose)
    const buildDefs = flags.build ? extractBuildDefs(compose) : []

    if (flags.output) {
      await mkdir(flags.output, { recursive: true })

      for (const { filename, ir } of files) {
        const outPath = path.join(flags.output, filename)
        await writeFile(outPath, serializeQuadlet(irToQuadletData(ir)))
        console.log(outPath)
      }

      if (secretDefs.length > 0) {
        const outPath = path.join(flags.output, 'secrets.just')
        await writeFile(outPath, generateSecretsJustfile(secretDefs, { sops: flags.sops }))
        console.log(outPath)
      }

      if (buildDefs.length > 0) {
        const outPath = path.join(flags.output, 'build.just')
        await writeFile(outPath, generateBuildJustfile(buildDefs))
        console.log(outPath)
      }
    } else {
      for (let i = 0; i < files.length; i++) {
        const { filename, ir } = files[i]
        if (i > 0) console.log()
        console.log(`### ${filename} ###`)
        process.stdout.write(serializeQuadlet(irToQuadletData(ir)))
      }

      if (secretDefs.length > 0) {
        console.log()
        console.log(`### secrets.just ###`)
        process.stdout.write(generateSecretsJustfile(secretDefs, { sops: flags.sops }))
      }

      if (buildDefs.length > 0) {
        console.log()
        console.log(`### build.just ###`)
        process.stdout.write(generateBuildJustfile(buildDefs))
      }
    }
  }
})

export default composeToQuadletCommand
