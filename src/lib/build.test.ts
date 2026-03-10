import { describe, expect, test } from 'bun:test'
import { extractBuildDefs, generateBuildJustfile } from './build'
import type { ComposeFile } from './compose/index'

describe('extractBuildDefs', () => {
  test('extracts string build context', () => {
    const compose: ComposeFile = {
      services: {
        web: { build: './app' },
      },
    }
    expect(extractBuildDefs(compose)).toEqual([
      { name: 'web', image: 'localhost/web', context: './app' },
    ])
  })

  test('uses explicit image name over localhost prefix', () => {
    const compose: ComposeFile = {
      services: {
        web: { build: '.', image: 'myregistry/web:latest' },
      },
    }
    expect(extractBuildDefs(compose)).toEqual([
      { name: 'web', image: 'myregistry/web:latest', context: '.' },
    ])
  })

  test('extracts object build config with dockerfile and target', () => {
    const compose: ComposeFile = {
      services: {
        api: {
          build: {
            context: './api',
            dockerfile: 'Dockerfile.prod',
            target: 'runtime',
          },
        },
      },
    }
    expect(extractBuildDefs(compose)).toEqual([
      { name: 'api', image: 'localhost/api', context: './api', dockerfile: 'Dockerfile.prod', target: 'runtime' },
    ])
  })

  test('extracts build args from object form', () => {
    const compose: ComposeFile = {
      services: {
        app: {
          build: {
            context: '.',
            args: { NODE_ENV: 'production', VERSION: '1.0' },
          },
        },
      },
    }
    const defs = extractBuildDefs(compose)
    expect(defs[0].args).toEqual({ NODE_ENV: 'production', VERSION: '1.0' })
  })

  test('extracts build args from array form', () => {
    const compose: ComposeFile = {
      services: {
        app: {
          build: {
            context: '.',
            args: ['NODE_ENV=production', 'VERSION=1.0'],
          },
        },
      },
    }
    const defs = extractBuildDefs(compose)
    expect(defs[0].args).toEqual({ NODE_ENV: 'production', VERSION: '1.0' })
  })

  test('skips services without build', () => {
    const compose: ComposeFile = {
      services: {
        db: { image: 'postgres:16' },
        web: { build: '.' },
      },
    }
    const defs = extractBuildDefs(compose)
    expect(defs).toHaveLength(1)
    expect(defs[0].name).toBe('web')
  })

  test('defaults context to . when omitted in object form', () => {
    const compose: ComposeFile = {
      services: {
        app: { build: { dockerfile: 'Dockerfile.dev' } },
      },
    }
    expect(extractBuildDefs(compose)[0].context).toBe('.')
  })

  test('returns empty array when no services', () => {
    expect(extractBuildDefs({})).toEqual([])
  })
})

describe('generateBuildJustfile', () => {
  test('generates recipe for simple build', () => {
    const output = generateBuildJustfile([
      { name: 'web', image: 'localhost/web', context: '.' },
    ])
    expect(output).toContain('build-web:')
    expect(output).toContain('podman build -t localhost/web .')
  })

  test('generates recipe with dockerfile', () => {
    const output = generateBuildJustfile([
      { name: 'api', image: 'localhost/api', context: './api', dockerfile: 'Dockerfile.prod' },
    ])
    expect(output).toContain('podman build -f Dockerfile.prod -t localhost/api ./api')
  })

  test('generates recipe with target', () => {
    const output = generateBuildJustfile([
      { name: 'app', image: 'localhost/app', context: '.', target: 'runtime' },
    ])
    expect(output).toContain('podman build --target runtime -t localhost/app .')
  })

  test('generates recipe with build args', () => {
    const output = generateBuildJustfile([
      { name: 'app', image: 'localhost/app', context: '.', args: { NODE_ENV: 'production' } },
    ])
    expect(output).toContain('--build-arg NODE_ENV=production')
  })

  test('generates aggregate build recipe', () => {
    const output = generateBuildJustfile([
      { name: 'web', image: 'localhost/web', context: '.' },
      { name: 'worker', image: 'localhost/worker', context: './worker' },
    ])
    expect(output).toContain('build: build-web build-worker')
  })

  test('uses explicit image name in tag', () => {
    const output = generateBuildJustfile([
      { name: 'web', image: 'myregistry/web:latest', context: '.' },
    ])
    expect(output).toContain('-t myregistry/web:latest')
  })

  test('returns empty string for no defs', () => {
    expect(generateBuildJustfile([])).toBe('')
  })
})
