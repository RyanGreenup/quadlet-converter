import type { Service } from './compose/service.js'

export type Severity = 'warning' | 'suggestion'

export interface CheckResult {
  id: string
  message: string
  severity: Severity
}

const SENSITIVE_PATHS = [
  '/', '/etc', '/proc', '/sys', '/dev',
  '/var/run/docker.sock', '/run/docker.sock',
  '/var/run/podman/podman.sock', '/run/podman/podman.sock',
  '/boot', '/lib', '/usr', '/sbin', '/bin',
]

const DANGEROUS_CAPABILITIES = [
  'ALL', 'SYS_ADMIN', 'NET_ADMIN', 'SYS_PTRACE', 'SYS_RAWIO',
  'SYS_MODULE', 'DAC_OVERRIDE', 'NET_RAW', 'MKNOD', 'SYS_CHROOT',
  'AUDIT_WRITE', 'SETUID', 'SETGID', 'MAC_ADMIN', 'MAC_OVERRIDE',
  'DAC_READ_SEARCH', 'LINUX_IMMUTABLE', 'SYS_BOOT',
]

/** Extract bind mount sources from a service's volumes. */
export function getBindMountSources(service: Service): { source: string; display: string }[] {
  if (!service.volumes) return []
  const results: { source: string; display: string }[] = []
  for (const vol of service.volumes) {
    const source = typeof vol === 'string' ? vol.split(':')[0] : vol.source ?? ''
    const isBind = source.startsWith('.') || source.startsWith('/') || source.startsWith('~')
    if (!isBind) continue
    const display = typeof vol === 'string' ? vol : [vol.source, vol.target].filter(Boolean).join(':')
    results.push({ source, display })
  }
  return results
}

function isSensitivePath(source: string): boolean {
  return SENSITIVE_PATHS.some(p =>
    source === p || source.startsWith(p + '/'),
  )
}

function hasMemoryLimit(service: Service): boolean {
  return !!(service.mem_limit || service.deploy?.resources?.limits?.memory)
}

function hasCpuLimit(service: Service): boolean {
  return !!(service.cpus || service.deploy?.resources?.limits?.cpus)
}

function isTrueish(val: unknown): boolean {
  return val === true || val === 'true'
}

export function checkService(name: string, service: Service): CheckResult[] {
  const results: CheckResult[] = []

  // --- Warnings ---

  if (isTrueish(service.privileged)) {
    results.push({ id: 'privileged', severity: 'warning', message: `${name}: privileged mode grants full host access` })
  }

  if (service.network_mode === 'host') {
    results.push({ id: 'network-host', severity: 'warning', message: `${name}: host network mode disables network isolation` })
  }

  if (service.pid === 'host') {
    results.push({ id: 'pid-host', severity: 'warning', message: `${name}: host PID namespace exposes all host processes` })
  }

  if (service.ipc === 'host') {
    results.push({ id: 'ipc-host', severity: 'warning', message: `${name}: host IPC namespace shares memory with host` })
  }

  if (service.security_opt) {
    for (const opt of service.security_opt) {
      if (opt === 'label:disable') {
        results.push({ id: 'selinux-disable', severity: 'warning', message: `${name}: SELinux labeling is disabled (label:disable)` })
      }
      if (opt === 'apparmor:unconfined') {
        results.push({ id: 'apparmor-unconfined', severity: 'warning', message: `${name}: AppArmor is unconfined` })
      }
    }
  }

  const binds = getBindMountSources(service)
  for (const { source, display } of binds) {
    if (isSensitivePath(source)) {
      results.push({ id: 'sensitive-mount', severity: 'warning', message: `${name}: sensitive host path mounted: ${display}` })
    }
  }

  if (service.cap_add) {
    const dangerousSet = new Set(DANGEROUS_CAPABILITIES)
    for (const cap of service.cap_add) {
      if (dangerousSet.has(cap.toUpperCase())) {
        results.push({ id: 'dangerous-cap', severity: 'warning', message: `${name}: dangerous capability added: ${cap}` })
      }
    }
  }

  if (service.restart === 'always' && !hasMemoryLimit(service) && !hasCpuLimit(service)) {
    results.push({ id: 'restart-no-limits', severity: 'warning', message: `${name}: restart "always" without resource limits risks crash loops exhausting host` })
  }

  // SELinux volume labels
  for (const vol of service.volumes ?? []) {
    const source = typeof vol === 'string' ? vol.split(':')[0] : vol.source ?? ''
    const isBind = source.startsWith('.') || source.startsWith('/') || source.startsWith('~')
    if (!isBind) continue
    const display = typeof vol === 'string' ? vol : [vol.source, vol.target].filter(Boolean).join(':')
    const hasLabel = typeof vol === 'string'
      ? /:[zZ]$/.test(vol) || /:[^:]*[zZ][^:]*$/.test(vol)
      : vol.bind?.selinux != null
    if (!hasLabel) {
      results.push({ id: 'selinux-label', severity: 'warning', message: `${name}: volume "${display}" has no SELinux label (:z or :Z)` })
    }
  }

  // --- Suggestions ---

  if (!isTrueish(service.read_only)) {
    results.push({ id: 'no-read-only', severity: 'suggestion', message: `${name}: consider setting read_only: true for a read-only root filesystem` })
  }

  if (!hasMemoryLimit(service)) {
    results.push({ id: 'no-memory-limit', severity: 'suggestion', message: `${name}: no memory limit set` })
  }

  if (!hasCpuLimit(service)) {
    results.push({ id: 'no-cpu-limit', severity: 'suggestion', message: `${name}: no CPU limit set` })
  }

  if (!service.healthcheck || (Array.isArray(service.healthcheck.test) && service.healthcheck.test.length === 1 && service.healthcheck.test[0] === 'NONE')) {
    results.push({ id: 'no-healthcheck', severity: 'suggestion', message: `${name}: no healthcheck defined` })
  }

  if (!service.security_opt?.some(opt => opt === 'no-new-privileges' || opt === 'no-new-privileges:true' || opt === 'no-new-privileges=true')) {
    results.push({ id: 'no-new-privileges', severity: 'suggestion', message: `${name}: consider adding no-new-privileges to security_opt` })
  }

  if (!service.userns_mode) {
    results.push({ id: 'no-userns', severity: 'suggestion', message: `${name}: consider setting userns_mode for user namespace remapping` })
  }

  return results
}
