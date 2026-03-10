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

  if (service.entrypoint != null) {
    if (Array.isArray(service.entrypoint)) {
      container.push({ key: 'Entrypoint', value: service.entrypoint.join(' ') })
    } else {
      container.push({ key: 'Entrypoint', value: service.entrypoint })
    }
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
      case 'Entrypoint':
        service.entrypoint = value
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
