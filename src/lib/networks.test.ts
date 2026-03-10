import { describe, expect, test } from 'bun:test'
import { composeToQuadletFiles } from './converter'
import type { ComposeFile } from './compose/index'

describe('multi-network conversion', () => {
  test('multi-network produces no pod, prefixed containers, and network files', () => {
    const compose: ComposeFile = {
      services: {
        web: {
          image: 'nginx',
          ports: ['80:80'],
          networks: ['frontend', 'backend'],
        },
        api: {
          image: 'node',
          networks: ['backend'],
          depends_on: ['web'],
        },
      },
      networks: {
        frontend: { driver: 'bridge' },
        backend: { driver: 'bridge', internal: true },
      },
    }
    const files = composeToQuadletFiles(compose, 'myapp')
    const filenames = files.map(f => f.filename)

    // No pod file
    expect(filenames).not.toContain('myapp.pod')

    // Network files
    expect(filenames).toContain('frontend.network')
    expect(filenames).toContain('backend.network')

    // Prefixed container files
    expect(filenames).toContain('myapp-web.container')
    expect(filenames).toContain('myapp-api.container')

    // Backend network should have Internal=true
    const backendNet = files.find(f => f.filename === 'backend.network')!
    expect(backendNet.ir.Network).toContainEqual({ key: 'Internal', value: 'true' })

    // Web container keeps its ports
    const webFile = files.find(f => f.filename === 'myapp-web.container')!
    expect(webFile.ir.Container).toContainEqual({ key: 'PublishPort', value: '80:80' })

    // Web container has network references
    expect(webFile.ir.Container).toContainEqual({ key: 'Network', value: 'frontend.network' })
    expect(webFile.ir.Container).toContainEqual({ key: 'Network', value: 'backend.network' })

    // No Pod= on containers
    const webPod = (webFile.ir.Container ?? []).filter(e => e.key === 'Pod')
    expect(webPod).toHaveLength(0)

    // Api container depends_on uses prefixed service name
    const apiFile = files.find(f => f.filename === 'myapp-api.container')!
    expect(apiFile.ir.Unit).toContainEqual({ key: 'After', value: 'myapp-web.service' })
    expect(apiFile.ir.Unit).toContainEqual({ key: 'Requires', value: 'myapp-web.service' })
  })

  test('single network across services still uses pod', () => {
    const compose: ComposeFile = {
      services: {
        web: { image: 'nginx', networks: ['shared'], ports: ['80:80'] },
        api: { image: 'node', networks: ['shared'] },
      },
    }
    const files = composeToQuadletFiles(compose, 'myapp')
    const filenames = files.map(f => f.filename)
    expect(filenames).toContain('myapp.pod')
    expect(filenames).not.toContain('myapp-web.container')
  })

  test('no networks across services still uses pod', () => {
    const compose: ComposeFile = {
      services: {
        web: { image: 'nginx', ports: ['80:80'] },
        api: { image: 'node' },
      },
    }
    const files = composeToQuadletFiles(compose, 'myapp')
    const filenames = files.map(f => f.filename)
    expect(filenames).toContain('myapp.pod')
  })

  test('external networks do not produce .network files', () => {
    const compose: ComposeFile = {
      services: {
        web: { image: 'nginx', networks: ['ext', 'internal'] },
        api: { image: 'node', networks: ['internal'] },
      },
      networks: {
        ext: { external: true },
        internal: { driver: 'bridge' },
      },
    }
    const files = composeToQuadletFiles(compose, 'myapp')
    const filenames = files.map(f => f.filename)
    expect(filenames).not.toContain('ext.network')
    expect(filenames).toContain('internal.network')
  })

  test('multi-network adds Notify=healthy to dependency containers', () => {
    const compose: ComposeFile = {
      services: {
        app: {
          image: 'nginx',
          networks: ['frontend', 'backend'],
          depends_on: { db: { condition: 'service_healthy' } },
        },
        db: {
          image: 'postgres',
          networks: ['backend'],
          healthcheck: { test: ['CMD', 'pg_isready'] },
        },
      },
    }
    const files = composeToQuadletFiles(compose, 'myapp')
    const dbFile = files.find(f => f.filename === 'myapp-db.container')!
    expect(dbFile.ir.Container).toContainEqual({ key: 'Notify', value: 'healthy' })
  })

  test('multi-network network files include IPAM subnet', () => {
    const compose: ComposeFile = {
      services: {
        web: { image: 'nginx', networks: ['mynet', 'other'] },
        api: { image: 'node', networks: ['other'] },
      },
      networks: {
        mynet: {
          driver: 'bridge',
          ipam: { config: [{ subnet: '172.20.0.0/24', gateway: '172.20.0.1' }] },
        },
        other: null,
      },
    }
    const files = composeToQuadletFiles(compose, 'test')
    const netFile = files.find(f => f.filename === 'mynet.network')!
    expect(netFile.ir.Network).toContainEqual({ key: 'Subnet', value: '172.20.0.0/24' })
    expect(netFile.ir.Network).toContainEqual({ key: 'Gateway', value: '172.20.0.1' })
  })
})
