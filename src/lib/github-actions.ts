import type { BuildDef } from './build.js'

/** Strip the tag from an image reference (e.g. ghcr.io/org/app:latest → ghcr.io/org/app). */
function stripTag(image: string): string {
  // Don't strip if it looks like a port number (e.g. registry:5000/image)
  const lastColon = image.lastIndexOf(':')
  if (lastColon === -1) return image
  const afterColon = image.slice(lastColon + 1)
  if (afterColon.includes('/')) return image // it's a port, not a tag
  return image.slice(0, lastColon)
}

export interface GitHubActionsOpts {
  registry?: string
}

/** Generate a GitHub Actions workflow YAML string for building container images. */
export function generateGitHubWorkflow(defs: BuildDef[], opts?: GitHubActionsOpts): string {
  if (defs.length === 0) return ''

  const registry = opts?.registry ?? 'ghcr.io'
  const jobs = defs.map(def => generateJob(def, registry))

  return `name: Build container images

on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]

jobs:
${jobs.join('\n\n')}
`
}

function generateJob(def: BuildDef, registry: string): string {
  const isGHCR = registry === 'ghcr.io'

  const loginStep = isGHCR
    ? `      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}`
    : `      - name: Log in to registry
        uses: docker/login-action@v3
        with:
          registry: ${registry}
          username: \${{ secrets.REGISTRY_USERNAME }}
          password: \${{ secrets.REGISTRY_PASSWORD }}`

  const buildWithParts: string[] = []
  buildWithParts.push(`          context: ${def.context}`)
  if (def.dockerfile) {
    buildWithParts.push(`          file: ${def.context}/${def.dockerfile}`)
  }
  if (def.target) {
    buildWithParts.push(`          target: ${def.target}`)
  }
  buildWithParts.push(`          push: \${{ github.event_name != 'pull_request' }}`)
  buildWithParts.push(`          tags: \${{ steps.meta.outputs.tags }}`)
  buildWithParts.push(`          labels: \${{ steps.meta.outputs.labels }}`)
  buildWithParts.push(`          cache-from: type=gha`)
  buildWithParts.push(`          cache-to: type=gha,mode=max`)

  if (def.args && Object.keys(def.args).length > 0) {
    const argLines = Object.entries(def.args)
      .map(([k, v]) => `            ${k}=${v}`)
      .join('\n')
    buildWithParts.push(`          build-args: |\n${argLines}`)
  }

  const tagsBlock = `          tags: |
            type=sha
            type=ref,event=branch
            type=ref,event=tag
            type=raw,value=latest,enable={{is_default_branch}}`

  return `  build-${def.name}:
    name: Build ${def.name}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

${loginStep}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${stripTag(def.image)}
${tagsBlock}

      - name: Build and push ${def.name}
        uses: docker/build-push-action@v6
        with:
${buildWithParts.join('\n')}`
}
