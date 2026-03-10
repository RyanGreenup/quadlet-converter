import { describe, expect, test } from 'bun:test'
import { composeServiceToQuadletIR, quadletIRToCompose, composeToQuadletFiles } from './converter'
import type { QuadletIR } from './quadlet'
import type { Service, ComposeFile } from './compose/index'

describe('composeServiceToQuadletIR', () => {
  test('converts the caddy example', () => {
    const service: Service = {
      image: 'caddy:2',
      restart: 'unless-stopped',
      network_mode: 'host',
      ports: ['0.0.0.0:80:80', '0.0.0.0:443:443'],
      volumes: [
        './Caddyfile:/etc/caddy/Caddyfile:Z',
        './caddy_data:/data:Z',
        './caddy_config:/config:Z',
      ],
    }

    const ir = composeServiceToQuadletIR('my-caddy', service)

    expect(ir).toEqual({
      Container: [
        { key: 'Image', value: 'caddy:2' },
        { key: 'Network', value: 'host' },
        { key: 'PublishPort', value: '0.0.0.0:80:80' },
        { key: 'PublishPort', value: '0.0.0.0:443:443' },
        { key: 'Volume', value: './Caddyfile:/etc/caddy/Caddyfile:Z' },
        { key: 'Volume', value: './caddy_data:/data:Z' },
        { key: 'Volume', value: './caddy_config:/config:Z' },
      ],
      Service: [
        { key: 'Restart', value: 'always' },
      ],
    })
  })

  test('converts deploy resource limits to CPUQuota and MemoryMax', () => {
    const service: Service = {
      image: 'caddy:2',
      deploy: {
        resources: {
          limits: { cpus: '1.0', memory: '512M' },
        },
      },
    }
    const ir = composeServiceToQuadletIR('svc', service)
    expect(ir.Service).toContainEqual({ key: 'CPUQuota', value: '100%' })
    expect(ir.Service).toContainEqual({ key: 'MemoryMax', value: '512M' })
  })

  test('converts environment variables', () => {
    const service: Service = {
      image: 'nginx',
      environment: { FOO: 'bar', BAZ: 'qux' },
    }
    const ir = composeServiceToQuadletIR('web', service)
    expect(ir.Container).toContainEqual({ key: 'Environment', value: 'FOO=bar' })
    expect(ir.Container).toContainEqual({ key: 'Environment', value: 'BAZ=qux' })
  })

  test('converts user', () => {
    const ir = composeServiceToQuadletIR('app', { image: 'nginx', user: '1000:1000' })
    expect(ir.Container).toContainEqual({ key: 'User', value: '1000:1000' })
  })

  test('handles service with no optional fields', () => {
    const ir = composeServiceToQuadletIR('empty', {})
    expect(ir).toEqual({})
  })
})

describe('quadletIRToCompose', () => {
  test('converts the caddy example', () => {
    const ir: QuadletIR = {
      Container: [
        { key: 'Image', value: 'caddy:2' },
        { key: 'Network', value: 'host' },
        { key: 'PublishPort', value: '0.0.0.0:80:80' },
        { key: 'PublishPort', value: '0.0.0.0:443:443' },
        { key: 'Volume', value: './Caddyfile:/etc/caddy/Caddyfile:Z' },
        { key: 'Volume', value: './caddy_data:/data:Z' },
        { key: 'Volume', value: './caddy_config:/config:Z' },
      ],
      Service: [
        { key: 'Restart', value: 'always' },
      ],
    }

    const compose = quadletIRToCompose(ir, 'my-caddy')

    expect(compose).toEqual({
      services: {
        'my-caddy': {
          image: 'caddy:2',
          network_mode: 'host',
          ports: ['0.0.0.0:80:80', '0.0.0.0:443:443'],
          volumes: [
            './Caddyfile:/etc/caddy/Caddyfile:Z',
            './caddy_data:/data:Z',
            './caddy_config:/config:Z',
          ],
          restart: 'unless-stopped',
        },
      },
    })
  })

  test('converts CPUQuota and MemoryMax to deploy resource limits', () => {
    const ir: QuadletIR = {
      Service: [
        { key: 'CPUQuota', value: '100%' },
        { key: 'MemoryMax', value: '512M' },
      ],
    }
    const compose = quadletIRToCompose(ir, 'svc')
    expect(compose.services!['svc'].deploy).toEqual({
      resources: {
        limits: { cpus: '1', memory: '512M' },
      },
    })
  })

  test('handles empty IR', () => {
    const compose = quadletIRToCompose({}, 'svc')
    expect(compose).toEqual({ services: { svc: {} } })
  })
})

describe('composeToQuadletFiles', () => {
  test('single service produces one .container file, no pod', () => {
    const compose: ComposeFile = {
      services: {
        'my-caddy': {
          image: 'caddy:2',
          ports: ['80:80'],
        },
      },
    }
    const files = composeToQuadletFiles(compose, 'example')
    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('my-caddy.container')
    expect(files[0].ir.Container).toContainEqual({ key: 'PublishPort', value: '80:80' })
  })

  test('multi-service compose produces pod + container files', () => {
    const compose: ComposeFile = {
      services: {
        web: {
          image: 'tuna/docker-counter23',
          ports: ['5000:5000'],
        },
        redis: {
          image: 'redis:3.0',
          ports: ['6379'],
        },
      },
    }
    const files = composeToQuadletFiles(compose, 'example')
    expect(files).toHaveLength(3)

    // Pod file
    const podFile = files[0]
    expect(podFile.filename).toBe('example.pod')
    expect(podFile.ir.Pod).toContainEqual({ key: 'PodName', value: 'example' })
    expect(podFile.ir.Pod).toContainEqual({ key: 'PublishPort', value: '5000:5000' })
    expect(podFile.ir.Pod).toContainEqual({ key: 'PublishPort', value: '6379' })

    // Web container
    const webFile = files[1]
    expect(webFile.filename).toBe('web.container')
    expect(webFile.ir.Container).toContainEqual({ key: 'Image', value: 'tuna/docker-counter23' })
    expect(webFile.ir.Container).toContainEqual({ key: 'Pod', value: 'example.pod' })
    // Ports should NOT be on the container
    const webPorts = (webFile.ir.Container ?? []).filter(e => e.key === 'PublishPort')
    expect(webPorts).toHaveLength(0)

    // Redis container
    const redisFile = files[2]
    expect(redisFile.filename).toBe('redis.container')
    expect(redisFile.ir.Container).toContainEqual({ key: 'Image', value: 'redis:3.0' })
    expect(redisFile.ir.Container).toContainEqual({ key: 'Pod', value: 'example.pod' })
    const redisPorts = (redisFile.ir.Container ?? []).filter(e => e.key === 'PublishPort')
    expect(redisPorts).toHaveLength(0)
  })

  test('empty services produces empty file set', () => {
    const files = composeToQuadletFiles({ services: {} }, 'test')
    expect(files).toHaveLength(0)
  })
})

describe('round-trip', () => {
  test('compose → quadletIR → compose preserves data', () => {
    const service: Service = {
      image: 'nginx:latest',
      ports: ['8080:80'],
      volumes: ['./data:/data:Z'],
      restart: 'on-failure',
    }

    const ir = composeServiceToQuadletIR('web', service)
    const compose = quadletIRToCompose(ir, 'web')

    expect(compose.services!['web']).toEqual(service)
  })
})
