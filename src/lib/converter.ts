import type { Service } from './compose/index.js'
import type { ComposeFile } from './compose/index.js'
import type { QuadletIR, QuadletEntry } from './quadlet.js'
import { serviceToPodmanArgs } from './podman-args.js'
import { scaleService } from './scale.js'
import { parseBytes, formatBytes } from './bytes.js'
import { analyzeNetworks, composeNetworkToQuadletIR } from './networks.js'

export { quadletIRToCompose } from './reverse.js'

export interface ComposeToQuadletOpts {
  build?: boolean
  startPort?: number
  usePod?: boolean
}

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

/** Convert a single compose service to QuadletIR. */
export function composeServiceToQuadletIR(
  name: string,
  service: Service,
  opts?: { omitPorts?: boolean; pod?: string; build?: boolean },
): QuadletIR {
  const container: QuadletEntry[] = []
  const svcSection: QuadletEntry[] = []

  if (opts?.build && service.build) {
    const image = service.image ?? `localhost/${name}`
    container.push({ key: 'Image', value: image })
  } else if (service.image) {
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

  // Skip Network= when in a pod — pods own the network namespace
  if (service.networks && !opts?.pod) {
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

  // DropCapability must come before AddCapability — Podman processes
  // --cap-drop before --cap-add, so drop ALL then add specific ones back.
  if (service.cap_drop) {
    for (const cap of service.cap_drop) {
      container.push({ key: 'DropCapability', value: cap })
    }
  }
  if (service.cap_add) {
    for (const cap of service.cap_add) {
      container.push({ key: 'AddCapability', value: cap })
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

  // expose is inter-container only (documents ports for service discovery);
  // it does not publish to the host, so we intentionally skip it.

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

  // security_opt PodmanArgs fallback is intentionally inline here (mixes native quadlet keys)
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

  if (service.pid === 'host') {
    container.push({ key: 'PidHost', value: 'true' })
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

  // Group 1: CPU mappings (standalone compose fields)
  if (service.cpus != null) {
    const pct = Math.round(parseFloat(String(service.cpus)) * 100)
    svcSection.push({ key: 'CPUQuota', value: `${pct}%` })
  }
  if (service.cpu_shares != null) {
    svcSection.push({ key: 'CPUShares', value: String(service.cpu_shares) })
  }
  if (service.cpu_quota != null) {
    svcSection.push({ key: 'CPUQuota', value: String(service.cpu_quota) })
  }
  if (service.cpu_period != null) {
    const us = parseFloat(String(service.cpu_period))
    svcSection.push({ key: 'CPUQuotaPeriodSec', value: String(us / 1_000_000) })
  }
  if (service.cpuset) {
    svcSection.push({ key: 'AllowedCPUs', value: service.cpuset })
  }

  // Group 2: Memory/resource mappings
  if (service.mem_limit != null) {
    svcSection.push({ key: 'MemoryMax', value: String(service.mem_limit) })
  }
  if (service.mem_reservation != null) {
    svcSection.push({ key: 'MemoryLow', value: String(service.mem_reservation) })
  }
  if (service.memswap_limit != null) {
    if (service.mem_limit != null) {
      const swap = parseBytes(service.memswap_limit) - parseBytes(service.mem_limit)
      svcSection.push({ key: 'MemorySwapMax', value: swap <= 0 ? '0' : formatBytes(swap) })
    } else {
      svcSection.push({ key: 'MemorySwapMax', value: String(service.memswap_limit) })
    }
  }
  if (service.mem_swappiness != null) {
    container.push({ key: 'PodmanArgs', value: `--memory-swappiness=${service.mem_swappiness}` })
  }
  if (service.pids_limit != null) {
    svcSection.push({ key: 'TasksMax', value: String(service.pids_limit) })
  }
  if (service.oom_score_adj != null) {
    svcSection.push({ key: 'OOMScoreAdjust', value: String(service.oom_score_adj) })
  }

  // Group 3: Lifecycle hooks
  if (service.post_start) {
    for (const hook of service.post_start) {
      const cmd = Array.isArray(hook.command) ? hook.command.join(' ') : hook.command
      svcSection.push({ key: 'ExecStartPost', value: `podman exec ${name} ${cmd}` })
    }
  }
  if (service.pre_stop) {
    for (const hook of service.pre_stop) {
      const cmd = Array.isArray(hook.command) ? hook.command.join(' ') : hook.command
      svcSection.push({ key: 'ExecStopPre', value: `podman exec ${name} ${cmd}` })
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

  const unitSection: QuadletEntry[] = []

  if (service.depends_on) {
    const deps: Array<{ name: string; condition: string }> = []
    if (Array.isArray(service.depends_on)) {
      for (const dep of service.depends_on) {
        deps.push({ name: dep, condition: 'service_started' })
      }
    } else {
      for (const [dep, config] of Object.entries(service.depends_on)) {
        deps.push({ name: dep, condition: config.condition })
      }
    }

    for (const { name, condition } of deps) {
      const unit = `${name}.service`
      unitSection.push({ key: 'After', value: unit })
      // All conditions get Requires= — for service_healthy, the dependency
      // container uses Notify=healthy so systemd waits for it automatically.
      unitSection.push({ key: 'Requires', value: unit })
    }
  }

  container.push(...serviceToPodmanArgs(service))

  const ir: QuadletIR = {}
  if (unitSection.length) ir['Unit'] = unitSection
  if (container.length) ir['Container'] = container
  if (svcSection.length) ir['Service'] = svcSection
  if (service.restart && service.restart !== 'no') {
    ir['Install'] = [{ key: 'WantedBy', value: 'default.target' }]
  }

  return ir
}

/** Extract PublishPort entries from a service's ports. */
export function portEntries(service: Service): QuadletEntry[] {
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

const VARIABLE_RE = /\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*/

export interface UnresolvedVariable {
  service: string
  field: string
  value: string
}

/** Scan a compose file for unresolved ${VAR} / $VAR references in service fields. */
export function detectUnresolvedVariables(compose: ComposeFile): UnresolvedVariable[] {
  const results: UnresolvedVariable[] = []
  for (const [name, service] of Object.entries(compose.services ?? {})) {
    const check = (field: string, val: unknown) => {
      if (typeof val === 'string' && VARIABLE_RE.test(val)) {
        results.push({ service: name, field, value: val })
      }
    }

    if (service.ports) {
      for (const port of service.ports) {
        if (typeof port === 'string' || typeof port === 'number') {
          check('ports', String(port))
        } else {
          if (port.published != null) check('ports.published', String(port.published))
          if (port.target != null) check('ports.target', String(port.target))
          if (port.host_ip) check('ports.host_ip', port.host_ip)
        }
      }
    }

    if (service.environment) {
      if (Array.isArray(service.environment)) {
        for (const env of service.environment) check('environment', String(env))
      } else {
        for (const [k, v] of Object.entries(service.environment)) {
          if (v != null) check('environment', `${k}=${v}`)
        }
      }
    }

    check('image', service.image)

    if (service.volumes) {
      for (const vol of service.volumes) {
        if (typeof vol === 'string') check('volumes', vol)
        else {
          if (vol.source) check('volumes.source', vol.source)
          if (vol.target) check('volumes.target', vol.target)
        }
      }
    }
  }
  return results
}

/** Convert an entire compose file to a set of quadlet files. */
export function composeToQuadletFiles(compose: ComposeFile, podName: string, opts?: ComposeToQuadletOpts): QuadletFileSet {
  const services = compose.services ?? {}
  const serviceNames = Object.keys(services)

  if (serviceNames.length === 0) return []

  // Partition services into scaled and non-scaled
  const scaledFiles: QuadletFileSet = []
  const normalNames: string[] = []

  for (const name of serviceNames) {
    const service = services[name]
    const scale = typeof service.scale === 'string' ? parseInt(service.scale, 10) : service.scale
    if (scale != null && scale > 1) {
      scaledFiles.push(...scaleService(name, service, scale, {
        startPort: opts?.startPort,
        usePod: opts?.usePod,
        build: opts?.build,
      }))
    } else {
      normalNames.push(name)
    }
  }

  // If only scaled services, return them directly
  if (normalNames.length === 0) return scaledFiles

  // Single non-scaled service and no scaled: no pod needed
  if (normalNames.length === 1 && scaledFiles.length === 0) {
    const name = normalNames[0]
    return [{
      filename: `${name}.container`,
      ir: composeServiceToQuadletIR(name, services[name], { build: opts?.build }),
    }]
  }

  // Collect services that need Notify=healthy (depended on with service_healthy)
  const healthyDeps = new Set<string>()
  for (const service of Object.values(services)) {
    if (service.depends_on && !Array.isArray(service.depends_on)) {
      for (const [dep, config] of Object.entries(service.depends_on)) {
        if (config.condition === 'service_healthy') healthyDeps.add(dep)
      }
    }
  }

  const { canUsePod } = analyzeNetworks(normalNames, services)
  const normalNameSet = new Set(normalNames)

  if (!canUsePod || opts?.usePod === false) {
    // Multi-network path: standalone containers with Network= entries (no pod)
    const files: QuadletFileSet = []

    // Generate .network files for each non-external compose network
    const composeNetworks = compose.networks ?? {}
    const generatedNetworks = new Set<string>()
    for (const name of normalNames) {
      const svc = services[name]
      const nets = svc.networks
        ? (Array.isArray(svc.networks) ? svc.networks : Object.keys(svc.networks))
        : []
      for (const net of nets) {
        if (generatedNetworks.has(net)) continue
        generatedNetworks.add(net)
        const networkDef = composeNetworks[net]
        const ir = composeNetworkToQuadletIR(net, networkDef)
        if (ir) files.push({ filename: `${net}.network`, ir })
      }
    }

    // Generate prefixed container files
    for (const name of normalNames) {
      const ir = composeServiceToQuadletIR(name, services[name], {
        build: opts?.build,
      })

      // Rewrite Network= values to .network references
      if (ir.Container) {
        for (const entry of ir.Container) {
          if (entry.key === 'Network' && generatedNetworks.has(entry.value)) {
            entry.value = `${entry.value}.network`
          }
        }
      }

      // Rewrite After=/Requires= to use prefixed service names for deps in this project
      if (ir.Unit) {
        for (const entry of ir.Unit) {
          if (entry.key === 'After' || entry.key === 'Requires') {
            const depName = entry.value.replace(/\.service$/, '')
            if (normalNameSet.has(depName)) {
              entry.value = `${podName}-${depName}.service`
            }
          }
        }
      }

      if (healthyDeps.has(name)) {
        if (!ir.Container) ir.Container = []
        ir.Container.push({ key: 'Notify', value: 'healthy' })
      }

      files.push({ filename: `${podName}-${name}.container`, ir })
    }

    return [...files, ...scaledFiles]
  }

  // Single-network (or no-network) path: create a pod + container files
  const podFile = `${podName}.pod`
  const files: QuadletFileSet = []

  // Collect all ports from non-scaled services for the pod
  const allPorts: QuadletEntry[] = []
  for (const name of normalNames) {
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
  for (const name of normalNames) {
    const ir = composeServiceToQuadletIR(name, services[name], {
      omitPorts: true,
      pod: podFile,
      build: opts?.build,
    })
    // Add Notify=healthy so systemd waits for the healthcheck before
    // considering the service started (used by service_healthy deps)
    if (healthyDeps.has(name)) {
      if (!ir.Container) ir.Container = []
      ir.Container.push({ key: 'Notify', value: 'healthy' })
    }
    files.push({ filename: `${name}.container`, ir })
  }

  return [...files, ...scaledFiles]
}
