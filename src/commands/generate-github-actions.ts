import { defineCommand, option } from '@bunli/core'
import { z } from 'zod'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { parseCompose } from '../lib/compose/index.js'
import { extractBuildDefs } from '../lib/build.js'
import { generateGitHubWorkflow } from '../lib/github-actions.js'

const generateGitHubActionsCommand = defineCommand({
  name: 'generate-github-actions',
  description: 'Generate GitHub Actions workflow for building container images',
  options: {
    output: option(
      z.string().optional(),
      { description: 'Output file path (default: .github/workflows/build-images.yml)', short: 'o' },
    ),
    registry: option(
      z.string().optional(),
      { description: 'Container registry (default: ghcr.io)', short: 'r' },
    ),
  },
  handler: async ({ flags, positional }) => {
    const filePath = positional[0]
    if (!filePath) {
      console.error('Usage: panlet generate-github-actions <compose-file>')
      process.exit(1)
    }

    const resolvedPath = path.resolve(filePath)
    const composeDir = path.dirname(resolvedPath)
    const text = await Bun.file(resolvedPath).text()
    const compose = parseCompose(text)

    const defs = extractBuildDefs(compose)
    if (defs.length === 0) {
      console.error('No services with build contexts found in compose file.')
      process.exit(1)
    }

    const workflow = generateGitHubWorkflow(defs, { registry: flags.registry })
    const outPath = flags.output ?? path.join(composeDir, '.github', 'workflows', 'build-images.yml')

    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, workflow)
    console.log(outPath)
  },
})

export default generateGitHubActionsCommand
