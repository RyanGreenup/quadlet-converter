import type { Service } from './compose/index.js'

const INCOMPATIBLE_MODES = ['host', 'none', 'slirp4netns', 'pasta']

/** NetworkAlias only works with bridge networks. Returns false for host, none, slirp4netns, pasta, container:*, and service:* modes. */
export function canUseNetworkAlias(service: Service): boolean {
  const mode = service.network_mode
  if (!mode || mode === 'bridge') return true
  if (INCOMPATIBLE_MODES.includes(mode)) return false
  if (mode.startsWith('container:') || mode.startsWith('service:')) return false
  return false
}
