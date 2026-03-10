import { describe, expect, test } from 'bun:test'
import { composeServiceToQuadletIR, quadletIRToCompose } from './converter'
import type { QuadletIR } from './quadlet'
import type { Service } from './compose/index'

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

  test('converts environment variables', () => {
    const service: Service = {
      image: 'nginx',
      environment: { FOO: 'bar', BAZ: 'qux' },
    }
    const ir = composeServiceToQuadletIR('web', service)
    expect(ir.Container).toContainEqual({ key: 'Environment', value: 'FOO=bar' })
    expect(ir.Container).toContainEqual({ key: 'Environment', value: 'BAZ=qux' })
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

  test('handles empty IR', () => {
    const compose = quadletIRToCompose({}, 'svc')
    expect(compose).toEqual({ services: { svc: {} } })
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
