import { describe, test, expect } from 'bun:test'
import type { Service } from './compose/index.js'
import { serviceToPodmanArgs, applyPodmanArg } from './podman-args.js'

function argsFor(service: Service): string[] {
  return serviceToPodmanArgs(service).map(e => e.value)
}

describe('serviceToPodmanArgs', () => {
  test('empty service → empty array', () => {
    expect(serviceToPodmanArgs({})).toEqual([])
  })

  test('boolean flags emit when truthy', () => {
    expect(argsFor({ privileged: true })).toContain('--privileged')
    expect(argsFor({ init: true })).toContain('--init')
    expect(argsFor({ tty: true })).toContain('--tty')
    expect(argsFor({ stdin_open: true })).toContain('--interactive')
    expect(argsFor({ oom_kill_disable: true })).toContain('--oom-kill-disable')
  })

  test('boolean flags skip when falsy', () => {
    expect(argsFor({ privileged: false })).toEqual([])
    expect(argsFor({ init: false })).toEqual([])
    expect(argsFor({ tty: false })).toEqual([])
    expect(argsFor({ stdin_open: false })).toEqual([])
    expect(argsFor({ oom_kill_disable: false })).toEqual([])
  })

  test('string flags', () => {
    expect(argsFor({ pull_policy: 'always' })).toContain('--pull=always')
    expect(argsFor({ ipc: 'host' })).toContain('--ipc=host')
    expect(argsFor({ mac_address: '02:42:ac:11:00:02' })).toContain('--mac-address=02:42:ac:11:00:02')
    expect(argsFor({ domainname: 'example.com' })).toContain('--domainname=example.com')
    expect(argsFor({ uts: 'host' })).toContain('--uts=host')
    expect(argsFor({ runtime: 'nvidia' })).toContain('--runtime=nvidia')
    expect(argsFor({ cgroup_parent: '/parent' })).toContain('--cgroup-parent=/parent')
  })

  test('numeric flags', () => {
    expect(argsFor({ cpu_count: 4 })).toContain('--cpu-count=4')
    expect(argsFor({ cpu_percent: 50 })).toContain('--cpu-percent=50')
    expect(argsFor({ cpu_rt_period: 100000 })).toContain('--cpu-rt-period=100000')
    expect(argsFor({ cpu_rt_runtime: 95000 })).toContain('--cpu-rt-runtime=95000')
  })

  test('array fields emit one entry each', () => {
    const args = argsFor({ volumes_from: ['container1', 'container2'] })
    expect(args).toContain('--volumes-from=container1')
    expect(args).toContain('--volumes-from=container2')
  })

  test('dns_opt array', () => {
    const args = argsFor({ dns_opt: ['use-vc', 'ndots:5'] })
    expect(args).toContain('--dns-option=use-vc')
    expect(args).toContain('--dns-option=ndots:5')
  })

  test('device_cgroup_rules', () => {
    const args = argsFor({ device_cgroup_rules: ['c 1:3 mr'] })
    expect(args).toContain('--device-cgroup-rule=c 1:3 mr')
  })

  test('label_file string', () => {
    expect(argsFor({ label_file: 'labels.txt' })).toContain('--label-file=labels.txt')
  })

  test('label_file array', () => {
    const args = argsFor({ label_file: ['a.txt', 'b.txt'] })
    expect(args).toContain('--label-file=a.txt')
    expect(args).toContain('--label-file=b.txt')
  })

  test('storage_opt record', () => {
    const args = argsFor({ storage_opt: { size: '10G' } })
    expect(args).toContain('--storage-opt=size=10G')
  })

  test('ulimits number value', () => {
    const args = argsFor({ ulimits: { nofile: 65536 } })
    expect(args).toContain('--ulimit=nofile=65536')
  })

  test('ulimits soft/hard object', () => {
    const args = argsFor({ ulimits: { nofile: { soft: 1024, hard: 65536 } } })
    expect(args).toContain('--ulimit=nofile=1024:65536')
  })

  test('ulimits multiple entries', () => {
    const args = argsFor({ ulimits: { nofile: 65536, nproc: 2048 } })
    expect(args).toContain('--ulimit=nofile=65536')
    expect(args).toContain('--ulimit=nproc=2048')
  })

  test('blkio_config weight', () => {
    const args = argsFor({ blkio_config: { weight: 300 } })
    expect(args).toContain('--blkio-weight=300')
  })

  test('blkio_config weight_device', () => {
    const args = argsFor({ blkio_config: { weight_device: [{ path: '/dev/sda', weight: 200 }] } })
    expect(args).toContain('--blkio-weight-device=/dev/sda:200')
  })

  test('blkio_config device_read_bps', () => {
    const args = argsFor({ blkio_config: { device_read_bps: [{ path: '/dev/sda', rate: '10mb' }] } })
    expect(args).toContain('--device-read-bps=/dev/sda:10mb')
  })

  test('blkio_config device_read_iops', () => {
    const args = argsFor({ blkio_config: { device_read_iops: [{ path: '/dev/sda', rate: '1000' }] } })
    expect(args).toContain('--device-read-iops=/dev/sda:1000')
  })

  test('blkio_config device_write_bps', () => {
    const args = argsFor({ blkio_config: { device_write_bps: [{ path: '/dev/sda', rate: '5mb' }] } })
    expect(args).toContain('--device-write-bps=/dev/sda:5mb')
  })

  test('blkio_config device_write_iops', () => {
    const args = argsFor({ blkio_config: { device_write_iops: [{ path: '/dev/sda', rate: '500' }] } })
    expect(args).toContain('--device-write-iops=/dev/sda:500')
  })
})

describe('applyPodmanArg', () => {
  test('returns false for unrecognized args', () => {
    const svc: Service = {}
    expect(applyPodmanArg(svc, '--unknown-flag')).toBe(false)
    expect(applyPodmanArg(svc, '--unknown=value')).toBe(false)
  })

  test('boolean flags', () => {
    const svc: Service = {}
    expect(applyPodmanArg(svc, '--privileged')).toBe(true)
    expect(svc.privileged).toBe(true)

    expect(applyPodmanArg(svc, '--init')).toBe(true)
    expect(svc.init).toBe(true)

    expect(applyPodmanArg(svc, '--tty')).toBe(true)
    expect(svc.tty).toBe(true)

    expect(applyPodmanArg(svc, '--interactive')).toBe(true)
    expect(svc.stdin_open).toBe(true)

    expect(applyPodmanArg(svc, '--oom-kill-disable')).toBe(true)
    expect(svc.oom_kill_disable).toBe(true)
  })

  test('string value flags', () => {
    const svc: Service = {}
    applyPodmanArg(svc, '--pull=always')
    expect(svc.pull_policy).toBe('always')

    applyPodmanArg(svc, '--ipc=host')
    expect(svc.ipc).toBe('host')

    applyPodmanArg(svc, '--mac-address=02:42:ac:11:00:02')
    expect(svc.mac_address).toBe('02:42:ac:11:00:02')

    applyPodmanArg(svc, '--runtime=nvidia')
    expect(svc.runtime).toBe('nvidia')
  })

  test('security-opt', () => {
    const svc: Service = {}
    applyPodmanArg(svc, '--security-opt=apparmor:unconfined')
    expect(svc.security_opt).toEqual(['apparmor:unconfined'])
  })

  test('ulimit with soft:hard', () => {
    const svc: Service = {}
    applyPodmanArg(svc, '--ulimit=nofile=1024:65536')
    expect(svc.ulimits).toEqual({ nofile: { soft: 1024, hard: 65536 } })
  })

  test('ulimit with single value', () => {
    const svc: Service = {}
    applyPodmanArg(svc, '--ulimit=nproc=2048')
    expect(svc.ulimits).toEqual({ nproc: 2048 })
  })

  test('blkio_config reverse', () => {
    const svc: Service = {}
    applyPodmanArg(svc, '--blkio-weight=300')
    expect(svc.blkio_config?.weight).toBe(300)

    applyPodmanArg(svc, '--blkio-weight-device=/dev/sda:200')
    expect(svc.blkio_config?.weight_device).toEqual([{ path: '/dev/sda', weight: 200 }])

    applyPodmanArg(svc, '--device-read-bps=/dev/sda:10mb')
    expect(svc.blkio_config?.device_read_bps).toEqual([{ path: '/dev/sda', rate: '10mb' }])
  })

  test('storage_opt reverse', () => {
    const svc: Service = {}
    applyPodmanArg(svc, '--storage-opt=size=10G')
    expect(svc.storage_opt).toEqual({ size: '10G' })
  })

  test('volumes_from reverse', () => {
    const svc: Service = {}
    applyPodmanArg(svc, '--volumes-from=container1')
    applyPodmanArg(svc, '--volumes-from=container2')
    expect(svc.volumes_from).toEqual(['container1', 'container2'])
  })
})

describe('round-trip', () => {
  test('ulimits round-trip', () => {
    const original: Service = { ulimits: { nofile: { soft: 1024, hard: 65536 }, nproc: 2048 } }
    const args = serviceToPodmanArgs(original)
    const restored: Service = {}
    for (const { value } of args) applyPodmanArg(restored, value)
    expect(restored.ulimits).toEqual(original.ulimits)
  })

  test('blkio_config round-trip', () => {
    const original: Service = {
      blkio_config: {
        weight: 300,
        weight_device: [{ path: '/dev/sda', weight: 200 }],
        device_read_bps: [{ path: '/dev/sda', rate: '10mb' }],
        device_write_iops: [{ path: '/dev/sdb', rate: '500' }],
      },
    }
    const args = serviceToPodmanArgs(original)
    const restored: Service = {}
    for (const { value } of args) applyPodmanArg(restored, value)
    expect(restored.blkio_config).toEqual(original.blkio_config)
  })

  test('boolean and string fields round-trip', () => {
    const original: Service = {
      privileged: true,
      init: true,
      tty: true,
      pull_policy: 'always',
      ipc: 'host',
      runtime: 'nvidia',
    }
    const args = serviceToPodmanArgs(original)
    const restored: Service = {}
    for (const { value } of args) applyPodmanArg(restored, value)
    expect(restored.privileged).toBe(true)
    expect(restored.init).toBe(true)
    expect(restored.tty).toBe(true)
    expect(restored.pull_policy).toBe('always')
    expect(restored.ipc).toBe('host')
    expect(restored.runtime).toBe('nvidia')
  })
})
