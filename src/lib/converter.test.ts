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

  test('converts cap_add and cap_drop', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      cap_add: ['NET_ADMIN', 'SYS_TIME'],
      cap_drop: ['ALL'],
    })
    expect(ir.Container).toContainEqual({ key: 'AddCapability', value: 'NET_ADMIN' })
    expect(ir.Container).toContainEqual({ key: 'AddCapability', value: 'SYS_TIME' })
    expect(ir.Container).toContainEqual({ key: 'DropCapability', value: 'ALL' })
  })

  test('converts working_dir', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      working_dir: '/app/src',
    })
    expect(ir.Container).toContainEqual({ key: 'WorkingDir', value: '/app/src' })
  })

  test('converts entrypoint (string)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      entrypoint: '/docker-entrypoint.sh',
    })
    expect(ir.Container).toContainEqual({ key: 'Entrypoint', value: '/docker-entrypoint.sh' })
  })

  test('converts entrypoint (array)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      entrypoint: ['/bin/sh', '-c', 'echo hello'],
    })
    expect(ir.Container).toContainEqual({ key: 'Entrypoint', value: '/bin/sh -c echo hello' })
  })

  test('converts labels (object)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      labels: { 'com.example.env': 'prod', 'com.example.version': '1.0' },
    })
    expect(ir.Container).toContainEqual({ key: 'Label', value: 'com.example.env=prod' })
    expect(ir.Container).toContainEqual({ key: 'Label', value: 'com.example.version=1.0' })
  })

  test('converts labels (array)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      labels: ['com.example.env=prod'],
    })
    expect(ir.Container).toContainEqual({ key: 'Label', value: 'com.example.env=prod' })
  })

  test('converts dns_search (string)', () => {
    const ir = composeServiceToQuadletIR('app', { image: 'nginx', dns_search: 'example.com' })
    expect(ir.Container).toContainEqual({ key: 'DNSSearch', value: 'example.com' })
  })

  test('converts dns_search (list)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      dns_search: ['example.com', 'test.local'],
    })
    expect(ir.Container).toContainEqual({ key: 'DNSSearch', value: 'example.com' })
    expect(ir.Container).toContainEqual({ key: 'DNSSearch', value: 'test.local' })
  })

  test('converts expose', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      expose: ['3000', 4000],
    })
    expect(ir.Container).toContainEqual({ key: 'ExposeHostPort', value: '3000' })
    expect(ir.Container).toContainEqual({ key: 'ExposeHostPort', value: '4000' })
  })

  test('converts extra_hosts (array)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      extra_hosts: ['myhost:192.168.1.1', 'other:10.0.0.1'],
    })
    expect(ir.Container).toContainEqual({ key: 'AddHost', value: 'myhost:192.168.1.1' })
    expect(ir.Container).toContainEqual({ key: 'AddHost', value: 'other:10.0.0.1' })
  })

  test('converts extra_hosts (object)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      extra_hosts: { myhost: '192.168.1.1', multi: ['10.0.0.1', '10.0.0.2'] },
    })
    expect(ir.Container).toContainEqual({ key: 'AddHost', value: 'myhost:192.168.1.1' })
    expect(ir.Container).toContainEqual({ key: 'AddHost', value: 'multi:10.0.0.1' })
    expect(ir.Container).toContainEqual({ key: 'AddHost', value: 'multi:10.0.0.2' })
  })

  test('converts env_file (string)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      env_file: '.env',
    })
    expect(ir.Container).toContainEqual({ key: 'EnvironmentFile', value: '.env' })
  })

  test('converts env_file (array with objects)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      env_file: ['.env', { path: '.env.local', required: false }],
    })
    expect(ir.Container).toContainEqual({ key: 'EnvironmentFile', value: '.env' })
    expect(ir.Container).toContainEqual({ key: 'EnvironmentFile', value: '.env.local' })
  })

  test('converts read_only', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      read_only: true,
    })
    expect(ir.Container).toContainEqual({ key: 'ReadOnly', value: 'true' })
  })

  test('does not emit ReadOnly when false', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      read_only: false,
    })
    const readOnly = (ir.Container ?? []).filter(e => e.key === 'ReadOnly')
    expect(readOnly).toHaveLength(0)
  })

  test('converts dns (string)', () => {
    const ir = composeServiceToQuadletIR('app', { image: 'nginx', dns: '8.8.8.8' })
    expect(ir.Container).toContainEqual({ key: 'DNS', value: '8.8.8.8' })
  })

  test('converts dns (list)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      dns: ['8.8.8.8', '1.1.1.1'],
    })
    expect(ir.Container).toContainEqual({ key: 'DNS', value: '8.8.8.8' })
    expect(ir.Container).toContainEqual({ key: 'DNS', value: '1.1.1.1' })
  })

  test('converts hostname', () => {
    const ir = composeServiceToQuadletIR('app', { image: 'nginx', hostname: 'myhost' })
    expect(ir.Container).toContainEqual({ key: 'HostName', value: 'myhost' })
  })

  test('converts user', () => {
    const ir = composeServiceToQuadletIR('app', { image: 'nginx', user: '1000:1000' })
    expect(ir.Container).toContainEqual({ key: 'User', value: '1000:1000' })
  })

  test('converts networks (list form)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      networks: ['frontend', 'backend'],
    })
    expect(ir.Container).toContainEqual({ key: 'Network', value: 'frontend' })
    expect(ir.Container).toContainEqual({ key: 'Network', value: 'backend' })
  })

  test('converts networks (map form)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      networks: {
        frontend: { aliases: ['web'] },
        backend: null,
      },
    })
    expect(ir.Container).toContainEqual({ key: 'Network', value: 'frontend' })
    expect(ir.Container).toContainEqual({ key: 'Network', value: 'backend' })
  })

  test('network_mode and networks are independent', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      network_mode: 'host',
      networks: ['custom'],
    })
    const networkEntries = ir.Container!.filter(e => e.key === 'Network')
    expect(networkEntries).toContainEqual({ key: 'Network', value: 'host' })
    expect(networkEntries).toContainEqual({ key: 'Network', value: 'custom' })
  })

  test('converts tmpfs (string)', () => {
    const ir = composeServiceToQuadletIR('app', { image: 'nginx', tmpfs: '/run' })
    expect(ir.Container).toContainEqual({ key: 'Tmpfs', value: '/run' })
  })

  test('converts tmpfs (array)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      tmpfs: ['/run', '/tmp'],
    })
    expect(ir.Container).toContainEqual({ key: 'Tmpfs', value: '/run' })
    expect(ir.Container).toContainEqual({ key: 'Tmpfs', value: '/tmp' })
  })

  test('converts shm_size', () => {
    const ir = composeServiceToQuadletIR('app', { image: 'nginx', shm_size: '256m' })
    expect(ir.Container).toContainEqual({ key: 'ShmSize', value: '256m' })
  })

  test('converts sysctls (object)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      sysctls: { 'net.core.somaxconn': 1024, 'net.ipv4.tcp_syncookies': 0 },
    })
    expect(ir.Container).toContainEqual({ key: 'Sysctl', value: 'net.core.somaxconn=1024' })
    expect(ir.Container).toContainEqual({ key: 'Sysctl', value: 'net.ipv4.tcp_syncookies=0' })
  })

  test('converts sysctls (array)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      sysctls: ['net.core.somaxconn=1024'],
    })
    expect(ir.Container).toContainEqual({ key: 'Sysctl', value: 'net.core.somaxconn=1024' })
  })

  test('converts stop_signal', () => {
    const ir = composeServiceToQuadletIR('app', { image: 'nginx', stop_signal: 'SIGTERM' })
    expect(ir.Container).toContainEqual({ key: 'StopSignal', value: 'SIGTERM' })
  })

  test('converts stop_grace_period to StopTimeout in seconds', () => {
    const ir = composeServiceToQuadletIR('app', { image: 'nginx', stop_grace_period: '1m30s' })
    expect(ir.Container).toContainEqual({ key: 'StopTimeout', value: '90' })
  })

  test('converts logging driver', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      logging: { driver: 'journald' },
    })
    expect(ir.Container).toContainEqual({ key: 'LogDriver', value: 'journald' })
  })

  test('converts group_add', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      group_add: ['audio', 999],
    })
    expect(ir.Container).toContainEqual({ key: 'GroupAdd', value: 'audio' })
    expect(ir.Container).toContainEqual({ key: 'GroupAdd', value: '999' })
  })

  test('converts userns_mode', () => {
    const ir = composeServiceToQuadletIR('app', { image: 'nginx', userns_mode: 'keep-id' })
    expect(ir.Container).toContainEqual({ key: 'UserNS', value: 'keep-id' })
  })

  test('converts annotations (object)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      annotations: { 'com.example.env': 'prod', 'com.example.version': '1.0' },
    })
    expect(ir.Container).toContainEqual({ key: 'Annotation', value: 'com.example.env=prod' })
    expect(ir.Container).toContainEqual({ key: 'Annotation', value: 'com.example.version=1.0' })
  })

  test('converts annotations (array)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      annotations: ['com.example.env=prod'],
    })
    expect(ir.Container).toContainEqual({ key: 'Annotation', value: 'com.example.env=prod' })
  })

  test('converts raw devices to AddDevice', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      devices: ['/dev/kvm', '/dev/dri:/dev/dri'],
    })
    expect(ir.Container).toContainEqual({ key: 'AddDevice', value: '/dev/kvm' })
    expect(ir.Container).toContainEqual({ key: 'AddDevice', value: '/dev/dri:/dev/dri' })
  })

  test('converts deploy.resources.reservations.devices (nvidia GPU) to AddDevice CDI', () => {
    const ir = composeServiceToQuadletIR('gpu', {
      image: 'nvidia/cuda',
      deploy: {
        resources: {
          reservations: {
            devices: [{
              driver: 'nvidia',
              count: 'all',
              capabilities: ['gpu'],
            }],
          },
        },
      },
    })
    expect(ir.Container).toContainEqual({ key: 'AddDevice', value: 'nvidia.com/gpu=all' })
  })

  test('converts gpus: all to AddDevice CDI', () => {
    const ir = composeServiceToQuadletIR('gpu', {
      image: 'nvidia/cuda',
      gpus: 'all',
    })
    expect(ir.Container).toContainEqual({ key: 'AddDevice', value: 'nvidia.com/gpu=all' })
  })

  test('converts gpus array with device_ids to AddDevice CDI', () => {
    const ir = composeServiceToQuadletIR('gpu', {
      image: 'nvidia/cuda',
      gpus: [{
        capabilities: ['gpu'],
        device_ids: ['0', '1'],
        driver: 'nvidia',
      }],
    })
    expect(ir.Container).toContainEqual({ key: 'AddDevice', value: 'nvidia.com/gpu=0' })
    expect(ir.Container).toContainEqual({ key: 'AddDevice', value: 'nvidia.com/gpu=1' })
  })

  test('defaults GPU driver to nvidia when not specified', () => {
    const ir = composeServiceToQuadletIR('gpu', {
      image: 'nvidia/cuda',
      deploy: {
        resources: {
          reservations: {
            devices: [{
              count: 'all',
              capabilities: ['gpu'],
            }],
          },
        },
      },
    })
    expect(ir.Container).toContainEqual({ key: 'AddDevice', value: 'nvidia.com/gpu=all' })
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

  test('maps Network=host to network_mode, named networks to networks', () => {
    const ir: QuadletIR = {
      Container: [
        { key: 'Network', value: 'host' },
      ],
    }
    const compose = quadletIRToCompose(ir, 'svc')
    expect(compose.services!['svc'].network_mode).toBe('host')
    expect(compose.services!['svc'].networks).toBeUndefined()

    const ir2: QuadletIR = {
      Container: [
        { key: 'Network', value: 'frontend' },
        { key: 'Network', value: 'backend' },
      ],
    }
    const compose2 = quadletIRToCompose(ir2, 'svc')
    expect(compose2.services!['svc'].network_mode).toBeUndefined()
    expect(compose2.services!['svc'].networks).toEqual(['frontend', 'backend'])
  })

  test('converts AddDevice /dev/ path to devices', () => {
    const ir: QuadletIR = {
      Container: [
        { key: 'AddDevice', value: '/dev/dri' },
        { key: 'AddDevice', value: '/dev/kvm' },
      ],
    }
    const compose = quadletIRToCompose(ir, 'svc')
    expect(compose.services!['svc'].devices).toEqual(['/dev/dri', '/dev/kvm'])
  })

  test('converts AddDevice CDI format to deploy.resources.reservations.devices', () => {
    const ir: QuadletIR = {
      Container: [
        { key: 'AddDevice', value: 'nvidia.com/gpu=all' },
      ],
    }
    const compose = quadletIRToCompose(ir, 'svc')
    expect(compose.services!['svc'].deploy?.resources?.reservations?.devices).toEqual([
      { driver: 'nvidia', count: 'all', capabilities: ['gpu'] },
    ])
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
