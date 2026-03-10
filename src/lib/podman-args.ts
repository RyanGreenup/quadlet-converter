import type { Service } from './compose/index.js'
import type { QuadletEntry } from './quadlet.js'

function emit(flag: string): QuadletEntry {
  return { key: 'PodmanArgs', value: flag }
}

function extractValue(flag: string): string {
  const idx = flag.indexOf('=')
  return idx === -1 ? '' : flag.slice(idx + 1)
}

/** Map compose service fields to PodmanArgs entries. */
export function serviceToPodmanArgs(service: Service): QuadletEntry[] {
  const args: QuadletEntry[] = []

  // Boolean flags
  if (service.privileged) args.push(emit('--privileged'))
  if (service.init) args.push(emit('--init'))
  if (service.tty) args.push(emit('--tty'))
  if (service.stdin_open) args.push(emit('--interactive'))
  if (service.oom_kill_disable) args.push(emit('--oom-kill-disable'))

  // String flags
  if (service.pull_policy) args.push(emit(`--pull=${service.pull_policy}`))
  if (service.ipc) args.push(emit(`--ipc=${service.ipc}`))
  if (service.mac_address) args.push(emit(`--mac-address=${service.mac_address}`))
  if (service.domainname) args.push(emit(`--domainname=${service.domainname}`))
  if (service.uts) args.push(emit(`--uts=${service.uts}`))
  if (service.runtime) args.push(emit(`--runtime=${service.runtime}`))
  if (service.cgroup_parent) args.push(emit(`--cgroup-parent=${service.cgroup_parent}`))

  // Numeric/string flags
  if (service.cpu_count != null) args.push(emit(`--cpu-count=${service.cpu_count}`))
  if (service.cpu_percent != null) args.push(emit(`--cpu-percent=${service.cpu_percent}`))
  if (service.cpu_rt_period != null) args.push(emit(`--cpu-rt-period=${service.cpu_rt_period}`))
  if (service.cpu_rt_runtime != null) args.push(emit(`--cpu-rt-runtime=${service.cpu_rt_runtime}`))

  // Array flags
  if (service.volumes_from) {
    for (const v of service.volumes_from) args.push(emit(`--volumes-from=${v}`))
  }
  if (service.dns_opt) {
    for (const v of service.dns_opt) args.push(emit(`--dns-option=${v}`))
  }
  if (service.device_cgroup_rules) {
    for (const v of service.device_cgroup_rules) args.push(emit(`--device-cgroup-rule=${v}`))
  }
  if (service.label_file) {
    const files = Array.isArray(service.label_file) ? service.label_file : [service.label_file]
    for (const v of files) args.push(emit(`--label-file=${v}`))
  }

  // Record fields
  if (service.storage_opt) {
    for (const [k, v] of Object.entries(service.storage_opt)) {
      args.push(emit(`--storage-opt=${k}=${v}`))
    }
  }

  // Ulimits
  if (service.ulimits) {
    for (const [name, val] of Object.entries(service.ulimits)) {
      if (typeof val === 'object' && val !== null && 'soft' in val) {
        args.push(emit(`--ulimit=${name}=${val.soft}:${val.hard}`))
      } else {
        args.push(emit(`--ulimit=${name}=${val}`))
      }
    }
  }

  // blkio_config
  if (service.blkio_config) {
    const bc = service.blkio_config
    if (bc.weight != null) args.push(emit(`--blkio-weight=${bc.weight}`))
    if (bc.weight_device) {
      for (const wd of bc.weight_device) {
        args.push(emit(`--blkio-weight-device=${wd.path}:${wd.weight}`))
      }
    }
    if (bc.device_read_bps) {
      for (const d of bc.device_read_bps) args.push(emit(`--device-read-bps=${d.path}:${d.rate}`))
    }
    if (bc.device_read_iops) {
      for (const d of bc.device_read_iops) args.push(emit(`--device-read-iops=${d.path}:${d.rate}`))
    }
    if (bc.device_write_bps) {
      for (const d of bc.device_write_bps) args.push(emit(`--device-write-bps=${d.path}:${d.rate}`))
    }
    if (bc.device_write_iops) {
      for (const d of bc.device_write_iops) args.push(emit(`--device-write-iops=${d.path}:${d.rate}`))
    }
  }

  return args
}

/** Parse a PodmanArgs flag and apply it to a service. Returns true if recognized. */
export function applyPodmanArg(service: Service, value: string): boolean {
  // Boolean flags
  if (value === '--privileged') { service.privileged = true; return true }
  if (value === '--init') { service.init = true; return true }
  if (value === '--tty') { service.tty = true; return true }
  if (value === '--interactive') { service.stdin_open = true; return true }
  if (value === '--oom-kill-disable') { service.oom_kill_disable = true; return true }

  // --flag=value flags
  const eq = value.indexOf('=')
  if (eq === -1) return false

  const flag = value.slice(0, eq)
  const val = value.slice(eq + 1)

  switch (flag) {
    case '--pull': service.pull_policy = val; return true
    case '--ipc': service.ipc = val; return true
    case '--mac-address': service.mac_address = val; return true
    case '--domainname': service.domainname = val; return true
    case '--uts': service.uts = val; return true
    case '--runtime': service.runtime = val; return true
    case '--cgroup-parent': service.cgroup_parent = val; return true
    case '--cpu-count': service.cpu_count = val; return true
    case '--cpu-percent': service.cpu_percent = val; return true
    case '--cpu-rt-period': service.cpu_rt_period = val; return true
    case '--cpu-rt-runtime': service.cpu_rt_runtime = val; return true
    case '--memory-swappiness': service.mem_swappiness = parseInt(val, 10); return true
    case '--security-opt':
      if (!service.security_opt) service.security_opt = []
      service.security_opt.push(val)
      return true
    case '--volumes-from':
      if (!service.volumes_from) service.volumes_from = []
      service.volumes_from.push(val)
      return true
    case '--dns-option':
      if (!service.dns_opt) service.dns_opt = []
      service.dns_opt.push(val)
      return true
    case '--device-cgroup-rule':
      if (!service.device_cgroup_rules) service.device_cgroup_rules = []
      service.device_cgroup_rules.push(val)
      return true
    case '--label-file':
      if (!service.label_file) service.label_file = []
      if (typeof service.label_file === 'string') service.label_file = [service.label_file]
      ;(service.label_file as string[]).push(val)
      return true
    case '--storage-opt': {
      if (!service.storage_opt) service.storage_opt = {}
      const sepIdx = val.indexOf('=')
      if (sepIdx !== -1) {
        service.storage_opt[val.slice(0, sepIdx)] = val.slice(sepIdx + 1)
      }
      return true
    }
    case '--ulimit': {
      if (!service.ulimits) service.ulimits = {}
      const colonIdx = val.indexOf('=')
      if (colonIdx !== -1) {
        const name = val.slice(0, colonIdx)
        const rest = val.slice(colonIdx + 1)
        const parts = rest.split(':')
        if (parts.length === 2) {
          service.ulimits[name] = { soft: parseInt(parts[0], 10), hard: parseInt(parts[1], 10) }
        } else {
          service.ulimits[name] = parseInt(rest, 10)
        }
      }
      return true
    }
    case '--blkio-weight':
      if (!service.blkio_config) service.blkio_config = {}
      service.blkio_config.weight = parseInt(val, 10)
      return true
    case '--blkio-weight-device': {
      if (!service.blkio_config) service.blkio_config = {}
      if (!service.blkio_config.weight_device) service.blkio_config.weight_device = []
      const [path, weight] = val.split(':')
      service.blkio_config.weight_device.push({ path, weight: parseInt(weight, 10) })
      return true
    }
    case '--device-read-bps': {
      if (!service.blkio_config) service.blkio_config = {}
      if (!service.blkio_config.device_read_bps) service.blkio_config.device_read_bps = []
      const [path, rate] = val.split(':')
      service.blkio_config.device_read_bps.push({ path, rate })
      return true
    }
    case '--device-read-iops': {
      if (!service.blkio_config) service.blkio_config = {}
      if (!service.blkio_config.device_read_iops) service.blkio_config.device_read_iops = []
      const [path, rate] = val.split(':')
      service.blkio_config.device_read_iops.push({ path, rate })
      return true
    }
    case '--device-write-bps': {
      if (!service.blkio_config) service.blkio_config = {}
      if (!service.blkio_config.device_write_bps) service.blkio_config.device_write_bps = []
      const [path, rate] = val.split(':')
      service.blkio_config.device_write_bps.push({ path, rate })
      return true
    }
    case '--device-write-iops': {
      if (!service.blkio_config) service.blkio_config = {}
      if (!service.blkio_config.device_write_iops) service.blkio_config.device_write_iops = []
      const [path, rate] = val.split(':')
      service.blkio_config.device_write_iops.push({ path, rate })
      return true
    }
    default:
      return false
  }
}
