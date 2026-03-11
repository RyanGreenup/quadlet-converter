import { describe, expect, test } from 'bun:test'
import { generateGitHubWorkflow } from './github-actions'
import type { BuildDef } from './build'

describe('generateGitHubWorkflow', () => {
  test('returns empty string for no defs', () => {
    expect(generateGitHubWorkflow([])).toBe('')
  })

  test('generates workflow for single service with dockerfile and args', () => {
    const defs: BuildDef[] = [{
      name: 'api',
      image: 'ghcr.io/myorg/myapp-api:latest',
      context: './api',
      dockerfile: 'Containerfile',
      args: { NODE_VERSION: '22' },
    }]

    const yaml = generateGitHubWorkflow(defs)

    expect(yaml).toContain('name: Build container images')
    expect(yaml).toContain('build-api:')
    expect(yaml).toContain('name: Build api')
    expect(yaml).toContain('actions/checkout@v4')
    expect(yaml).toContain('docker/setup-buildx-action@v3')
    expect(yaml).toContain('docker/login-action@v3')
    expect(yaml).toContain('docker/metadata-action@v5')
    expect(yaml).toContain('docker/build-push-action@v6')
    // Image should have tag stripped for metadata-action
    expect(yaml).toContain('images: ghcr.io/myorg/myapp-api')
    expect(yaml).not.toContain('images: ghcr.io/myorg/myapp-api:latest')
    // Dockerfile and args
    expect(yaml).toContain('file: ./api/Containerfile')
    expect(yaml).toContain('NODE_VERSION=22')
    // GHA cache
    expect(yaml).toContain('cache-from: type=gha')
    expect(yaml).toContain('cache-to: type=gha,mode=max')
    // GHCR login
    expect(yaml).toContain('registry: ghcr.io')
    expect(yaml).toContain('${{ github.actor }}')
    expect(yaml).toContain('${{ secrets.GITHUB_TOKEN }}')
    // Push only on non-PR
    expect(yaml).toContain("push: ${{ github.event_name != 'pull_request' }}")
  })

  test('generates multiple jobs for multiple services', () => {
    const defs: BuildDef[] = [
      { name: 'api', image: 'ghcr.io/org/api', context: './api' },
      { name: 'worker', image: 'ghcr.io/org/worker', context: './worker' },
    ]

    const yaml = generateGitHubWorkflow(defs)

    expect(yaml).toContain('build-api:')
    expect(yaml).toContain('build-worker:')
    expect(yaml).toContain('images: ghcr.io/org/api')
    expect(yaml).toContain('images: ghcr.io/org/worker')
  })

  test('simple context without dockerfile omits file field', () => {
    const defs: BuildDef[] = [
      { name: 'app', image: 'ghcr.io/org/app', context: './app' },
    ]

    const yaml = generateGitHubWorkflow(defs)

    expect(yaml).toContain('context: ./app')
    expect(yaml).not.toContain('file:')
  })

  test('includes target when specified', () => {
    const defs: BuildDef[] = [
      { name: 'app', image: 'ghcr.io/org/app', context: '.', target: 'production' },
    ]

    const yaml = generateGitHubWorkflow(defs)
    expect(yaml).toContain('target: production')
  })

  test('uses custom registry with secret-based login', () => {
    const defs: BuildDef[] = [
      { name: 'app', image: 'registry.example.com/app', context: '.' },
    ]

    const yaml = generateGitHubWorkflow(defs, { registry: 'registry.example.com' })

    expect(yaml).toContain('registry: registry.example.com')
    expect(yaml).toContain('${{ secrets.REGISTRY_USERNAME }}')
    expect(yaml).toContain('${{ secrets.REGISTRY_PASSWORD }}')
    expect(yaml).not.toContain('github.actor')
  })
})
