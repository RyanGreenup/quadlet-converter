import { describe, expect, test } from 'bun:test'
import { quadletIRToCompose } from './reverse'
import type { QuadletIR } from './quadlet'

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

  test('converts Secret (short) to secrets', () => {
    const ir: QuadletIR = {
      Container: [
        { key: 'Secret', value: 'db_pass' },
      ],
    }
    const compose = quadletIRToCompose(ir, 'svc')
    expect(compose.services!['svc'].secrets).toEqual(['db_pass'])
  })

  test('converts Secret (long) to secrets with options', () => {
    const ir: QuadletIR = {
      Container: [
        { key: 'Secret', value: 'db_pass,target=/run/secrets/db,uid=1000' },
      ],
    }
    const compose = quadletIRToCompose(ir, 'svc')
    expect(compose.services!['svc'].secrets).toEqual([
      { source: 'db_pass', target: '/run/secrets/db', uid: '1000' },
    ])
  })

  test('converts cpu service entries to compose fields', () => {
    const ir: QuadletIR = {
      Service: [
        { key: 'CPUShares', value: '512' },
        { key: 'CPUQuotaPeriodSec', value: '0.1' },
        { key: 'AllowedCPUs', value: '0-3' },
      ],
    }
    const compose = quadletIRToCompose(ir, 'svc')
    const svc = compose.services!['svc']
    expect(svc.cpu_shares).toBe(512)
    expect(svc.cpu_period).toBe('100000')
    expect(svc.cpuset).toBe('0-3')
  })

  test('converts memory/resource service entries to compose fields', () => {
    const ir: QuadletIR = {
      Service: [
        { key: 'MemoryReservation', value: '256m' },
        { key: 'MemorySwapMax', value: '1g' },
        { key: 'TasksMax', value: '100' },
        { key: 'OOMScoreAdjust', value: '-500' },
      ],
    }
    const compose = quadletIRToCompose(ir, 'svc')
    const svc = compose.services!['svc']
    expect(svc.mem_reservation).toBe('256m')
    expect(svc.memswap_limit).toBe('1g')
    expect(svc.pids_limit).toBe(100)
    expect(svc.oom_score_adj).toBe(-500)
  })

  test('converts PodmanArgs --memory-swappiness to mem_swappiness', () => {
    const ir: QuadletIR = {
      Container: [
        { key: 'PodmanArgs', value: '--memory-swappiness=60' },
      ],
    }
    const compose = quadletIRToCompose(ir, 'svc')
    expect(compose.services!['svc'].mem_swappiness).toBe(60)
  })

  test('converts ExecStartPost/ExecStopPre to lifecycle hooks', () => {
    const ir: QuadletIR = {
      Service: [
        { key: 'ExecStartPost', value: 'podman exec svc /bin/sh -c "echo started"' },
        { key: 'ExecStopPre', value: 'podman exec svc /bin/sh -c "echo stopping"' },
      ],
    }
    const compose = quadletIRToCompose(ir, 'svc')
    const svc = compose.services!['svc']
    expect(svc.post_start).toEqual([{ command: '/bin/sh -c "echo started"' }])
    expect(svc.pre_stop).toEqual([{ command: '/bin/sh -c "echo stopping"' }])
  })

  test('handles empty IR', () => {
    const compose = quadletIRToCompose({}, 'svc')
    expect(compose).toEqual({ services: { svc: {} } })
  })
})
