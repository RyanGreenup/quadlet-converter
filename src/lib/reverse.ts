import type { Service } from './compose/index.js'
import type { ComposeFile } from './compose/index.js'
import type { QuadletIR } from './quadlet.js'
import { applyPodmanArg } from './podman-args.js'
import { parseBytes, formatBytes } from './bytes.js'

const restartToCompose: Record<string, string> = {
  'no': 'no',
  'always': 'unless-stopped',
  'on-failure': 'on-failure',
}

/** Convert integer seconds to a compose duration string. */
function secondsToDuration(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    return `${seconds / 60}m`
  }
  return `${seconds}s`
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
      case 'PidHost':
        if (value === 'true') service.pid = 'host'
        break
      case 'PodmanArgs':
        applyPodmanArg(service, value)
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

  let rawMemorySwapMax: string | undefined
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
      case 'CPUShares':
        service.cpu_shares = parseInt(value, 10)
        break
      case 'CPUQuotaPeriodSec': {
        const sec = parseFloat(value)
        service.cpu_period = String(Math.round(sec * 1_000_000))
        break
      }
      case 'AllowedCPUs':
        service.cpuset = value
        break
      case 'MemoryLow':
        service.mem_reservation = value
        break
      case 'MemorySwapMax':
        rawMemorySwapMax = value
        break
      case 'TasksMax':
        service.pids_limit = parseInt(value, 10)
        break
      case 'OOMScoreAdjust':
        service.oom_score_adj = parseInt(value, 10)
        break
      case 'ExecStartPost': {
        const postMatch = value.match(/^podman exec \S+ (.+)$/)
        if (postMatch) {
          if (!service.post_start) service.post_start = []
          service.post_start.push({ command: postMatch[1] })
        }
        break
      }
      case 'ExecStopPre': {
        const stopMatch = value.match(/^podman exec \S+ (.+)$/)
        if (stopMatch) {
          if (!service.pre_stop) service.pre_stop = []
          service.pre_stop.push({ command: stopMatch[1] })
        }
        break
      }
    }
  }

  // Compute memswap_limit (combined memory+swap) from MemorySwapMax (swap-only)
  if (rawMemorySwapMax != null) {
    const memValue = service.deploy?.resources?.limits?.memory ?? (service.mem_limit != null ? String(service.mem_limit) : undefined)
    if (rawMemorySwapMax === '0' && memValue != null) {
      service.memswap_limit = memValue
    } else if (memValue != null) {
      const memMax = parseBytes(memValue)
      const swapMax = parseBytes(rawMemorySwapMax)
      service.memswap_limit = formatBytes(memMax + swapMax)
    } else {
      service.memswap_limit = rawMemorySwapMax
    }
  }

  // Reverse depends_on from Unit (After/Requires)
  // Note: service_healthy is expressed via Notify=healthy on the *dependency*
  // container, which we can't see from a single IR. All deps become service_started.
  const unitEntries = ir['Unit'] ?? []
  const afterDeps = new Set<string>()

  for (const { key, value } of unitEntries) {
    const depName = value.replace(/\.service$/, '')
    if (key === 'After') afterDeps.add(depName)
  }

  if (afterDeps.size > 0) {
    const depends_on: Record<string, { condition: 'service_started' }> = {}
    for (const dep of afterDeps) {
      depends_on[dep] = { condition: 'service_started' }
    }
    service.depends_on = depends_on
  }

  return {
    services: {
      [serviceName]: service,
    },
  }
}
