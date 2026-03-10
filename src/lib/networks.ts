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

/** Convert a compose network definition to a [Network] quadlet IR. Returns null for external networks. */
export function composeNetworkToQuadletIR(name: string, network: Network | undefined): QuadletIR | null {
  if (network == null) {
    // Bare network name with no config — still generate a .network file
    return { Network: [{ key: 'NetworkName', value: name }] }
  }
  // External networks already exist; don't generate a file
  if (network.external) return null

  const entries: QuadletEntry[] = []
  entries.push({ key: 'NetworkName', value: name })
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
  return { Network: entries }
}
