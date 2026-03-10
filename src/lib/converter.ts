import type { Service } from './compose/index.js'
import type { ComposeFile } from './compose/index.js'
import type { QuadletIR, QuadletEntry } from './quadlet.js'

export interface QuadletFile {
  filename: string   // e.g. "example.pod", "web.container"
  ir: QuadletIR
}
export type QuadletFileSet = QuadletFile[]

const restartToQuadlet: Record<string, string> = {
  'no': 'no',
  'always': 'always',
  'unless-stopped': 'always',
  'on-failure': 'on-failure',
}

const restartToCompose: Record<string, string> = {
  'no': 'no',
  'always': 'unless-stopped',
  'on-failure': 'on-failure',
}

/** Parse a compose duration string (e.g. "1m30s", "10s", "500ms") to integer seconds string. */
function parseDurationToSeconds(duration: string): string {
  let total = 0
  const re = /(\d+)(h|m(?!s)|s|ms|us)/g
  let match
  while ((match = re.exec(duration)) !== null) {
    const val = parseInt(match[1], 10)
    switch (match[2]) {
      case 'h': total += val * 3600; break
      case 'm': total += val * 60; break
      case 's': total += val; break
      case 'ms': total += val / 1000; break
      case 'us': total += val / 1000000; break
    }
  }
  if (total === 0 && /^\d+$/.test(duration)) {
    total = parseInt(duration, 10)
  }
  return String(Math.round(total))
}

/** Convert integer seconds to a compose duration string. */
function secondsToDuration(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    return `${seconds / 60}m`
  }
  return `${seconds}s`
}

/** Convert a single compose service to QuadletIR. */
export function composeServiceToQuadletIR(
  name: string,
  service: Service,
  opts?: { omitPorts?: boolean; pod?: string },
): QuadletIR {
  const container: QuadletEntry[] = []
  const svcSection: QuadletEntry[] = []

  if (service.image) {
    container.push({ key: 'Image', value: service.image })
  }

  if (opts?.pod) {
    container.push({ key: 'Pod', value: opts.pod })
  }

  if (service.network_mode) {
    container.push({ key: 'Network', value: service.network_mode })
  }

  if (!opts?.omitPorts && service.ports) {
    for (const port of service.ports) {
      if (typeof port === 'string' || typeof port === 'number') {
        container.push({ key: 'PublishPort', value: String(port) })
      } else {
        // structured port config
        const parts: string[] = []
        if (port.host_ip) parts.push(port.host_ip + ':')
        else parts.push('')
        if (port.published != null) parts[parts.length - 1] += port.published
        parts[parts.length - 1] += ':' + (port.target ?? '')
        if (port.protocol && port.protocol !== 'tcp') {
          parts[parts.length - 1] += '/' + port.protocol
        }
        container.push({ key: 'PublishPort', value: parts.join('') })
      }
    }
  }

  if (service.volumes) {
    for (const vol of service.volumes) {
      if (typeof vol === 'string') {
        container.push({ key: 'Volume', value: vol })
      } else {
        // structured volume mount
        const parts = [vol.source ?? '', vol.target ?? '']
        if (vol.read_only) parts.push('ro')
        if (vol.bind?.selinux) parts.push(vol.bind.selinux)
        container.push({ key: 'Volume', value: parts.join(':') })
      }
    }
  }

  if (service.environment) {
    if (Array.isArray(service.environment)) {
      for (const env of service.environment) {
        container.push({ key: 'Environment', value: String(env) })
      }
    } else {
      for (const [k, v] of Object.entries(service.environment)) {
        container.push({ key: 'Environment', value: v != null ? `${k}=${v}` : k })
      }
    }
  }

  if (service.networks) {
    if (Array.isArray(service.networks)) {
      for (const net of service.networks) {
        container.push({ key: 'Network', value: net })
      }
    } else {
      for (const net of Object.keys(service.networks)) {
        container.push({ key: 'Network', value: net })
      }
    }
  }

  if (service.container_name) {
    container.push({ key: 'ContainerName', value: service.container_name })
  }

  if (service.user) {
    container.push({ key: 'User', value: service.user })
  }

  if (service.hostname) {
    container.push({ key: 'HostName', value: service.hostname })
  }

  if (service.command != null) {
    if (Array.isArray(service.command)) {
      container.push({ key: 'Exec', value: service.command.join(' ') })
    } else {
      container.push({ key: 'Exec', value: service.command })
    }
  }

  if (service.entrypoint != null) {
    if (Array.isArray(service.entrypoint)) {
      container.push({ key: 'Entrypoint', value: service.entrypoint.join(' ') })
    } else {
      container.push({ key: 'Entrypoint', value: service.entrypoint })
    }
  }

  if (service.working_dir) {
    container.push({ key: 'WorkingDir', value: service.working_dir })
  }

  if (service.cap_add) {
    for (const cap of service.cap_add) {
      container.push({ key: 'AddCapability', value: cap })
    }
  }

  if (service.cap_drop) {
    for (const cap of service.cap_drop) {
      container.push({ key: 'DropCapability', value: cap })
    }
  }

  if (service.dns) {
    const dnsServers = Array.isArray(service.dns) ? service.dns : [service.dns]
    for (const d of dnsServers) {
      container.push({ key: 'DNS', value: d })
    }
  }

  if (service.dns_search) {
    const searches = Array.isArray(service.dns_search) ? service.dns_search : [service.dns_search]
    for (const d of searches) {
      container.push({ key: 'DNSSearch', value: d })
    }
  }

  if (service.labels) {
    if (Array.isArray(service.labels)) {
      for (const label of service.labels) {
        container.push({ key: 'Label', value: String(label) })
      }
    } else {
      for (const [k, v] of Object.entries(service.labels)) {
        container.push({ key: 'Label', value: v != null ? `${k}=${v}` : k })
      }
    }
  }

  if (service.expose) {
    for (const port of service.expose) {
      container.push({ key: 'ExposeHostPort', value: String(port) })
    }
  }

  if (service.extra_hosts) {
    if (Array.isArray(service.extra_hosts)) {
      for (const host of service.extra_hosts) {
        container.push({ key: 'AddHost', value: host })
      }
    } else {
      for (const [hostname, ip] of Object.entries(service.extra_hosts)) {
        const ips = Array.isArray(ip) ? ip : [ip]
        for (const addr of ips) {
          container.push({ key: 'AddHost', value: `${hostname}:${addr}` })
        }
      }
    }
  }

  if (service.env_file) {
    const files = typeof service.env_file === 'string'
      ? [service.env_file]
      : Array.isArray(service.env_file)
        ? service.env_file
        : [service.env_file]
    for (const f of files) {
      const path = typeof f === 'string' ? f : f.path
      container.push({ key: 'EnvironmentFile', value: path })
    }
  }

  if (service.read_only) {
    container.push({ key: 'ReadOnly', value: 'true' })
  }

  if (service.tmpfs) {
    const paths = Array.isArray(service.tmpfs) ? service.tmpfs : [service.tmpfs]
    for (const t of paths) {
      container.push({ key: 'Tmpfs', value: t })
    }
  }

  if (service.shm_size != null) {
    container.push({ key: 'ShmSize', value: String(service.shm_size) })
  }

  if (service.sysctls) {
    if (Array.isArray(service.sysctls)) {
      for (const s of service.sysctls) {
        container.push({ key: 'Sysctl', value: s })
      }
    } else {
      for (const [k, v] of Object.entries(service.sysctls)) {
        container.push({ key: 'Sysctl', value: v != null ? `${k}=${v}` : k })
      }
    }
  }

  if (service.stop_signal) {
    container.push({ key: 'StopSignal', value: service.stop_signal })
  }

  if (service.stop_grace_period) {
    container.push({ key: 'StopTimeout', value: parseDurationToSeconds(service.stop_grace_period) })
  }

  if (service.logging) {
    if (service.logging.driver) {
      container.push({ key: 'LogDriver', value: service.logging.driver })
    }
  }

  if (service.group_add) {
    for (const g of service.group_add) {
      container.push({ key: 'GroupAdd', value: String(g) })
    }
  }

  if (service.userns_mode) {
    container.push({ key: 'UserNS', value: service.userns_mode })
  }

  if (service.annotations) {
    if (Array.isArray(service.annotations)) {
      for (const a of service.annotations) {
        container.push({ key: 'Annotation', value: String(a) })
      }
    } else {
      for (const [k, v] of Object.entries(service.annotations)) {
        container.push({ key: 'Annotation', value: v != null ? `${k}=${v}` : k })
      }
    }
  }

  if (service.healthcheck) {
    const hc = service.healthcheck
    if (hc.test) {
      if (Array.isArray(hc.test)) {
        const [prefix, ...rest] = hc.test
        if (prefix === 'CMD' || prefix === 'CMD-SHELL') {
          container.push({ key: 'HealthCmd', value: rest.join(' ') })
        } else if (prefix === 'NONE') {
          container.push({ key: 'HealthCmd', value: 'none' })
        } else {
          // No prefix, treat all elements as the command
          container.push({ key: 'HealthCmd', value: hc.test.join(' ') })
        }
      } else {
        container.push({ key: 'HealthCmd', value: hc.test })
      }
    }
    if (hc.interval) container.push({ key: 'HealthInterval', value: hc.interval })
    if (hc.retries != null) container.push({ key: 'HealthRetries', value: String(hc.retries) })
    if (hc.timeout) container.push({ key: 'HealthTimeout', value: hc.timeout })
    if (hc.start_period) container.push({ key: 'HealthStartPeriod', value: hc.start_period })
    if (hc.start_interval) container.push({ key: 'HealthStartupInterval', value: hc.start_interval })
  }

  if (service.security_opt) {
    for (const opt of service.security_opt) {
      if (opt.startsWith('label:type:')) {
        container.push({ key: 'SecurityLabelType', value: opt.slice('label:type:'.length) })
      } else if (opt.startsWith('label:level:')) {
        container.push({ key: 'SecurityLabelLevel', value: opt.slice('label:level:'.length) })
      } else if (opt === 'label:disable') {
        container.push({ key: 'SecurityLabelDisable', value: 'true' })
      } else if (opt === 'no-new-privileges' || opt === 'no-new-privileges:true') {
        container.push({ key: 'NoNewPrivileges', value: 'true' })
      } else if (opt.startsWith('seccomp:')) {
        container.push({ key: 'SeccompProfile', value: opt.slice('seccomp:'.length) })
      } else {
        container.push({ key: 'PodmanArgs', value: `--security-opt=${opt}` })
      }
    }
  }

  if (service.privileged) {
    container.push({ key: 'PodmanArgs', value: '--privileged' })
  }

  // devices → AddDevice (raw device pass-through)
  if (service.devices) {
    for (const dev of service.devices) {
      if (typeof dev === 'string') {
        container.push({ key: 'AddDevice', value: dev })
      } else {
        const parts = [dev.source]
        if (dev.target) parts.push(dev.target)
        if (dev.permissions) parts.push(dev.permissions)
        container.push({ key: 'AddDevice', value: parts.join(':') })
      }
    }
  }

  // gpus → AddDevice (CDI format)
  if (service.gpus) {
    if (service.gpus === 'all') {
      container.push({ key: 'AddDevice', value: 'nvidia.com/gpu=all' })
    } else if (Array.isArray(service.gpus)) {
      for (const gpu of service.gpus) {
        const caps = gpu.capabilities ?? []
        if (!caps.includes('gpu')) continue
        const driver = gpu.driver ?? 'nvidia'
        if (gpu.device_ids) {
          for (const id of gpu.device_ids) {
            container.push({ key: 'AddDevice', value: `${driver}.com/gpu=${id}` })
          }
        } else {
          const count = gpu.count ?? 'all'
          container.push({ key: 'AddDevice', value: `${driver}.com/gpu=${count}` })
        }
      }
    }
  }

  if (service.secrets) {
    for (const secret of service.secrets) {
      if (typeof secret === 'string') {
        container.push({ key: 'Secret', value: secret })
      } else {
        const parts = [secret.source ?? '']
        if (secret.target) parts.push(`target=${secret.target}`)
        if (secret.uid) parts.push(`uid=${secret.uid}`)
        if (secret.gid) parts.push(`gid=${secret.gid}`)
        if (secret.mode != null) {
          const mode = typeof secret.mode === 'number'
            ? '0' + secret.mode.toString(8)
            : secret.mode
          parts.push(`mode=${mode}`)
        }
        container.push({ key: 'Secret', value: parts.join(',') })
      }
    }
  }

  if (service.deploy?.resources?.limits) {
    const limits = service.deploy.resources.limits
    if (limits.cpus != null) {
      const pct = Math.round(parseFloat(String(limits.cpus)) * 100)
      svcSection.push({ key: 'CPUQuota', value: `${pct}%` })
    }
    if (limits.memory) {
      svcSection.push({ key: 'MemoryMax', value: limits.memory })
    }
  }

  // deploy.resources.reservations.devices → AddDevice (CDI format)
  if (service.deploy?.resources?.reservations?.devices) {
    for (const dev of service.deploy.resources.reservations.devices) {
      if (!dev.capabilities?.includes('gpu')) continue
      const driver = dev.driver ?? 'nvidia'
      if (dev.device_ids) {
        for (const id of dev.device_ids) {
          container.push({ key: 'AddDevice', value: `${driver}.com/gpu=${id}` })
        }
      } else {
        const count = dev.count ?? 'all'
        container.push({ key: 'AddDevice', value: `${driver}.com/gpu=${count}` })
      }
    }
  }

  if (service.restart) {
    const mapped = restartToQuadlet[service.restart] ?? service.restart
    svcSection.push({ key: 'Restart', value: mapped })
  }

  const ir: QuadletIR = {}
  if (container.length) ir['Container'] = container
  if (svcSection.length) ir['Service'] = svcSection

  return ir
}

/** Extract PublishPort entries from a service's ports. */
function portEntries(service: Service): QuadletEntry[] {
  const entries: QuadletEntry[] = []
  if (!service.ports) return entries
  for (const port of service.ports) {
    if (typeof port === 'string' || typeof port === 'number') {
      entries.push({ key: 'PublishPort', value: String(port) })
    } else {
      const parts: string[] = []
      if (port.host_ip) parts.push(port.host_ip + ':')
      else parts.push('')
      if (port.published != null) parts[parts.length - 1] += port.published
      parts[parts.length - 1] += ':' + (port.target ?? '')
      if (port.protocol && port.protocol !== 'tcp') {
        parts[parts.length - 1] += '/' + port.protocol
      }
      entries.push({ key: 'PublishPort', value: parts.join('') })
    }
  }
  return entries
}

/** Convert an entire compose file to a set of quadlet files. */
export function composeToQuadletFiles(compose: ComposeFile, podName: string): QuadletFileSet {
  const services = compose.services ?? {}
  const serviceNames = Object.keys(services)

  if (serviceNames.length === 0) return []

  // Single service: no pod needed
  if (serviceNames.length === 1) {
    const name = serviceNames[0]
    return [{
      filename: `${name}.container`,
      ir: composeServiceToQuadletIR(name, services[name]),
    }]
  }

  // Multiple services: create a pod + container files
  const podFile = `${podName}.pod`
  const files: QuadletFileSet = []

  // Collect all ports from all services for the pod
  const allPorts: QuadletEntry[] = []
  for (const name of serviceNames) {
    allPorts.push(...portEntries(services[name]))
  }

  const podIR: QuadletIR = {
    Pod: [{ key: 'PodName', value: podName }],
  }
  if (allPorts.length) {
    podIR.Pod.push(...allPorts)
  }

  files.push({ filename: podFile, ir: podIR })

  // Container files: omit ports, reference the pod
  for (const name of serviceNames) {
    files.push({
      filename: `${name}.container`,
      ir: composeServiceToQuadletIR(name, services[name], {
        omitPorts: true,
        pod: podFile,
      }),
    })
  }

  return files
}

/** Convert QuadletIR to a ComposeFile (single service). */
export function quadletIRToCompose(ir: QuadletIR, serviceName: string): ComposeFile {
  const service: Service = {}
  const containerEntries = ir['Container'] ?? []
  const serviceEntries = ir['Service'] ?? []

  for (const { key, value } of containerEntries) {
    switch (key) {
      case 'Image':
        service.image = value
        break
      case 'Network':
        if (['host', 'none', 'bridge', 'slirp4netns'].includes(value)) {
          service.network_mode = value
        } else {
          if (!service.networks) service.networks = [] as string[]
          ;(service.networks as string[]).push(value)
        }
        break
      case 'PublishPort':
        if (!service.ports) service.ports = []
        service.ports.push(value)
        break
      case 'Volume':
        if (!service.volumes) service.volumes = []
        service.volumes.push(value)
        break
      case 'Environment':
        if (!service.environment) service.environment = [] as string[]
        ;(service.environment as string[]).push(value)
        break
      case 'ContainerName':
        service.container_name = value
        break
      case 'User':
        service.user = value
        break
      case 'HostName':
        service.hostname = value
        break
      case 'Exec':
        service.command = value
        break
      case 'Entrypoint':
        service.entrypoint = value
        break
      case 'WorkingDir':
        service.working_dir = value
        break
      case 'AddCapability':
        if (!service.cap_add) service.cap_add = []
        service.cap_add.push(value)
        break
      case 'DropCapability':
        if (!service.cap_drop) service.cap_drop = []
        service.cap_drop.push(value)
        break
      case 'DNS':
        if (!service.dns) service.dns = [] as string[]
        ;(service.dns as string[]).push(value)
        break
      case 'DNSSearch':
        if (!service.dns_search) service.dns_search = [] as string[]
        ;(service.dns_search as string[]).push(value)
        break
      case 'Label':
        if (!service.labels) service.labels = [] as string[]
        ;(service.labels as string[]).push(value)
        break
      case 'ExposeHostPort':
        if (!service.expose) service.expose = []
        service.expose.push(value)
        break
      case 'AddHost':
        if (!service.extra_hosts) service.extra_hosts = [] as string[]
        ;(service.extra_hosts as string[]).push(value)
        break
      case 'EnvironmentFile':
        if (!service.env_file) service.env_file = [] as string[]
        ;(service.env_file as string[]).push(value)
        break
      case 'ReadOnly':
        service.read_only = value === 'true'
        break
      case 'Tmpfs':
        if (!service.tmpfs) service.tmpfs = [] as string[]
        ;(service.tmpfs as string[]).push(value)
        break
      case 'ShmSize':
        service.shm_size = value
        break
      case 'Sysctl':
        if (!service.sysctls) service.sysctls = [] as string[]
        ;(service.sysctls as string[]).push(value)
        break
      case 'StopSignal':
        service.stop_signal = value
        break
      case 'StopTimeout':
        service.stop_grace_period = secondsToDuration(parseInt(value, 10))
        break
      case 'LogDriver':
        if (!service.logging) service.logging = {}
        service.logging.driver = value
        break
      case 'GroupAdd':
        if (!service.group_add) service.group_add = []
        service.group_add.push(value)
        break
      case 'UserNS':
        service.userns_mode = value
        break
      case 'Annotation':
        if (!service.annotations) service.annotations = [] as string[]
        ;(service.annotations as string[]).push(value)
        break
      case 'HealthCmd':
        if (!service.healthcheck) service.healthcheck = {}
        service.healthcheck.test = value
        break
      case 'HealthInterval':
        if (!service.healthcheck) service.healthcheck = {}
        service.healthcheck.interval = value
        break
      case 'HealthRetries':
        if (!service.healthcheck) service.healthcheck = {}
        service.healthcheck.retries = parseInt(value, 10)
        break
      case 'HealthTimeout':
        if (!service.healthcheck) service.healthcheck = {}
        service.healthcheck.timeout = value
        break
      case 'HealthStartPeriod':
        if (!service.healthcheck) service.healthcheck = {}
        service.healthcheck.start_period = value
        break
      case 'HealthStartupInterval':
        if (!service.healthcheck) service.healthcheck = {}
        service.healthcheck.start_interval = value
        break
      case 'SecurityLabelType':
        if (!service.security_opt) service.security_opt = []
        service.security_opt.push(`label:type:${value}`)
        break
      case 'SecurityLabelLevel':
        if (!service.security_opt) service.security_opt = []
        service.security_opt.push(`label:level:${value}`)
        break
      case 'SecurityLabelDisable':
        if (value === 'true') {
          if (!service.security_opt) service.security_opt = []
          service.security_opt.push('label:disable')
        }
        break
      case 'NoNewPrivileges':
        if (value === 'true') {
          if (!service.security_opt) service.security_opt = []
          service.security_opt.push('no-new-privileges')
        }
        break
      case 'SeccompProfile':
        if (!service.security_opt) service.security_opt = []
        service.security_opt.push(`seccomp:${value}`)
        break
      case 'PodmanArgs':
        if (value === '--privileged') {
          service.privileged = true
        } else if (value.startsWith('--security-opt=')) {
          if (!service.security_opt) service.security_opt = []
          service.security_opt.push(value.slice('--security-opt='.length))
        }
        break
      case 'Secret': {
        if (!service.secrets) service.secrets = []
        const commaIdx = value.indexOf(',')
        if (commaIdx === -1) {
          service.secrets.push(value)
        } else {
          const name = value.slice(0, commaIdx)
          const opts = Object.fromEntries(
            value.slice(commaIdx + 1).split(',').map(p => p.split('=', 2) as [string, string])
          )
          service.secrets.push({
            source: name,
            ...(opts.target && { target: opts.target }),
            ...(opts.uid && { uid: opts.uid }),
            ...(opts.gid && { gid: opts.gid }),
            ...(opts.mode != null && { mode: parseInt(opts.mode, 10) }),
          })
        }
        break
      }
      case 'AddDevice':
        if (value.startsWith('/dev/')) {
          if (!service.devices) service.devices = []
          service.devices.push(value)
        } else {
          // Parse CDI format: driver.com/gpu=count_or_id
          const cdiMatch = value.match(/^(.+)\.com\/gpu=(.+)$/)
          if (cdiMatch) {
            if (!service.deploy) service.deploy = {}
            if (!service.deploy.resources) service.deploy.resources = {}
            if (!service.deploy.resources.reservations) service.deploy.resources.reservations = {}
            if (!service.deploy.resources.reservations.devices) service.deploy.resources.reservations.devices = []
            service.deploy.resources.reservations.devices.push({
              driver: cdiMatch[1],
              count: cdiMatch[2],
              capabilities: ['gpu'],
            })
          }
        }
        break
    }
  }

  for (const { key, value } of serviceEntries) {
    switch (key) {
      case 'Restart':
        service.restart = restartToCompose[value] ?? value
        break
      case 'CPUQuota': {
        if (!service.deploy) service.deploy = {}
        if (!service.deploy.resources) service.deploy.resources = {}
        if (!service.deploy.resources.limits) service.deploy.resources.limits = {}
        const pct = parseFloat(value)
        service.deploy.resources.limits.cpus = String(pct / 100)
        break
      }
      case 'MemoryMax':
        if (!service.deploy) service.deploy = {}
        if (!service.deploy.resources) service.deploy.resources = {}
        if (!service.deploy.resources.limits) service.deploy.resources.limits = {}
        service.deploy.resources.limits.memory = value
        break
    }
  }

  return {
    services: {
      [serviceName]: service,
    },
  }
}
