import type { Service, Network } from './compose/index.js'
import type { QuadletIR, QuadletEntry } from './quadlet.js'

/** Analyze networks across services to determine if a pod can be used. */
export function analyzeNetworks(
  serviceNames: string[],
  services: Record<string, Service>,
): { canUsePod: boolean; distinctNetworks: Set<string> } {
  const distinctNetworks = new Set<string>()
  for (const name of serviceNames) {
    const svc = services[name]
    if (svc.networks) {
      if (Array.isArray(svc.networks)) {
        for (const net of svc.networks) distinctNetworks.add(net)
      } else {
        for (const net of Object.keys(svc.networks)) distinctNetworks.add(net)
      }
    }
  }
  return { canUsePod: distinctNetworks.size <= 1, distinctNetworks }
}

/**
 * Resolve the effective network name.
 * Compose auto-names networks as `<project>_<key>` unless an explicit `name:` is set.
 */
export function resolveNetworkName(projectName: string, key: string, network: Network | undefined): string {
  if (network != null && typeof network === 'object' && network.name) return network.name
  return `${projectName}_${key}`
}

/** Convert a compose network definition to a [Network] quadlet IR. Returns null for external networks. */
export function composeNetworkToQuadletIR(projectName: string, key: string, network: Network | undefined): QuadletIR | null {
  if (network != null && typeof network === 'object' && network.external) return null

  const networkName = resolveNetworkName(projectName, key, network)
  const entries: QuadletEntry[] = []
  entries.push({ key: 'NetworkName', value: networkName })
  if (network != null && typeof network === 'object') {
    if (network.driver) entries.push({ key: 'Driver', value: network.driver })
    if (network.internal === true || network.internal === 'true') {
      entries.push({ key: 'Internal', value: 'true' })
    }
    if (network.labels) {
      if (Array.isArray(network.labels)) {
        for (const label of network.labels) entries.push({ key: 'Label', value: String(label) })
      } else {
        for (const [k, v] of Object.entries(network.labels)) {
          entries.push({ key: 'Label', value: v != null ? `${k}=${v}` : k })
        }
      }
    }
    if (network.ipam?.config) {
      for (const cfg of network.ipam.config) {
        if (cfg.subnet) entries.push({ key: 'Subnet', value: cfg.subnet })
        if (cfg.gateway) entries.push({ key: 'Gateway', value: cfg.gateway })
        if (cfg.ip_range) entries.push({ key: 'IPRange', value: cfg.ip_range })
      }
    }
  }
  return { Network: entries }
}
