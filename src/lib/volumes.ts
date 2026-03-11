import type { Volume } from './compose/index.js'
import type { QuadletIR, QuadletEntry } from './quadlet.js'

/**
 * Resolve the effective volume name.
 * Compose auto-names volumes as `<project>_<key>` unless an explicit `name:` is set.
 */
export function resolveVolumeName(projectName: string, key: string, volume: Volume | undefined): string {
  if (volume != null && typeof volume === 'object' && volume.name) return volume.name
  return `${projectName}_${key}`
}

/** Convert a compose volume definition to a [Volume] quadlet IR. Returns null for external volumes. */
export function composeVolumeToQuadletIR(projectName: string, key: string, volume: Volume | undefined): QuadletIR | null {
  if (volume != null && typeof volume === 'object' && volume.external) return null

  const volumeName = resolveVolumeName(projectName, key, volume)
  const entries: QuadletEntry[] = []
  entries.push({ key: 'VolumeName', value: volumeName })
  if (volume != null && typeof volume === 'object') {
    if (volume.driver) entries.push({ key: 'Driver', value: volume.driver })
    if (volume.labels) {
      if (Array.isArray(volume.labels)) {
        for (const label of volume.labels) entries.push({ key: 'Label', value: String(label) })
      } else {
        for (const [k, v] of Object.entries(volume.labels)) {
          entries.push({ key: 'Label', value: v != null ? `${k}=${v}` : k })
        }
      }
    }
  }
  return { Volume: entries }
}
