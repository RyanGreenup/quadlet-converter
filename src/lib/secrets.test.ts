import { describe, expect, test } from 'bun:test'
import { extractSecretDefs, generateSecretsJustfile } from './secrets'
import type { ComposeFile } from './compose/index'

describe('extractSecretDefs', () => {
  test('extracts file-based secrets', () => {
    const compose: ComposeFile = {
      secrets: {
        db_pass: { file: './db_pass.txt' },
      },
    }
    expect(extractSecretDefs(compose)).toEqual([
      { name: 'db_pass', file: './db_pass.txt' },
    ])
  })

  test('extracts environment-based secrets', () => {
    const compose: ComposeFile = {
      secrets: {
        api_key: { environment: 'API_KEY' },
      },
    }
    expect(extractSecretDefs(compose)).toEqual([
      { name: 'api_key', environment: 'API_KEY' },
    ])
  })

  test('extracts external secrets', () => {
    const compose: ComposeFile = {
      secrets: {
        session: { external: true },
      },
    }
    expect(extractSecretDefs(compose)).toEqual([
      { name: 'session', external: true },
    ])
  })

  test('handles mixed secret types', () => {
    const compose: ComposeFile = {
      secrets: {
        db_pass: { file: './db_pass.txt' },
        api_key: { environment: 'API_KEY' },
        session: { external: true },
      },
    }
    const defs = extractSecretDefs(compose)
    expect(defs).toHaveLength(3)
    expect(defs[0]).toEqual({ name: 'db_pass', file: './db_pass.txt' })
    expect(defs[1]).toEqual({ name: 'api_key', environment: 'API_KEY' })
    expect(defs[2]).toEqual({ name: 'session', external: true })
  })

  test('returns empty array when no secrets', () => {
    expect(extractSecretDefs({})).toEqual([])
  })
})

describe('generateSecretsJustfile', () => {
  test('generates recipe for file-based secret', () => {
    const output = generateSecretsJustfile([{ name: 'db_pass', file: './db_pass.txt' }])
    expect(output).toContain('create-secret-db_pass:')
    expect(output).toContain('podman secret create db_pass ./db_pass.txt')
    expect(output).toContain('delete-secret-db_pass:')
    expect(output).toContain('podman secret rm db_pass')
  })

  test('generates recipe for env-based secret', () => {
    const output = generateSecretsJustfile([{ name: 'api_key', environment: 'API_KEY' }])
    expect(output).toContain('create-secret-api_key:')
    expect(output).toContain('printenv API_KEY | podman secret create api_key -')
  })

  test('generates comment-only recipe for external secret', () => {
    const output = generateSecretsJustfile([{ name: 'session', external: true }])
    expect(output).toContain('External secret')
    expect(output).toContain('create-secret-session:')
    expect(output).toContain('skipping creation')
  })

  test('generates aggregate create-secrets and delete-secrets recipes', () => {
    const output = generateSecretsJustfile([
      { name: 'db_pass', file: './db_pass.txt' },
      { name: 'api_key', environment: 'API_KEY' },
    ])
    expect(output).toContain('create-secrets: create-secret-db_pass create-secret-api_key')
    expect(output).toContain('delete-secrets: delete-secret-db_pass delete-secret-api_key')
  })

  test('generates list-secrets recipe', () => {
    const output = generateSecretsJustfile([{ name: 'x', file: 'x.txt' }])
    expect(output).toContain('list-secrets:')
    expect(output).toContain('podman secret ls')
  })

  test('returns empty string for no secrets', () => {
    expect(generateSecretsJustfile([])).toBe('')
  })
})
