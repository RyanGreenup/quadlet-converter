import { describe, expect, test } from 'bun:test'
import { composeServiceToQuadletIR, quadletIRToCompose, composeToQuadletFiles, detectUnresolvedVariables } from './converter'
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
      Install: [
        { key: 'WantedBy', value: 'default.target' },
      ],
    })
  })

  test('restart: no does not emit Install section', () => {
    const service: Service = { image: 'nginx', restart: 'no' }
    const ir = composeServiceToQuadletIR('svc', service)
    expect(ir.Install).toBeUndefined()
  })

  test('restart: on-failure emits Install WantedBy=default.target', () => {
    const service: Service = { image: 'nginx', restart: 'on-failure' }
    const ir = composeServiceToQuadletIR('svc', service)
    expect(ir.Install).toEqual([{ key: 'WantedBy', value: 'default.target' }])
  })

  test('no restart set does not emit Install section', () => {
    const service: Service = { image: 'nginx' }
    const ir = composeServiceToQuadletIR('svc', service)
    expect(ir.Install).toBeUndefined()
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

    // DropCapability=ALL must come before AddCapability entries so Podman
    // drops all caps first, then adds specific ones back
    const entries = ir.Container!
    const dropIdx = entries.findIndex(e => e.key === 'DropCapability' && e.value === 'ALL')
    const firstAddIdx = entries.findIndex(e => e.key === 'AddCapability')
    expect(dropIdx).toBeLessThan(firstAddIdx)
  })

  test('converts working_dir', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      working_dir: '/app/src',
    })
    expect(ir.Container).toContainEqual({ key: 'WorkingDir', value: '/app/src' })
  })

  test('converts command (string)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      command: 'nginx -g "daemon off;"',
    })
    expect(ir.Container).toContainEqual({ key: 'Exec', value: 'nginx -g "daemon off;"' })
  })

  test('converts command (array)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      command: ['nginx', '-g', 'daemon off;'],
    })
    expect(ir.Container).toContainEqual({ key: 'Exec', value: 'nginx -g daemon off;' })
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

  test('ignores expose (inter-container only, no host publishing)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      expose: ['3000', 4000],
    })
    const exposeEntries = (ir.Container ?? []).filter(e => e.key === 'ExposeHostPort')
    expect(exposeEntries).toHaveLength(0)
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

  test('omits Network= when Pod= is set (pod owns the network namespace)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      networks: ['proxy', 'backend'],
    }, { pod: 'myapp.pod' })
    expect(ir.Container).toContainEqual({ key: 'Pod', value: 'myapp.pod' })
    const networkEntries = (ir.Container ?? []).filter(e => e.key === 'Network')
    expect(networkEntries).toHaveLength(0)
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

  test('converts healthcheck (string test)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      healthcheck: {
        test: 'curl -f http://localhost/ || exit 1',
        interval: '30s',
        timeout: '10s',
        retries: 3,
        start_period: '5s',
        start_interval: '2s',
      },
    })
    expect(ir.Container).toContainEqual({ key: 'HealthCmd', value: 'curl -f http://localhost/ || exit 1' })
    expect(ir.Container).toContainEqual({ key: 'HealthInterval', value: '30s' })
    expect(ir.Container).toContainEqual({ key: 'HealthTimeout', value: '10s' })
    expect(ir.Container).toContainEqual({ key: 'HealthRetries', value: '3' })
    expect(ir.Container).toContainEqual({ key: 'HealthStartPeriod', value: '5s' })
    expect(ir.Container).toContainEqual({ key: 'HealthStartupInterval', value: '2s' })
  })

  test('converts healthcheck (CMD-SHELL array)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      healthcheck: {
        test: ['CMD-SHELL', 'curl -f http://localhost/ || exit 1'],
      },
    })
    expect(ir.Container).toContainEqual({ key: 'HealthCmd', value: 'curl -f http://localhost/ || exit 1' })
  })

  test('converts healthcheck (CMD array)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      healthcheck: {
        test: ['CMD', 'curl', '-f', 'http://localhost/'],
      },
    })
    expect(ir.Container).toContainEqual({ key: 'HealthCmd', value: 'curl -f http://localhost/' })
  })

  test('converts healthcheck (NONE)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      healthcheck: {
        test: ['NONE'],
      },
    })
    expect(ir.Container).toContainEqual({ key: 'HealthCmd', value: 'none' })
  })

  test('converts depends_on (string list, service_started)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      depends_on: ['db', 'redis'],
    })
    expect(ir.Unit).toContainEqual({ key: 'After', value: 'db.service' })
    expect(ir.Unit).toContainEqual({ key: 'Requires', value: 'db.service' })
    expect(ir.Unit).toContainEqual({ key: 'After', value: 'redis.service' })
    expect(ir.Unit).toContainEqual({ key: 'Requires', value: 'redis.service' })
  })

  test('converts depends_on (service_healthy) — After + Requires, no ExecStartPre', () => {
    // service_healthy is handled via Notify=healthy on the dependency container
    // (added by composeToQuadletFiles), not by polling in the dependent service
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      depends_on: {
        db: { condition: 'service_healthy' },
      },
    })
    expect(ir.Unit).toContainEqual({ key: 'After', value: 'db.service' })
    expect(ir.Unit).toContainEqual({ key: 'Requires', value: 'db.service' })
    // No ExecStartPre polling — Notify=healthy on the dep handles it
    const execStartPre = (ir.Service ?? []).filter(e => e.key === 'ExecStartPre')
    expect(execStartPre).toHaveLength(0)
  })

  test('converts depends_on (service_completed_successfully)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      depends_on: {
        migrate: { condition: 'service_completed_successfully' },
      },
    })
    expect(ir.Unit).toContainEqual({ key: 'After', value: 'migrate.service' })
    expect(ir.Unit).toContainEqual({ key: 'Requires', value: 'migrate.service' })
  })

  test('converts pid: host to PidHost', () => {
    const ir = composeServiceToQuadletIR('app', { image: 'nginx', pid: 'host' })
    expect(ir.Container).toContainEqual({ key: 'PidHost', value: 'true' })
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

  test('converts secrets (short syntax)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      secrets: ['db_pass'],
    })
    expect(ir.Container).toContainEqual({ key: 'Secret', value: 'db_pass' })
  })

  test('converts secrets (long syntax)', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      secrets: [{ source: 'db_pass', target: '/run/secrets/db', uid: '1000', mode: 0o440 }],
    })
    expect(ir.Container).toContainEqual({ key: 'Secret', value: 'db_pass,target=/run/secrets/db,uid=1000,mode=0440' })
  })

  test('converts security_opt label:type', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      security_opt: ['label:type:container_t'],
    })
    expect(ir.Container).toContainEqual({ key: 'SecurityLabelType', value: 'container_t' })
  })

  test('converts security_opt label:level', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      security_opt: ['label:level:s0:c100,c200'],
    })
    expect(ir.Container).toContainEqual({ key: 'SecurityLabelLevel', value: 's0:c100,c200' })
  })

  test('converts security_opt label:disable', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      security_opt: ['label:disable'],
    })
    expect(ir.Container).toContainEqual({ key: 'SecurityLabelDisable', value: 'true' })
  })

  test('converts security_opt no-new-privileges', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      security_opt: ['no-new-privileges:true'],
    })
    expect(ir.Container).toContainEqual({ key: 'NoNewPrivileges', value: 'true' })
  })

  test('converts security_opt seccomp', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      security_opt: ['seccomp:profile.json'],
    })
    expect(ir.Container).toContainEqual({ key: 'SeccompProfile', value: 'profile.json' })
  })

  test('converts privileged to PodmanArgs', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      privileged: true,
    })
    expect(ir.Container).toContainEqual({ key: 'PodmanArgs', value: '--privileged' })
  })

  test('does not emit privileged when false', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      privileged: false,
    })
    const podmanArgs = (ir.Container ?? []).filter(e => e.key === 'PodmanArgs')
    expect(podmanArgs).toHaveLength(0)
  })

  test('converts security_opt apparmor to PodmanArgs', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      security_opt: ['apparmor:unconfined'],
    })
    expect(ir.Container).toContainEqual({ key: 'PodmanArgs', value: '--security-opt=apparmor:unconfined' })
  })

  test('converts unknown security_opt to PodmanArgs', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      security_opt: ['systempaths=unconfined'],
    })
    expect(ir.Container).toContainEqual({ key: 'PodmanArgs', value: '--security-opt=systempaths=unconfined' })
  })

  test('converts multiple security_opt entries', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      security_opt: ['label:type:container_t', 'label:level:s0:c100,c200', 'no-new-privileges'],
    })
    expect(ir.Container).toContainEqual({ key: 'SecurityLabelType', value: 'container_t' })
    expect(ir.Container).toContainEqual({ key: 'SecurityLabelLevel', value: 's0:c100,c200' })
    expect(ir.Container).toContainEqual({ key: 'NoNewPrivileges', value: 'true' })
  })

  test('converts cpu fields', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      cpus: 0.5,
      cpu_shares: 512,
      cpu_quota: 50000,
      cpu_period: 100000,
      cpuset: '0-3',
    })
    expect(ir.Service).toContainEqual({ key: 'CPUQuota', value: '50%' })
    expect(ir.Service).toContainEqual({ key: 'CPUShares', value: '512' })
    expect(ir.Service).toContainEqual({ key: 'CPUQuota', value: '50000' })
    expect(ir.Service).toContainEqual({ key: 'CPUQuotaPeriodSec', value: '0.1' })
    expect(ir.Service).toContainEqual({ key: 'AllowedCPUs', value: '0-3' })
  })

  test('converts memory/resource fields', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      mem_limit: '512m',
      mem_reservation: '256m',
      memswap_limit: '1g',
      pids_limit: 100,
      oom_score_adj: -500,
    })
    expect(ir.Service).toContainEqual({ key: 'MemoryMax', value: '512m' })
    expect(ir.Service).toContainEqual({ key: 'MemoryLow', value: '256m' })
    expect(ir.Service).toContainEqual({ key: 'MemorySwapMax', value: '512m' })
    expect(ir.Service).toContainEqual({ key: 'TasksMax', value: '100' })
    expect(ir.Service).toContainEqual({ key: 'OOMScoreAdjust', value: '-500' })
  })

  test('memswap_limit equal to mem_limit produces MemorySwapMax=0', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      mem_limit: '512m',
      memswap_limit: '512m',
    })
    expect(ir.Service).toContainEqual({ key: 'MemorySwapMax', value: '0' })
  })

  test('memswap_limit without mem_limit passes through raw value', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      memswap_limit: '1g',
    })
    expect(ir.Service).toContainEqual({ key: 'MemorySwapMax', value: '1g' })
  })

  test('converts mem_swappiness to PodmanArgs', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      mem_swappiness: 60,
    })
    expect(ir.Container).toContainEqual({ key: 'PodmanArgs', value: '--memory-swappiness=60' })
  })

  test('converts post_start and pre_stop lifecycle hooks', () => {
    const ir = composeServiceToQuadletIR('app', {
      image: 'nginx',
      post_start: [{ command: '/bin/sh -c "echo started"' }],
      pre_stop: [{ command: ['/bin/sh', '-c', 'echo stopping'] }],
    })
    expect(ir.Service).toContainEqual({ key: 'ExecStartPost', value: 'podman exec app /bin/sh -c "echo started"' })
    expect(ir.Service).toContainEqual({ key: 'ExecStopPre', value: 'podman exec app /bin/sh -c echo stopping' })
  })

  test('handles service with no optional fields', () => {
    const ir = composeServiceToQuadletIR('empty', {})
    expect(ir).toEqual({})
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
    expect(files[0].ir.Container).toContainEqual({ key: 'Label', value: 'io.podman.quadlet.project=example' })
    expect(files[0].ir.Container).toContainEqual({ key: 'Label', value: 'io.podman.quadlet.service=my-caddy' })
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

    // Both containers should have project/service labels
    expect(webFile.ir.Container).toContainEqual({ key: 'Label', value: 'io.podman.quadlet.project=example' })
    expect(webFile.ir.Container).toContainEqual({ key: 'Label', value: 'io.podman.quadlet.service=web' })
    expect(redisFile.ir.Container).toContainEqual({ key: 'Label', value: 'io.podman.quadlet.project=example' })
    expect(redisFile.ir.Container).toContainEqual({ key: 'Label', value: 'io.podman.quadlet.service=redis' })
  })

  test('no-pod multi-network containers include project/service labels', () => {
    const compose: ComposeFile = {
      services: {
        web: {
          image: 'nginx',
          networks: ['frontend', 'backend'],
        },
        api: {
          image: 'node',
          networks: ['backend'],
        },
      },
      networks: {
        frontend: {},
        backend: {},
      },
    }
    const files = composeToQuadletFiles(compose, 'myproj')
    const webFile = files.find(f => f.filename.endsWith('web.container'))!
    const apiFile = files.find(f => f.filename.endsWith('api.container'))!

    expect(webFile.ir.Container).toContainEqual({ key: 'Label', value: 'io.podman.quadlet.project=myproj' })
    expect(webFile.ir.Container).toContainEqual({ key: 'Label', value: 'io.podman.quadlet.service=web' })
    expect(apiFile.ir.Container).toContainEqual({ key: 'Label', value: 'io.podman.quadlet.project=myproj' })
    expect(apiFile.ir.Container).toContainEqual({ key: 'Label', value: 'io.podman.quadlet.service=api' })
  })

  test('containers include AutoUpdate=registry by default', () => {
    const compose: ComposeFile = {
      services: { web: { image: 'nginx', ports: ['80:80'] } },
    }
    const files = composeToQuadletFiles(compose, 'test')
    expect(files[0].ir.Container).toContainEqual({ key: 'AutoUpdate', value: 'registry' })
  })

  test('AutoUpdate is omitted when autoUpdate: false', () => {
    const compose: ComposeFile = {
      services: { web: { image: 'nginx', ports: ['80:80'] } },
    }
    const files = composeToQuadletFiles(compose, 'test', { autoUpdate: false })
    const autoUpdate = (files[0].ir.Container ?? []).filter(e => e.key === 'AutoUpdate')
    expect(autoUpdate).toHaveLength(0)
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
    expect(ir.Install).toEqual([{ key: 'WantedBy', value: 'default.target' }])
    const compose = quadletIRToCompose(ir, 'web')

    expect(compose.services!['web']).toEqual(service)
  })
})

describe('composeServiceToQuadletIR with build option', () => {
  test('uses localhost/<name> when build is set and no image specified', () => {
    const service: Service = { build: '.' }
    const ir = composeServiceToQuadletIR('myapp', service, { build: true })
    expect(ir.Container![0]).toEqual({ key: 'Image', value: 'localhost/myapp' })
  })

  test('uses explicit image when build is set and image is specified', () => {
    const service: Service = { build: '.', image: 'registry.io/myapp:v1' }
    const ir = composeServiceToQuadletIR('myapp', service, { build: true })
    expect(ir.Container![0]).toEqual({ key: 'Image', value: 'registry.io/myapp:v1' })
  })

  test('no Image entry when build is false and no image specified', () => {
    const service: Service = { build: '.' }
    const ir = composeServiceToQuadletIR('myapp', service)
    const imageEntries = ir.Container?.filter(e => e.key === 'Image') ?? []
    expect(imageEntries).toHaveLength(0)
  })

  test('adds Notify=healthy to containers depended on with service_healthy', () => {
    const compose: ComposeFile = {
      services: {
        app: {
          image: 'nginx',
          depends_on: {
            db: { condition: 'service_healthy' },
          },
        },
        db: {
          image: 'postgres',
          healthcheck: { test: ['CMD', 'pg_isready'] },
        },
      },
    }
    const files = composeToQuadletFiles(compose, 'myapp')
    const dbFile = files.find(f => f.filename === 'db.container')!
    expect(dbFile.ir.Container).toContainEqual({ key: 'Notify', value: 'healthy' })

    // app should NOT have Notify=healthy (it's the dependent, not the dependency)
    const appFile = files.find(f => f.filename === 'app.container')!
    const appNotify = (appFile.ir.Container ?? []).filter(e => e.key === 'Notify')
    expect(appNotify).toHaveLength(0)
  })

  test('does not add Notify=healthy for service_started deps', () => {
    const compose: ComposeFile = {
      services: {
        app: {
          image: 'nginx',
          depends_on: ['db'],
        },
        db: { image: 'postgres' },
      },
    }
    const files = composeToQuadletFiles(compose, 'myapp')
    const dbFile = files.find(f => f.filename === 'db.container')!
    const notify = (dbFile.ir.Container ?? []).filter(e => e.key === 'Notify')
    expect(notify).toHaveLength(0)
  })

  test('composeToQuadletFiles passes build option through', () => {
    const compose: ComposeFile = {
      services: {
        app: { build: './app' },
      },
    }
    const files = composeToQuadletFiles(compose, 'test', { build: true })
    const container = files[0]
    expect(container.ir.Container![0]).toEqual({ key: 'Image', value: 'localhost/app' })
  })
})

describe('detectUnresolvedVariables', () => {
  test('detects ${VAR} in ports', () => {
    const compose: ComposeFile = {
      services: {
        web: { image: 'nginx', ports: ['${HTTP_PORT}:80'] },
      },
    }
    const vars = detectUnresolvedVariables(compose)
    expect(vars).toHaveLength(1)
    expect(vars[0]).toEqual({ service: 'web', field: 'ports', value: '${HTTP_PORT}:80' })
  })

  test('detects $VAR (no braces) in environment', () => {
    const compose: ComposeFile = {
      services: {
        app: { image: 'node', environment: ['PORT=$APP_PORT'] },
      },
    }
    const vars = detectUnresolvedVariables(compose)
    expect(vars).toHaveLength(1)
    expect(vars[0].field).toBe('environment')
  })

  test('returns empty for compose files with no variables', () => {
    const compose: ComposeFile = {
      services: {
        web: { image: 'nginx', ports: ['80:80'], environment: ['FOO=bar'] },
      },
    }
    expect(detectUnresolvedVariables(compose)).toHaveLength(0)
  })

  test('detects variables in image field', () => {
    const compose: ComposeFile = {
      services: {
        app: { image: '${REGISTRY}/myapp:${TAG}' },
      },
    }
    const vars = detectUnresolvedVariables(compose)
    expect(vars).toEqual([{ service: 'app', field: 'image', value: '${REGISTRY}/myapp:${TAG}' }])
  })

  test('detects variables in volumes', () => {
    const compose: ComposeFile = {
      services: {
        app: { image: 'nginx', volumes: ['${DATA_DIR}:/data:Z'] },
      },
    }
    const vars = detectUnresolvedVariables(compose)
    expect(vars).toHaveLength(1)
    expect(vars[0].field).toBe('volumes')
  })
})
