import { describe, expect, test } from 'bun:test'
import { parseCompose } from './compose/index'
import { composeToQuadletFiles } from './converter'
import { extractSecretDefs, generateSecretsJustfile } from './secrets'

describe('fixtures/secrets-compose.yml', () => {
  const loadFixture = async () => {
    const text = await Bun.file('data/fixtures/secrets-compose.yml').text()
    return parseCompose(text)
  }

  test('parses top-level secrets', async () => {
    const compose = await loadFixture()
    expect(compose.secrets).toBeDefined()
    expect(Object.keys(compose.secrets!)).toEqual([
      'db_password', 'api_key', 'tls_cert', 'db_init_sql', 'session_key',
    ])
    expect(compose.secrets!.db_password.file).toBe('./secrets/db_password.txt')
    expect(compose.secrets!.api_key.environment).toBe('API_KEY')
    expect(compose.secrets!.session_key.external).toBe(true)
  })

  test('parses service-level secrets (short and long syntax)', async () => {
    const compose = await loadFixture()
    const webSecrets = compose.services!.web.secrets!
    expect(webSecrets).toHaveLength(3)
    expect(webSecrets[0]).toBe('db_password')
    expect(webSecrets[1]).toBe('api_key')
    expect(webSecrets[2]).toEqual({
      source: 'tls_cert',
      target: '/run/secrets/server.crt',
      uid: '1000',
      gid: '1000',
      mode: '0440',
    })
  })

  test('converts to quadlet files with Secret= entries', async () => {
    const compose = await loadFixture()
    const files = composeToQuadletFiles(compose, 'myapp')

    // Multi-service: pod + 2 containers
    expect(files).toHaveLength(3)
    expect(files[0].filename).toBe('myapp.pod')

    // Web container secrets
    const webFile = files.find(f => f.filename === 'web.container')!
    const webSecrets = webFile.ir.Container!.filter(e => e.key === 'Secret')
    expect(webSecrets).toEqual([
      { key: 'Secret', value: 'db_password' },
      { key: 'Secret', value: 'api_key' },
      { key: 'Secret', value: 'tls_cert,target=/run/secrets/server.crt,uid=1000,gid=1000,mode=0440' },
    ])

    // DB container secrets
    const dbFile = files.find(f => f.filename === 'db.container')!
    const dbSecrets = dbFile.ir.Container!.filter(e => e.key === 'Secret')
    expect(dbSecrets).toEqual([
      { key: 'Secret', value: 'db_password' },
      { key: 'Secret', value: 'db_init_sql,target=/docker-entrypoint-initdb.d/init.sql' },
    ])
  })

  test('extracts secret defs and generates justfile', async () => {
    const compose = await loadFixture()
    const defs = extractSecretDefs(compose)

    expect(defs).toEqual([
      { name: 'db_password', file: './secrets/db_password.txt' },
      { name: 'api_key', environment: 'API_KEY' },
      { name: 'tls_cert', file: './secrets/server.crt' },
      { name: 'db_init_sql', file: './secrets/init.sql' },
      { name: 'session_key', external: true },
    ])

    const justfile = generateSecretsJustfile(defs)

    // File-based
    expect(justfile).toContain('podman secret create db_password ./secrets/db_password.txt')
    expect(justfile).toContain('podman secret create tls_cert ./secrets/server.crt')
    expect(justfile).toContain('podman secret create db_init_sql ./secrets/init.sql')

    // Env-based
    expect(justfile).toContain('printenv API_KEY | podman secret create api_key -')

    // External
    expect(justfile).toContain("Secret 'session_key' is external")

    // Aggregate recipes
    expect(justfile).toContain('create-secrets:')
    expect(justfile).toContain('delete-secrets:')
    expect(justfile).toContain('list-secrets:')

    // Delete recipes
    expect(justfile).toContain('podman secret rm db_password')
    expect(justfile).toContain('podman secret rm api_key')
    expect(justfile).toContain('podman secret rm session_key')
  })
})
