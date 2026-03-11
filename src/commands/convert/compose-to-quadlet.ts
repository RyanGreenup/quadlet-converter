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
        description: 'Output directory (default: deploy/ next to compose file)',
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
    'no-auto-update': option(
      z.boolean().default(false),
      {
        description: 'Disable AutoUpdate=registry on generated containers',
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

    // Keep relative volume paths as-is — Quadlet resolves ./ paths
    // relative to the unit file location (see podman-systemd.unit(5)).

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
      autoUpdate: !flags['no-auto-update'],
    })
    const secretDefs = extractSecretDefs(compose)
    const buildDefs = flags.build ? extractBuildDefs(compose) : []

    const outputBase = flags.output ?? path.join(composeDir, 'deploy')
    const outDir = path.join(outputBase, podName)
    await mkdir(outDir, { recursive: true })
    console.log(outDir)

    for (const { filename, ir } of files) {
      const outPath = path.join(outDir, filename)
      await writeFile(outPath, serializeQuadlet(irToQuadletData(ir)))
      console.log(outPath)
    }

    if (secretDefs.length > 0) {
      const outPath = path.join(outDir, 'secrets.just')
      await writeFile(outPath, generateSecretsJustfile(secretDefs, { sops: flags.sops }))
      console.log(outPath)
    }

    if (buildDefs.length > 0) {
      const outPath = path.join(outDir, 'build.just')
      await writeFile(outPath, generateBuildJustfile(buildDefs))
      console.log(outPath)
    }
  }
})

export default composeToQuadletCommand
